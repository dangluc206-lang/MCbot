'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const { compactItemLabel, itemLabels, normalizeItemLabel } = require('../utils/ItemLabels');

const DEFAULT_SETTINGS = Object.freeze({
    command: '/pv 2',
    guiTimeoutMs: 5000,
    // MinerUA rejects a second /pv command for roughly five seconds. The
    // small buffer avoids sending exactly on the server-side boundary.
    commandCooldownMs: 5500,
    guiRetryAttempts: 1,
    // Mineflayer's container API can move an exact amount and preserves the
    // rest of a custom-item stack in /pv 2.  Do not use a shift-click here:
    // B3/B4 stacks are intentionally withdrawn just-in-time by Crafting.
    exactWithdraw: true,
    transferMode: 1,
    transferDelayMs: 250,
    reserveInventorySlots: 4,
    depositAfterCraft: true
});

/**
 * Reads and withdraws items from the player's configured personal vault.
 * CraftingService supplies the recipe-aware list of items to withdraw; this
 * service only owns the reusable /pv GUI interaction.
 */
class PersonalVaultService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'PersonalVaultService';
        this.events = ctx.getManager('events');
        this.gui = ctx.getService('gui');
        this.chat = ctx.getService('chat');
        this.busy = false;
        this.lastCommandAt = 0;
    }

    settings() {
        const configured = this.config.crafting?.personalVault || {};
        return { ...DEFAULT_SETTINGS, ...configured };
    }

    /** Opens /pv 2, snapshots the container, then closes it. */
    async refresh() {
        return this._withVault(async window => {
            const items = this._snapshot(window);
            this._setState({
                status: 'READY',
                items,
                updatedAt: Date.now(),
                lastError: null
            });
            this.success(`Đã đọc /pv 2: ${items.length} stack, ${items.reduce((total, item) => total + item.count, 0)} item.`);
            return Result.SUCCESS;
        });
    }

    /**
     * Withdraws the exact configured recipe amounts from /pv 2 into player
     * inventory.  The remaining part of each stack stays in /pv 2.
     *
     * @param {Array<{slot:Number,name:String,aliases?:String[],amount:Number}>} requests
     * A successful move is considered success even when a stale overflow
     * request no longer exists: the server may have consumed that intermediate
     * in the final SHK click after the inventory snapshot was taken.
     *
     * @returns {Promise<String>}
     */
    async withdraw(requests = []) {
        const pending = requests
            .map(request => ({ ...request, amount: Number(request.amount) }))
            .filter(request => Number.isFinite(request.amount) && request.amount > 0);
        if (pending.length === 0) return Result.NO_ACTION;

        return this._withVault(async window => {
            const settings = this.settings();
            const items = this._snapshot(window);
            const moved = [];
            const missing = [];

            for (const request of pending) {
                let remaining = request.amount;
                const candidates = items.filter(item => this._matches(item, request));
                for (const item of candidates) {
                    if (remaining <= 0) break;
                    if (!window.slots?.[item.slot]) continue;
                    const freeSlots = this.service('inventory')?.countEmptySlots?.() ?? this.state.inventory.emptySlots ?? 0;
                    if (this.state.inventory.full || freeSlots <= this._reserveInventorySlots()) {
                        this._setState({ status: 'FAILED', lastError: 'Inventory đầy khi rút đồ từ /pv 2.' });
                        return Result.NO_FREE_SLOT;
                    }

                    // Prismarine Window items do not carry their own slot
                    // index. Preserve the snapshot slot for the component-
                    // aware, slot-specific exact-transfer fallback.
                    const source = { ...window.slots[item.slot], slot: item.slot };
                    const movedCount = Math.min(remaining, Math.max(0, Number(item.count) || 0));
                    const result = await this._withdrawExact(window, source, movedCount, settings);
                    if (result !== Result.SUCCESS) {
                        this._setState({ status: 'FAILED', lastError: `Không rút được ${request.name} ở slot ${item.slot}: ${result}.` });
                        return result;
                    }

                    remaining -= movedCount;
                    moved.push({
                        slot: request.slot,
                        name: request.name,
                        sourceSlot: item.slot,
                        count: movedCount
                    });
                    item.count = Math.max(0, item.count - movedCount);
                    this.service('inventory')?.sync?.();
                    if (this._transferDelay() > 0) await this.manager('scheduler')?.sleep(this._transferDelay());
                }
                if (remaining > 0) missing.push({ name: request.name, amount: remaining });
            }

            const remainingItems = items.filter(item => item.count > 0);
            this._setState({
                status: missing.length ? 'PARTIAL' : 'READY',
                items: remainingItems,
                updatedAt: Date.now(),
                lastError: missing.length
                    ? `Không đủ item trong /pv 2: ${missing.map(item => `${item.name} thiếu ${item.amount}`).join(', ')}`
                    : null,
                lastWithdrawal: {
                    moved,
                    missing,
                    updatedAt: Date.now()
                }
            });
            if (missing.length) {
                this.warn(this.state.personalVault.lastError);
                return Result.INSUFFICIENT_ITEMS;
            }

            this.success(`Đã rút ${moved.length} stack từ /pv 2 vào inventory.`);
            return Result.SUCCESS;
        });
    }

    /**
     * Shift-clicks selected player-inventory items into `/pv 2`.
     *
     * This is intentionally the inverse of withdraw(): Collector uses it only
     * after a confirmed SHK craft, so the completed item cannot be sold or
     * occupy the pickup inventory indefinitely.
     *
     * @param {Array<{name:String,aliases?:String[],amount:Number}>} requests
     * @returns {Promise<String>} SUCCESS when at least one requested stack is
     * moved; stale intermediate-overflow requests are reported as PARTIAL but
     * do not turn a successfully stored SHK into a failure.
     */
    async deposit(requests = []) {
        const pending = requests
            .map(request => ({ ...request, amount: Number(request.amount) }))
            .filter(request => typeof request.name === 'string'
                && request.name.trim()
                && Number.isFinite(request.amount)
                && request.amount > 0);
        if (pending.length === 0) return Result.NO_ACTION;

        return this._withVault(async window => {
            const settings = this.settings();
            const items = this._snapshotPlayerInventory(window);
            const moved = [];
            const missing = [];

            for (const request of pending) {
                let remaining = request.amount;
                const candidates = items.filter(item => this._matches(item, request));
                for (const item of candidates) {
                    if (remaining <= 0) break;
                    if (!window.slots?.[item.slot]) continue;

                    const configuredMode = Number(settings.transferMode);
                    const transferMode = Number.isInteger(configuredMode) ? configuredMode : 1;
                    const result = await this.gui.click(item.slot, 0, transferMode);
                    if (result !== Result.SUCCESS) {
                        this._setState({ status: 'FAILED', lastError: `Không thể cất ${request.name} vào /pv 2: ${result}.` });
                        return result;
                    }

                    remaining -= item.count;
                    moved.push({
                        name: request.name,
                        sourceSlot: item.slot,
                        count: item.count
                    });
                    item.count = 0;
                    this.service('inventory')?.sync?.();
                    if (this._transferDelay() > 0) await this.manager('scheduler')?.sleep(this._transferDelay());
                }
                if (remaining > 0) missing.push({ name: request.name, amount: remaining });
            }

            this._setState({
                status: missing.length ? 'PARTIAL' : 'READY',
                updatedAt: Date.now(),
                lastError: missing.length && moved.length === 0
                    ? `Không tìm thấy item để cất vào /pv 2: ${missing.map(item => `${item.name} thiếu ${item.amount}`).join(', ')}`
                    : null,
                lastNotice: missing.length && moved.length > 0
                    ? `Đã cất một phần; ${missing.length} yêu cầu trung gian không còn trong inventory.`
                    : null,
                lastDeposit: { moved, missing, updatedAt: Date.now() }
            });
            if (missing.length) {
                if (moved.length > 0) {
                    this.info(`Đã cất ${moved.length} stack vào /pv 2; bỏ qua ${missing.length} yêu cầu trung gian đã bị tiêu hao khi craft.`);
                    return Result.SUCCESS;
                }
                this.warn(this.state.personalVault.lastError);
                return Result.ITEM_NOT_FOUND;
            }

            this.success(`Đã cất ${moved.length} stack vào /pv 2.`);
            return Result.SUCCESS;
        });
    }

    getItems() {
        return this.state.personalVault?.items || [];
    }

    /**
     * Returns the remaining server-side command cooldown caused by the last
     * `/pv 2` request. Other GUI commands use this to avoid being ignored by
     * MinerUA immediately after the personal-vault GUI closes.
     *
     * @param {Object} settings
     * @returns {Number} milliseconds remaining, or zero when ready
     */
    commandCooldownRemainingMs(settings = this.settings()) {
        const cooldownMs = this._commandCooldownMs(settings);
        return Math.max(0, cooldownMs - (Date.now() - this.lastCommandAt));
    }

    async _withVault(operation) {
        if (!this.state.bot.connected) return Result.NOT_CONNECTED;
        if (this.busy) return Result.BUSY;
        this.gui = this.service('gui');
        this.chat = this.service('chat');
        if (!this.gui || !this.chat) return Result.FAILED;

        const settings = this.settings();
        this.busy = true;
        this._setState({ status: 'OPENING', command: settings.command, lastError: null });
        try {
            const window = await this._openVaultWindow(settings);
            return await operation(window);
        } catch (error) {
            const status = error?.code === 'TIMEOUT' ? Result.GUI_TIMEOUT : Result.FAILED;
            const message = error?.message || 'Không rõ lý do.';
            this._setState({ status: 'FAILED', lastError: message, updatedAt: Date.now() });
            this.warn(`Không thể mở ${settings.command}: ${message}`);
            return status;
        } finally {
            if (this.gui.isOpen()) {
                try {
                    await this.gui.close();
                } catch (error) {
                    this.warn(`Không thể đóng ${settings.command}: ${error.message}`);
                }
            }
            this.busy = false;
        }
    }

    async _closeOpenWindow() {
        if (!this.gui.isOpen()) return;
        const closed = this.events?.waitFor
            ? this.events.waitFor(Events.GUI.CLOSE, 1000).catch(() => null)
            : null;
        await this.gui.close();
        await closed;
    }

    /** Opens the vault with one bounded retry for server-side GUI cooldowns. */
    async _openVaultWindow(settings) {
        const retries = this._guiRetryAttempts(settings);
        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
            await this._closeOpenWindow();
            await this._waitForCommandCooldown(settings);
            let waiting;
            const sent = await this.chat.sendCommand(settings.command, {
                // Start the GUI timeout only when ChatService is actually
                // about to emit /pv, after any global post-GUI cooldown.
                beforeSend: () => { waiting = this._waitForFreshWindow(settings.guiTimeoutMs); }
            });
            if (sent !== Result.SUCCESS) {
                throw new Error(`Không thể gửi ${settings.command}: ${sent}.`);
            }
            this.lastCommandAt = Date.now();
            try {
                return await waiting;
            } catch (error) {
                lastError = error;
                if (error?.code !== 'TIMEOUT' || attempt >= retries) throw error;
                this.warn(`${settings.command} chưa mở GUI; chờ cooldown rồi thử lại (${attempt + 1}/${retries}).`);
            }
        }
        throw lastError || new Error(`Không thể mở ${settings.command}.`);
    }

    _waitForFreshWindow(timeout) {
        if (!this.events?.on || !this.events?.off) {
            return Promise.reject(new Error('Event manager chưa sẵn sàng để chờ GUI /pv 2.'));
        }
        return new Promise((resolve, reject) => {
            let timer;
            let lastChatMessage = '';
            let lastActionBar = '';
            const cleanup = () => {
                clearTimeout(timer);
                this.events.off(Events.GUI.OPEN, onOpen);
                this.events.off(Events.Player.MESSAGE, onMessage);
                this.events.off(Events.Player.ACTION_BAR, onActionBar);
            };
            const onMessage = payload => {
                const message = String(payload?.message || '').replace(/[\r\n\t]+/g, ' ').trim();
                if (message) lastChatMessage = message;
            };
            const onActionBar = payload => {
                const message = String(payload?.message || '').replace(/[\r\n\t]+/g, ' ').trim();
                if (message) lastActionBar = message;
            };
            const onOpen = window => {
                cleanup();
                resolve(window);
            };
            this.events.on(Events.Player.MESSAGE, onMessage);
            this.events.on(Events.Player.ACTION_BAR, onActionBar);
            this.events.on(Events.GUI.OPEN, onOpen);
            timer = setTimeout(() => {
                cleanup();
                const error = new Error(`GUI ${this.settings().command} không mở sau ${timeout} ms.`);
                const feedback = [
                    lastChatMessage && lastChatMessage !== lastActionBar
                        ? `Chat server: ${lastChatMessage}`
                        : '',
                    lastActionBar ? `Action bar: ${lastActionBar}` : ''
                ].filter(Boolean).join(' | ');
                if (feedback) error.message += ` Phản hồi: ${feedback}`;
                error.code = 'TIMEOUT';
                reject(error);
            }, Math.max(1000, Number(timeout) || DEFAULT_SETTINGS.guiTimeoutMs));
        });
    }

    /** Waits until the server-side /pv command cooldown has elapsed. */
    async _waitForCommandCooldown(settings = this.settings()) {
        const cooldownMs = this._commandCooldownMs(settings);
        const remainingMs = this.commandCooldownRemainingMs(settings);
        if (remainingMs <= 0) return;

        this._setState({
            status: 'COOLDOWN',
            nextCommandAt: this.lastCommandAt + cooldownMs
        });
        const scheduler = this.manager('scheduler');
        if (scheduler?.sleep) {
            await scheduler.sleep(remainingMs);
            return;
        }
        await new Promise(resolve => setTimeout(resolve, remainingMs));
    }

    _snapshot(window) {
        const end = Number.isInteger(window?.inventoryStart)
            ? window.inventoryStart
            : (window?.slots?.length || 0);
        return (window?.slots || [])
            .slice(0, end)
            .map((item, slot) => {
                if (!item) return null;
                const labels = itemLabels(item);
                return {
                    slot,
                    itemName: item.name || null,
                    // Vanilla `displayName` is often only "Player Head" on
                    // 1.21. The first custom component label is authoritative.
                    displayName: labels[0] || item.displayName || item.name || 'Unknown item',
                    labels,
                    count: Number.isFinite(item.count) ? item.count : 1
                };
            })
            .filter(Boolean)
            .filter(item => ![
                'black_stained_glass_pane',
                'gray_stained_glass_pane',
                'white_stained_glass_pane'
            ].includes(item.itemName));
    }

    _snapshotPlayerInventory(window) {
        const start = Number.isInteger(window?.inventoryStart)
            ? window.inventoryStart
            : (window?.slots?.length || 0);
        return (window?.slots || [])
            .slice(start)
            .map((item, relativeSlot) => {
                if (!item) return null;
                const labels = itemLabels(item);
                return {
                    slot: start + relativeSlot,
                    itemName: item.name || null,
                    displayName: labels[0] || item.displayName || item.name || 'Unknown item',
                    labels,
                    count: Number.isFinite(item.count) ? item.count : 1
                };
            })
            .filter(Boolean);
    }

    /**
     * Transfers exactly `count` from a vault stack.  `window.withdraw` is the
     * Mineflayer container primitive: unlike Shift-click it stops at the
     * requested amount and keeps the remainder in the source slot.
     *
     * The project targets Mineflayer versions which provide this API.  Failing
     * safely is preferable to falling back to Shift-click and pulling an
     * entire B3/B4 stack into inventory.
     *
     * @private
     */
    async _withdrawExact(window, source, count, settings = this.settings()) {
        const amount = Math.max(0, Math.floor(Number(count) || 0));
        if (!source || amount <= 0) return Result.NO_ACTION;
        if (settings.exactWithdraw === false) {
            this.warn('Rút chính xác /pv 2 đã bị tắt; từ chối Shift-click để tránh lấy cả stack.');
            return Result.FAILED;
        }

        // Mineflayer's native transfer is efficient only when its type +
        // metadata + NBT lookup identifies this exact stack.  On 1.20.5+
        // servers a custom component can be separate from `nbt`; several
        // distinct materials may then share the same vanilla carrier item.
        // Use a slot-specific transfer in that ambiguous case.
        if (this._canUseNativeExactWithdraw(window, source)) {
            try {
                await window.withdraw(source.type, source.metadata, amount, source.nbt);
                return Result.SUCCESS;
            } catch (error) {
                this.warn(`Không thể rút chính xác ${amount} item từ /pv 2: ${error.message}`);
                return Result.GUI_CLICK_FAILED;
            }
        }

        return this._withdrawExactFromSourceSlot(window, source, amount);
    }

    /** @private */
    _canUseNativeExactWithdraw(window, source) {
        if (typeof window?.withdraw !== 'function') return false;
        if (source.nbt != null) return true;
        const end = Number.isInteger(window?.inventoryStart)
            ? window.inventoryStart
            : (window?.slots?.length || 0);
        const matchingCarrierStacks = (window?.slots || [])
            .slice(0, end)
            .filter(item => item
                && item.type === source.type
                && item.metadata === source.metadata);
        return matchingCarrierStacks.length <= 1;
    }

    /**
     * Slot-specific exact transfer for component-only custom items.  It picks
     * the selected source stack, right-clicks a verified empty player slot the
     * requested number of times, then returns the remainder to the original
     * source slot.  This never asks Mineflayer to search a same-carrier stack.
     *
     * @private
     */
    async _withdrawExactFromSourceSlot(window, source, amount) {
        const inventoryStart = Number.isInteger(window?.inventoryStart)
            ? window.inventoryStart
            : (window?.slots?.length || 0);
        const inventoryEnd = Number.isInteger(window?.inventoryEnd)
            ? window.inventoryEnd
            : (window?.slots?.length || 0);
        let destinationSlot = null;
        for (let slot = inventoryStart; slot < inventoryEnd; slot += 1) {
            if (!window.slots?.[slot]) {
                destinationSlot = slot;
                break;
            }
        }
        if (!Number.isInteger(destinationSlot)) {
            this.warn('Không có slot trống để rút chính xác từ /pv 2.');
            return Result.NO_FREE_SLOT;
        }

        const sourceCount = Math.max(0, Number(source.count) || 0);
        if (amount > sourceCount) return Result.INSUFFICIENT_ITEMS;
        let holdingSource = false;
        try {
            let result = await this.gui.click(source.slot, 0, 0);
            if (result !== Result.SUCCESS) return result;
            holdingSource = true;
            for (let moved = 0; moved < amount; moved += 1) {
                result = await this.gui.click(destinationSlot, 1, 0);
                if (result !== Result.SUCCESS) return result;
            }
            if (amount < sourceCount) {
                result = await this.gui.click(source.slot, 0, 0);
                if (result !== Result.SUCCESS) return result;
            }
            holdingSource = false;
            return Result.SUCCESS;
        } catch (error) {
            this.warn(`Không thể rút đúng slot ${source.slot} từ /pv 2: ${error.message}`);
            return Result.GUI_CLICK_FAILED;
        } finally {
            // A failed right-click must not leave a whole vault stack on the
            // cursor. Best-effort restoration is safer than a later command.
            if (holdingSource) {
                try {
                    await this.gui.click(source.slot, 0, 0);
                } catch (error) {
                    this.error(`Không thể trả item đang cầm về slot /pv 2 ${source.slot}: ${error.message}`);
                }
            }
        }
    }

    _matches(item, request) {
        const aliases = [request.name, ...(Array.isArray(request.aliases) ? request.aliases : [])]
            .map(value => normalizeItemLabel(value))
            .filter(Boolean);
        const labels = item.labels || [item.displayName, item.itemName];
        if (labels.some(value => aliases.includes(normalizeItemLabel(value)))) return true;

        const compactAliases = aliases.map(value => compactItemLabel(value));
        if (labels.some(value => {
            const compact = compactItemLabel(value);
            return compact.length >= 6 && compactAliases.includes(compact);
        })) return true;

        // Server custom items sometimes decorate only the display name, e.g.
        // "Khối Vàng Tinh Luyện ✦".  Use a bounded variant match for this
        // identity field only; never scan lore with it because lore can name
        // ingredients belonging to a different item.
        const displayName = normalizeItemLabel(item.displayName || labels[0]);
        return aliases.some(alias => alias.length >= 8
            && displayName
            && displayName.includes(alias));
    }

    _transferDelay() {
        const delay = Number(this.settings().transferDelayMs);
        return Number.isFinite(delay) ? Math.max(0, Math.min(delay, 5000)) : DEFAULT_SETTINGS.transferDelayMs;
    }

    _commandCooldownMs(settings = this.settings()) {
        const cooldown = Number(settings.commandCooldownMs);
        return Number.isFinite(cooldown) ? Math.min(Math.max(Math.floor(cooldown), 0), 60000) : DEFAULT_SETTINGS.commandCooldownMs;
    }

    _guiRetryAttempts(settings = this.settings()) {
        const retries = Number(settings.guiRetryAttempts);
        return Number.isFinite(retries) ? Math.min(Math.max(Math.floor(retries), 0), 2) : DEFAULT_SETTINGS.guiRetryAttempts;
    }

    _reserveInventorySlots() {
        const reserve = Number(this.settings().reserveInventorySlots);
        return Number.isFinite(reserve) ? Math.min(Math.max(Math.floor(reserve), 0), 35) : 4;
    }

    _setState(extra = {}) {
        this.state.personalVault = {
            command: '/pv 2',
            status: 'IDLE',
            items: [],
            updatedAt: null,
            lastError: null,
            lastNotice: null,
            lastWithdrawal: null,
            lastDeposit: null,
            nextCommandAt: null,
            ...(this.state.personalVault || {}),
            ...extra
        };
    }

    async destroy() {
        this.busy = false;
        await super.destroy();
        return Result.SUCCESS;
    }
}

module.exports = PersonalVaultService;
