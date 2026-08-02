'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const StorageScreen = require('../screens/StorageScreen');

/**
 * Owns reusable storage inspection and selling operations. Modes decide when
 * to inspect or sell; this service performs the configured server commands.
 */
class StorageService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'StorageService';
        this.events = ctx.getManager('events');
        this.inventory = ctx.getService('inventory');
        this.gui = ctx.getService('gui');
        this.checkingGui = false;
    }

    async initialize() {
        await super.initialize();
        this.setSelectedOres(this.config.storage?.selectedOres || this.config.storage?.mine || []);
        return Result.SUCCESS;
    }

    isSelling() {
        return this.state.storage.selling;
    }

    /** Sells the player inventory using the server command configured for it. */
    async sellInventory() {
        if (!this.bot) return Result.FAILED;
        if (this.isSelling()) return Result.BUSY;

        const command = this.config.storage?.inventorySellCommand || this.state.storage.sellCommand;
        this.state.storage.selling = true;
        this.emit(Events.Storage.SELL_INVENTORY);
        try {
            const sent = await this.service('chat').sendCommand(command);
            if (sent !== Result.SUCCESS) return sent;
            this.state.storage.lastSell = Date.now();
            this.state.metrics.sells++;
            return Result.SUCCESS;
        } catch (error) {
            this.error(`Không thể bán inventory: ${error.message}`);
            return Result.FAILED;
        } finally {
            this.state.storage.selling = false;
        }
    }

    /**
     * Sends one `/kho sell <ore>` command per selected ore/block. Discord only
     * updates selectedOres; it never sends raw Mineflayer chat itself.
     */
    async sellStorage() {
        return this.sellItems(this.getSelectedOres());
    }

    /**
     * Sells exactly the requested storage item types without changing the
     * persistent selection configured from Discord.
     *
     * @param {String[]} ores
     * @returns {Promise<String>}
     */
    async sellItems(ores = []) {
        if (!this.bot) return Result.FAILED;
        if (this.isSelling()) return Result.BUSY;

        const selectedOres = [...new Set((Array.isArray(ores) ? ores : [])
            .map(ore => this._sellArgument(ore))
            .filter(Boolean))];
        if (selectedOres.length === 0) {
            this.warn('Kho đầy nhưng chưa chọn ore/block để bán.');
            return Result.NO_ACTION;
        }

        const settings = this.config.storage || {};
        const delayMs = Number.isFinite(settings.sellCommandDelayMs)
            ? Math.max(0, settings.sellCommandDelayMs)
            : 350;

        this.state.storage.selling = true;
        this.emit(Events.Storage.SELL_STORAGE);
        try {
            await this._waitForPersonalVaultCooldown(settings.sellCommand || this.state.storage.sellCommand);
            const serverCommands = this.service('serverCommands');
            if (!serverCommands?.sellStorage) return Result.FAILED;
            for (const ore of selectedOres) {
                const sent = await serverCommands.sellStorage(ore);
                if (sent !== Result.SUCCESS) return sent;
                if (delayMs > 0) await this.manager('scheduler')?.sleep(delayMs);
            }

            this.state.storage.lastSell = Date.now();
            this.state.metrics.sells++;
            this.emit(Events.Storage.FINISHED, selectedOres);
            this.success(`Đã gửi lệnh bán ${selectedOres.length} loại ore/block trong /kho.`);
            return Result.SUCCESS;
        } catch (error) {
            this.emit(Events.Storage.FAILED, error);
            this.error(`Không thể bán kho: ${error.message}`);
            return Result.FAILED;
        } finally {
            this.state.storage.selling = false;
        }
    }

    isStorageFull() {
        const stats = this.getStorageStats();
        return Number.isFinite(stats.free) && stats.free <= 0;
    }

    /**
     * Returns numeric capacity supplied by the slot-49 information item.
     * @returns {{total:Number|null, used:Number|null, free:Number|null, usedPercent:Number|null, freePercent:Number|null}}
     */
    getStorageStats() {
        const stats = this.state.storage.gui?.detail?.storage || {};
        return {
            total: Number.isFinite(stats.total) ? stats.total : null,
            used: Number.isFinite(stats.used) ? stats.used : null,
            free: Number.isFinite(stats.free) ? stats.free : null,
            usedPercent: Number.isFinite(stats.usedPercent) ? stats.usedPercent : null,
            freePercent: Number.isFinite(stats.freePercent) ? stats.freePercent : null
        };
    }

    /**
     * Opens /kho briefly so GUIListener can capture the title capacity bars.
     * The GUI is always closed before the mode continues.
     */
    async refreshStorageGui(options = {}) {
        if (!this.bot || !this.gui) return Result.FAILED;
        if (this.checkingGui) return Result.BUSY;

        const delegatedOwner = typeof options.guiOwner === 'string' && options.guiOwner.trim()
            ? options.guiOwner.trim()
            : null;
        const currentOwner = this.gui.owner?.() || null;
        if (currentOwner && currentOwner !== delegatedOwner) {
            this.debug(`Storage refresh skipped; GUI owner=${currentOwner}.`);
            return Result.BUSY;
        }
        const acquired = currentOwner ? null : this.gui.acquire?.('storage');
        if (acquired && acquired !== Result.SUCCESS) return acquired;
        const activeGuiOwner = currentOwner || 'storage';

        const settings = this.config.storage || {};
        const command = settings.guiCommand || '/kho';
        const timeout = settings.guiTimeoutMs ?? 5000;
        const retryAttempts = this._guiRetryAttempts(settings);
        const retryDelayMs = this._guiRetryDelay(settings);
        const runPostProcessing = options.runPostProcessing !== false;
        const requireFreeSpace = options.requireFreeSpace === true;
        // Crafting keeps raw B1 material available, so it can request
        // smelting without immediately packing the result into blocks.
        const runSmelting = runPostProcessing && options.runSmelting !== false;
        const runCompression = runPostProcessing && options.runCompression !== false;

        this.checkingGui = true;
        this.state.storage.lastGuiProbe = {
            status: 'PENDING',
            command,
            updatedAt: Date.now(),
            message: null
        };
        try {
            let snapshot = null;
            let firstError = null;
            for (let attempt = 0; attempt <= retryAttempts; attempt++) {
                await this._closeOpenWindow();
                try {
                    // MinerUA rate-limits the command immediately following
                    // `/pv 2`, even if the vault GUI never arrived.  Collector
                    // calls this service after an SHK preflight, so honour the
                    // vault clock here instead of sending `/kho` into a known
                    // server-side cooldown and waiting for an opaque timeout.
                    await this._waitForPersonalVaultCooldown(command);
                    let opened;
                    const serverCommands = this.service('serverCommands');
                    if (!serverCommands?.openStorage) {
                        throw new Error('ServerCommandService chưa sẵn sàng để mở /kho.');
                    }
                    const sent = await serverCommands.openStorage({
                        beforeSend: () => {
                            opened = this._waitForFreshStorageGui(Date.now(), timeout, { requireFreeSpace });
                        }
                    });
                    if (sent !== Result.SUCCESS) {
                        throw new Error(`Không thể gửi ${command}: ${sent}.`);
                    }
                    snapshot = await opened;
                    break;
                } catch (error) {
                    firstError = firstError || error;
                    if (error?.code !== 'TIMEOUT' || attempt >= retryAttempts) break;
                    if (settings.guiDebug === true) {
                        this.info(`[Storage GUI] Lần ${attempt + 1} không mở; thử lại sau ${retryDelayMs} ms.`);
                    }
                    if (retryDelayMs > 0) await this.manager('scheduler')?.sleep(retryDelayMs);
                }
            }
            if (!snapshot) throw firstError || new Error('GUI /kho không trả về snapshot.');

            this.state.storage.full = this.isStorageFull();
            this.state.storage.lastGuiProbe = {
                status: 'SUCCESS',
                command,
                updatedAt: Date.now(),
                message: null
            };
            if (settings.guiLog === true) {
                this.success(
                    `[Storage GUI] title="${snapshot.title || '(không có)'}" `
                    + `slots=${snapshot.usedSlots}/${snapshot.totalSlots} `
                    + `storage=${this._formatStorageStats(this.getStorageStats())} `
                    + `full=${this.state.storage.full}`
                );
            }

            // Confirm the /kho window has actually closed before the shared
            // command gateway starts its required post-GUI cooldown.
            await this._closeOpenWindow();
            if (runSmelting) {
                const smeltingResult = await this.service('smelting')?.run?.({ guiOwner: activeGuiOwner });
                if (smeltingResult && smeltingResult !== Result.SUCCESS && smeltingResult !== Result.NO_ACTION) {
                    this.warn(`Đọc /kho xong nhưng không thể nung raw: ${smeltingResult}.`);
                }
            }
            if (runCompression) {
                const conversion = this.service('materialConversion');
                const conversionResult = runCompression
                    ? (conversion?.pack
                        ? await conversion.pack({ guiOwner: activeGuiOwner })
                        : await conversion?.run?.({ direction: 'pack', guiOwner: activeGuiOwner }))
                    : Result.NO_ACTION;
                if (conversionResult && conversionResult !== Result.SUCCESS && conversionResult !== Result.NO_ACTION) {
                    this.warn(`Đọc /kho xong nhưng không thể nén phôi/ngọc thành khối: ${conversionResult}.`);
                }
            }
            return Result.SUCCESS;
        } catch (error) {
            this.state.storage.lastGuiProbe = {
                status: error?.code || 'FAILED',
                command,
                updatedAt: Date.now(),
                message: this._shortText(error?.message || 'Không rõ lý do.')
            };
            this.warn(`Không thể đọc GUI kho: ${error.message}`);
            return error?.code === 'TIMEOUT' ? Result.GUI_TIMEOUT : Result.FAILED;
        } finally {
            if (this.gui.isOpen()) {
                try {
                    await this.gui.close();
                } catch (error) {
                    this.warn(`Không thể đóng GUI kho: ${error.message}`);
                }
            }
            this.checkingGui = false;
            if (acquired === Result.SUCCESS) this.gui.release?.('storage');
        }
    }

    /**
     * Expands only the vanilla block types required by an already-staged SHK
     * batch. The caller refreshes `/kho` afterwards because every conversion
     * changes storage and closes MinerUA's GUI.
     *
     * @param {Array<{item:String, amount:Number}>} rawRequirements
     * @param {Object<String, Number>} rawSlots
     * @returns {Promise<String>}
     */
    async prepareRawForCraft(rawRequirements = [], rawSlots = {}, options = {}) {
        if (this.checkingGui) return Result.BUSY;
        const conversion = this.service('materialConversion');
        if (!conversion?.unpackForRequirements) return Result.NO_ACTION;
        if (options.capacityReserved !== true) {
            const reserved = await this.reserveCapacityForUnpack(rawRequirements, rawSlots, options);
            if (reserved !== Result.SUCCESS && reserved !== Result.NO_ACTION) return reserved;
        }
        return conversion.unpackForRequirements(rawRequirements, rawSlots, {
            force: options.forceUnpack === true,
            guiOwner: options.guiOwner
        });
    }

    /**
     * Keeps `/kho` safe before a whole-type B1 block expansion.  MinerUA
     * expands every matching block rather than only the requested amount, so
     * accepting an unpack without reserving room can make server-supplied B1
     * overflow into the bot inventory.
     *
     * The configured selected ores are sold first when the projected free
     * capacity would fall below `storage.autoSellFreeThreshold`.  If selling
     * cannot create enough room, this method refuses the unpack.
     *
     * @param {Array<{item:String, amount:Number}>} rawRequirements
     * @param {Object<String, Number>} rawSlots
     * @returns {Promise<String>}
     */
    async reserveCapacityForUnpack(rawRequirements = [], rawSlots = {}, options = {}) {
        if (this.checkingGui) return Result.BUSY;
        const conversion = this.service('materialConversion');
        if (!conversion?.getUnpackPlan) return Result.NO_ACTION;

        const plan = conversion.getUnpackPlan(rawRequirements, rawSlots, {
            force: options.forceUnpack === true
        });
        if (plan.targets.length === 0) {
            this._setCapacityReservation('NOT_NEEDED', plan, this.getStorageStats());
            return Result.NO_ACTION;
        }

        const minimumFree = this._autoSellFreeThreshold();
        const projectedAdditional = Math.max(0, Number(plan.additionalStorageUnits) || 0);
        const requiredFree = minimumFree + projectedAdditional;
        let stats = this.getStorageStats();
        if (!Number.isFinite(stats.free)) {
            this._setCapacityReservation('UNKNOWN_CAPACITY', plan, stats, requiredFree);
            this.warn('Không tách khối B1 vì chưa đọc được “Còn trống” của /kho.');
            return Result.NO_FREE_SLOT;
        }
        if (stats.free >= requiredFree) {
            this._setCapacityReservation('RESERVED', plan, stats, requiredFree);
            return Result.SUCCESS;
        }

        this.info(
            `Kho còn ${stats.free.toLocaleString('vi-VN')}; cần giữ ${minimumFree.toLocaleString('vi-VN')} `
            + `sau khi tách +${projectedAdditional.toLocaleString('vi-VN')}. Đang bán trước khi craft B2.`
        );
        // Do not sell B1 types still required by this SHK run. A capacity
        // guard that sold the very blocks it intended to unpack would protect
        // inventory at the cost of silently corrupting the craft plan.
        const sellResult = await this.sellItems(this._sellableSelectedOres(options.protectedItems || rawRequirements));
        if (sellResult !== Result.SUCCESS) {
            this._setCapacityReservation('SELL_UNAVAILABLE', plan, stats, requiredFree);
            return sellResult === Result.NO_ACTION ? Result.NO_FREE_SLOT : sellResult;
        }

        // A sale changes server-side storage but does not reliably update the
        // existing GUI snapshot. Re-read without post-processing so the next
        // unpack decision uses current, direct B1/block quantities.
        const refreshOptions = { runPostProcessing: false };
        if (typeof options.guiOwner === 'string' && options.guiOwner.trim()) {
            refreshOptions.guiOwner = options.guiOwner.trim();
        }
        const refreshResult = await this.refreshStorageGui(refreshOptions);
        if (refreshResult !== Result.SUCCESS) {
            this._setCapacityReservation('REFRESH_FAILED', plan, this.getStorageStats(), requiredFree);
            return refreshResult;
        }
        stats = this.getStorageStats();
        if (!Number.isFinite(stats.free) || stats.free < requiredFree) {
            this._setCapacityReservation('INSUFFICIENT_AFTER_SELL', plan, stats, requiredFree);
            this.warn(
                `Không tách khối B1: /kho còn ${Number.isFinite(stats.free) ? stats.free.toLocaleString('vi-VN') : '?'} `
                + `nhưng cần tối thiểu ${requiredFree.toLocaleString('vi-VN')} chỗ trống để không tràn inventory.`
            );
            return Result.NO_FREE_SLOT;
        }
        this._setCapacityReservation('RESERVED_AFTER_SELL', plan, stats, requiredFree);
        return Result.SUCCESS;
    }

    /**
     * Re-compresses B1 immediately after a raw-to-B2 group, then sells before
     * the storage buffer is violated. CraftingService calls this between B2
     * groups instead of waiting for Collector's normal 30-second maintenance.
     *
     * @returns {Promise<String>}
     */
    async repackAndProtectCapacity(options = {}) {
        const ownerOptions = typeof options.guiOwner === 'string' && options.guiOwner.trim()
            ? { guiOwner: options.guiOwner.trim() }
            : undefined;
        const packed = await this.refreshStorageGui(ownerOptions);
        if (packed !== Result.SUCCESS) return packed;

        const refreshed = await this.refreshStorageGui({ runPostProcessing: false, ...(ownerOptions || {}) });
        if (refreshed !== Result.SUCCESS) return refreshed;

        const stats = this.getStorageStats();
        const threshold = this._autoSellFreeThreshold();
        if (!Number.isFinite(stats.free)) {
            this.warn('Đã nén B1 nhưng chưa đọc được “Còn trống” /kho; không tiếp tục tách khối để tránh tràn inventory.');
            return Result.NO_FREE_SLOT;
        }
        if (stats.free > threshold) return Result.SUCCESS;

        this.info(
            `Kho còn ${stats.free.toLocaleString('vi-VN')} (ngưỡng ${threshold.toLocaleString('vi-VN')}); `
            + 'bán ore/block đã chọn ngay sau B2.'
        );
        const sold = await this.sellItems(this._sellableSelectedOres(options.protectedItems || []));
        return sold === Result.NO_ACTION ? Result.NO_FREE_SLOT : sold;
    }

    async sellAll() {
        const inventoryResult = await this.sellInventory();
        if (inventoryResult !== Result.SUCCESS) return inventoryResult;

        const storageResult = await this.sellStorage();
        return storageResult === Result.NO_ACTION ? Result.SUCCESS : storageResult;
    }

    hasItems() {
        return Boolean(this.inventory && !this.inventory.isEmpty());
    }

    setSelectedOres(ores = []) {
        const unique = [...new Set(ores.filter(ore => typeof ore === 'string' && ore.trim()))];
        this.state.storage.selectedOres = unique;
        this.config.storage = this.config.storage || {};
        this.config.storage.selectedOres = [...unique];
        return Result.SUCCESS;
    }

    getSelectedOres() {
        return this.state.storage.selectedOres;
    }

    _sellArgument(ore) {
        if (typeof ore !== 'string' || /[\x00-\x1F\x7F]/.test(ore)) return '';
        return ore.trim().toUpperCase();
    }

    _formatStorageStats(stats) {
        if (!Number.isFinite(stats?.free)) return 'unknown';
        const used = Number.isFinite(stats.used) ? stats.used.toLocaleString('vi-VN') : '?';
        const total = Number.isFinite(stats.total) ? stats.total.toLocaleString('vi-VN') : '?';
        return `used=${used}/${total}, free=${stats.free.toLocaleString('vi-VN')}`;
    }

    _autoSellFreeThreshold() {
        const value = Number(this.config.storage?.autoSellFreeThreshold);
        return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 150000;
    }

    /**
     * Returns configured sell targets except B1 raw/block types protected by
     * the active craft plan. Inputs may be item keys or `{item}` objects.
     * @private
     */
    _sellableSelectedOres(protectedItems = []) {
        const conversion = this.service('materialConversion');
        const conversionSettings = conversion?.settings?.() || {};
        const protectedNames = new Set((Array.isArray(protectedItems) ? protectedItems : [])
            .map(item => typeof item === 'string' ? item : item?.item)
            .filter(item => typeof item === 'string' && item.trim())
            .map(item => item.trim().toUpperCase()));
        for (const item of [...protectedNames]) {
            const blockItem = conversionSettings.blockItems?.[item.toLowerCase()];
            if (typeof blockItem === 'string' && blockItem.trim()) {
                protectedNames.add(blockItem.trim().toUpperCase());
            }
        }
        return this.getSelectedOres().filter(ore => !protectedNames.has(this._sellArgument(ore)));
    }

    _setCapacityReservation(status, plan, stats, requiredFree = null) {
        this.state.storage.capacityReservation = {
            status,
            targets: plan?.targets || [],
            additionalStorageUnits: Math.max(0, Number(plan?.additionalStorageUnits) || 0),
            requiredFree: Number.isFinite(requiredFree) ? requiredFree : null,
            free: Number.isFinite(stats?.free) ? stats.free : null,
            updatedAt: Date.now()
        };
    }

    _guiRetryAttempts(settings) {
        const value = Number(settings.guiRetryAttempts);
        return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 0), 3) : 1;
    }

    _guiRetryDelay(settings) {
        const value = Number(settings.guiRetryDelayMs);
        return Number.isFinite(value) ? Math.min(Math.max(value, 0), 10000) : 1000;
    }

    /**
     * Waits for the server-side `/pv 2` command cooldown before issuing a
     * different GUI command.  ChatService already enforces the six-second
     * delay after a real window close; this covers the separate case where
     * `/pv 2` was accepted but the server did not open a GUI at all.
     *
     * @param {String} nextCommand
     * @returns {Promise<void>}
     * @private
     */
    async _waitForPersonalVaultCooldown(nextCommand) {
        const personalVault = this.service('personalVault');
        const remainingMs = Number(personalVault?.commandCooldownRemainingMs?.());
        if (!Number.isFinite(remainingMs) || remainingMs <= 0) return;

        this.info(`Chờ ${Math.ceil(remainingMs)} ms sau /pv 2 trước ${nextCommand}.`);
        const scheduler = this.manager('scheduler');
        if (scheduler?.sleep) {
            await scheduler.sleep(remainingMs);
            return;
        }
        await new Promise(resolve => setTimeout(resolve, remainingMs));
    }

    /**
     * Closes an earlier server GUI before issuing /kho, waiting briefly for its
     * close event so `GUIService` cannot hand a stale window to this workflow.
     *
     * @private
     */
    async _closeOpenWindow() {
        if (!this.gui.isOpen()) return;

        const events = this.manager('events');
        const closed = events?.waitFor
            ? events.waitFor(Events.GUI.CLOSE, 1000).catch(() => null)
            : null;
        await this.gui.close();
        await closed;
    }

    /**
     * Waits for a GUI.OPEN event that has produced a newer /kho snapshot.
     * GUIService.waitOpen() intentionally returns an already-open window, so
     * it cannot be used for this command-driven probe.
     *
     * @param {Number} requestedAt
     * @param {Number} timeout
     * @returns {Promise<Object>}
     * @private
     */
    _waitForFreshStorageGui(requestedAt, timeout, options = {}) {
        const events = this.manager('events');
        if (!events?.on || !events?.off) {
            return Promise.reject(new Error('Event manager không sẵn sàng để chờ GUI kho.'));
        }

        return new Promise((resolve, reject) => {
            let timer;
            let lastChatMessage = '';
            let lastActionBar = '';
            const cleanup = () => {
                clearTimeout(timer);
                events.off(Events.Storage.SNAPSHOT, onOpen);
                events.off(Events.Player.MESSAGE, onMessage);
                events.off(Events.Player.ACTION_BAR, onActionBar);
            };
            const onOpen = payload => {
                const window = payload?.window;
                if (!this._storageScreen().isStorageWindow(window)) {
                    if (this.config.storage?.guiDebug === true) {
                        this.info(
                            `[Storage GUI] ÄÃ£ má»Ÿ GUI khÃ¡c: "${this._shortText(this._windowTitle(window)) || '(khÃ´ng cÃ³ title)'}".`
                        );
                    }
                    return;
                }
                const snapshot = payload?.snapshot;
                if (!snapshot?.updatedAt || snapshot.updatedAt < requestedAt) {
                    if (this.config.storage?.guiDebug === true) {
                        this.info(
                            `[Storage GUI] Đã mở GUI khác: "${this._shortText(this._windowTitle(window)) || '(không có title)'}".`
                        );
                    }
                    return;
                }
                if (options.requireFreeSpace === true && !Number.isFinite(snapshot.detail?.storage?.free)) return;
                cleanup();
                resolve(snapshot);
            };
            const onMessage = payload => {
                const message = this._shortText(payload?.message);
                if (message) lastChatMessage = message;
            };
            const onActionBar = payload => {
                const message = this._shortText(payload?.message);
                if (message) lastActionBar = message;
            };

            events.on(Events.Storage.SNAPSHOT, onOpen);
            events.on(Events.Player.MESSAGE, onMessage);
            events.on(Events.Player.ACTION_BAR, onActionBar);
            timer = setTimeout(() => {
                cleanup();
                const chatFeedback = lastChatMessage && lastChatMessage !== lastActionBar
                    ? `Chat server: ${lastChatMessage}`
                    : '';
                const feedback = [
                    chatFeedback,
                    lastActionBar ? `Action bar: ${lastActionBar}` : ''
                ].filter(Boolean).join(' | ');
                const error = new Error(
                    `GUI /kho không mở sau ${timeout} ms.`
                    + (feedback ? ` Phản hồi: ${feedback}` : ' Server không gửi phản đáp chat/action bar.')
                );
                error.code = 'TIMEOUT';
                reject(error);
            }, timeout);
        });
    }

    /**
     * Limits server-provided text before it reaches terminal logs or Discord.
     *
     * @param {*} value
     * @param {Number} maxLength
     * @returns {String}
     * @private
     */
    _shortText(value, maxLength = 180) {
        const text = typeof value === 'string' ? value : String(value || '');
        const compact = text.replace(/[\r\n\t]+/g, ' ').trim();
        return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
    }

    /**
     * Returns a safe best-effort title for a non-storage GUI diagnostic.
     *
     * @param {*} window
     * @returns {String}
     * @private
     */
    _windowTitle(window) {
        const title = window?.title;
        if (title === null || title === undefined) return '';
        try {
            const rendered = typeof title.toString === 'function' ? title.toString() : String(title);
            return rendered === '[object Object]' ? '' : rendered;
        } catch (error) {
            return '';
        }
    }

    _storageScreen() {
        return new StorageScreen(this.gui, {
            config: this.config,
            events: this.manager('events')
        });
    }

    emit(event, ...args) {
        this.events?.emit?.(event, ...args);
    }

    async destroy() {
        this.checkingGui = false;
        await super.destroy();
        return Result.SUCCESS;
    }
}

module.exports = StorageService;
