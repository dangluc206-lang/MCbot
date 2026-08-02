'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const MaterialConversionScreen = require('../screens/MaterialConversionScreen');

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    command: '/ks',
    menuSlot: 10,
    menuButton: 0,
    guiTimeoutMs: 5000,
    clickDelayMs: 1000,
    // Pack at idle to free NPC-storage slots. Unpack only when the next SHK
    // batch needs direct B1 raw materials that are currently compressed.
    packAfterStorageRead: true,
    unpackBeforeCraft: true,
    targetItems: ['coal', 'redstone', 'lapis_lazuli', 'iron_ingot', 'gold_ingot', 'diamond', 'emerald'],
    rawSlots: {
        coal: 10,
        redstone: 31,
        lapis_lazuli: 28,
        iron_ingot: 23,
        gold_ingot: 20,
        diamond: 13,
        emerald: 15
    },
    blockSlots: {
        coal: 11,
        redstone: 32,
        lapis_lazuli: 25,
        iron_ingot: 22,
        gold_ingot: 19,
        diamond: 14,
        emerald: 16
    },
    blockItems: {
        coal: 'coal_block',
        redstone: 'redstone_block',
        lapis_lazuli: 'lapis_block',
        iron_ingot: 'iron_block',
        gold_ingot: 'gold_block',
        diamond: 'diamond_block',
        emerald: 'emerald_block'
    },
    unpackItems: {}
});

/**
 * Owns both directions of MinerUA's `/ks > 10` vanilla conversion GUI.
 *
 * MinerUA protocol: clicking a block icon packs matching ingots/gems into
 * blocks; clicking a raw icon unpacks matching blocks.  Each click closes the
 * GUI, so this service deliberately reopens the menu for each material.
 */
class MaterialConversionService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'MaterialConversionService';
        this.events = ctx.getManager('events');
        this.running = false;
    }

    settings() {
        const configured = this.config.storage?.conversion || {};
        return {
            ...DEFAULT_SETTINGS,
            ...configured,
            rawSlots: { ...DEFAULT_SETTINGS.rawSlots, ...(configured.rawSlots || {}) },
            blockSlots: { ...DEFAULT_SETTINGS.blockSlots, ...(configured.blockSlots || {}) },
            blockItems: { ...DEFAULT_SETTINGS.blockItems, ...(configured.blockItems || {}) },
            unpackItems: { ...DEFAULT_SETTINGS.unpackItems, ...(configured.unpackItems || {}) }
        };
    }

    isRunning() {
        return this.running;
    }

    /**
     * @param {{direction?: 'pack'|'unpack', targets?: String[]}} options
     * @returns {Promise<String>}
     */
    async run(options = {}) {
        if (!this.state.bot.connected) return Result.NOT_CONNECTED;
        if (this.running) return Result.BUSY;

        const settings = this.settings();
        if (settings.enabled === false) return Result.NO_ACTION;
        const direction = options.direction === 'unpack' ? 'unpack' : 'pack';
        if (direction === 'pack' && settings.packAfterStorageRead === false) return Result.NO_ACTION;
        if (direction === 'unpack' && settings.unpackBeforeCraft === false) return Result.NO_ACTION;

        const targets = Array.isArray(options.targets)
            ? this._normalizeTargets(settings, options.targets)
            : this._targetsForDirection(settings, direction);
        if (targets.length === 0) {
            this._setState({
                status: 'READY', direction, targets: [], converted: [],
                lastRunAt: Date.now(), lastError: null
            });
            return Result.NO_ACTION;
        }

        const gui = this.service('gui');
        const delegatedOwner = typeof options.guiOwner === 'string' && options.guiOwner.trim()
            ? options.guiOwner.trim()
            : null;
        const currentOwner = gui?.owner?.() || null;
        if (currentOwner && currentOwner !== delegatedOwner) {
            this.debug(`Material conversion skipped; GUI owner=${currentOwner}.`);
            return Result.BUSY;
        }
        const acquired = currentOwner ? null : gui?.acquire?.('material-conversion');
        if (acquired && acquired !== Result.SUCCESS) return acquired;

        this.running = true;
        this._setState({ status: 'RUNNING', direction, targets, converted: [], current: null, lastError: null });
        try {
            const converted = [];
            for (const target of targets) {
                this._setState({ status: 'CONVERTING', direction, current: target, converted });
                const result = await this._convertOne(settings, target, direction);
                if (result !== Result.SUCCESS) {
                    this._setState({ status: 'FAILED', direction, lastError: result, converted });
                    return result;
                }
                converted.push(target);
            }
            this._setState({
                status: 'READY', direction, current: null, converted,
                lastRunAt: Date.now(), lastError: null
            });
            this.success(direction === 'pack'
                ? `Đã nén ${converted.length} loại phôi/ngọc thành khối để tiết kiệm slot /kho.`
                : `Đã đổi ${converted.length} loại khối về phôi/ngọc cho lượt chế tạo SHK.`);
            return Result.SUCCESS;
        } catch (error) {
            const result = error?.code || Result.FAILED;
            this._setState({ status: 'FAILED', direction, lastError: error?.message || result });
            this.warn(`Không thể ${direction === 'pack' ? 'nén phôi thành khối' : 'đổi khối về phôi'}: ${error?.message || result}.`);
            return result;
        } finally {
            this.running = false;
            if (acquired === Result.SUCCESS) gui?.release?.('material-conversion');
        }
    }

    /** Packs raw B1 materials after a normal `/kho` inspection. */
    async pack(options = {}) {
        return this.run({ direction: 'pack', ...options });
    }

    /**
     * Unpacks only types whose direct raw amount is below the immediately
     * staged craft requirement. The server unpacks an entire material type;
     * selecting only short types prevents needless block churn.
     *
     * @param {Array<{item:String, amount:Number}>} rawRequirements
     * @param {Object<String, Number>} rawSlots optional CraftingService map
     * @returns {Promise<String>}
     */
    async unpackForRequirements(rawRequirements = [], rawSlots = {}, options = {}) {
        const settings = this.settings();
        if (settings.enabled === false || settings.unpackBeforeCraft === false) return Result.NO_ACTION;
        const plan = this.getUnpackPlan(rawRequirements, rawSlots, options);
        return plan.targets.length > 0
            ? this.run({ direction: 'unpack', targets: plan.targets, guiOwner: options.guiOwner })
            : Result.NO_ACTION;
    }

    /**
     * Builds, but does not execute, the minimum set of B1 block types that
     * must be expanded for a craft batch.  MinerUA expands an entire material
     * type in one click; `additionalStorageUnits` is therefore the exact
     * capacity increase that can occur in `/kho` (one block becomes nine raw).
     * Callers must reserve that space before calling `unpackForRequirements`.
     *
     * @param {Array<{item:String, amount:Number}>} rawRequirements
     * @param {Object<String, Number>} rawSlots
     * @returns {{targets:String[], additionalStorageUnits:Number, details:Array}}
     */
    getUnpackPlan(rawRequirements = [], rawSlots = {}, options = {}) {
        const settings = this.settings();
        const requiredByItem = new Map();
        for (const requirement of Array.isArray(rawRequirements) ? rawRequirements : []) {
            const item = typeof requirement?.item === 'string' ? requirement.item.trim() : '';
            const amount = Number(requirement?.amount);
            if (!item || !Number.isFinite(amount) || amount <= 0) continue;
            requiredByItem.set(item, (requiredByItem.get(item) || 0) + amount);
        }

        const bySlot = new Map((this.state.storage?.gui?.items || [])
            .map(item => [Number(item?.slot), item]));
        const slotMap = { ...settings.rawSlots, ...(rawSlots || {}) };
        const details = this._normalizeTargets(settings, [...requiredByItem.keys()])
            .map(item => {
                const rawSlot = Number(slotMap[item]);
                const blockSlot = Number(settings.blockSlots?.[item]);
                const direct = Number(bySlot.get(rawSlot)?.amount);
                const blocks = Number(bySlot.get(blockSlot)?.amount);
                const required = Number(requiredByItem.get(item));
                const canUnpack = Number.isInteger(rawSlot)
                    && Number.isInteger(blockSlot)
                    && required > 0;
                const needsUnpack = canUnpack && (options.force === true || (
                    Number.isFinite(direct)
                    && Number.isFinite(blocks)
                    && direct < required
                    && blocks > 0
                ));
                return {
                    item,
                    required,
                    direct: Number.isFinite(direct) ? direct : 0,
                    blocks: Number.isFinite(blocks) ? blocks : 0,
                    needsUnpack,
                    // A compression block already uses one storage unit. Its
                    // expansion into nine raw materials needs eight more.
                    additionalStorageUnits: needsUnpack ? Math.max(0, blocks * 8) : 0
                };
            });
        const selected = details.filter(detail => detail.needsUnpack);
        return {
            targets: selected.map(detail => detail.item),
            additionalStorageUnits: selected.reduce((total, detail) => total + detail.additionalStorageUnits, 0),
            details
        };
    }

    /** @private */
    _targetsForDirection(settings, direction) {
        const bySlot = new Map((this.state.storage?.gui?.items || [])
            .map(item => [Number(item?.slot), item]));
        return this._normalizeTargets(settings, settings.targetItems)
            .filter(item => {
                const sourceSlot = Number(direction === 'unpack'
                    ? settings.blockSlots?.[item]
                    : settings.rawSlots?.[item]);
                const amount = bySlot.get(sourceSlot)?.amount;
                // A vanilla block costs nine raw items. Do not spend a GUI
                // command on stacks too small to release an NPC-storage slot.
                const minimum = direction === 'pack' ? 9 : 1;
                return Number.isInteger(sourceSlot) && Number.isFinite(amount) && amount >= minimum;
            });
    }

    /** @private */
    _normalizeTargets(settings, targets) {
        const configured = new Set(Array.isArray(settings.targetItems) ? settings.targetItems : []);
        return [...new Set((Array.isArray(targets) ? targets : [])
            .filter(item => typeof item === 'string' && item.trim())
            .map(item => item.trim()))]
            .filter(item => configured.has(item));
    }

    /** @private */
    async _convertOne(settings, targetItem, direction) {
        const gui = this.service('gui');
        const serverCommands = this.service('serverCommands');
        if (!gui || !serverCommands?.openMaterialConversionMenu) return Result.FAILED;

        const previousMenu = gui.window();
        const menuUpdatedAt = this.state.gui.lastUpdate || 0;
        const sent = await serverCommands.openMaterialConversionMenu();
        if (sent !== Result.SUCCESS) return sent;

        const menu = await this._waitForWindowChange(gui, previousMenu, menuUpdatedAt, settings.guiTimeoutMs, 'GUI /ks');
        const screen = this._screen(gui);
        const openedConversion = await screen.clickMenuAndWait(settings.guiTimeoutMs);
        if (openedConversion.result !== Result.SUCCESS) return openedConversion.result;

        const conversionUpdatedAt = this.state.gui.lastUpdate || 0;

        const conversionWindow = await this._waitForWindowChange(
            gui, menu, conversionUpdatedAt, settings.guiTimeoutMs, 'GUI ép phôi'
        );
        const targetDefinition = this._targetDefinition(settings, targetItem, direction);
        const target = screen.findTarget(targetDefinition);
        if (target.status !== 'FOUND') {
            this.warn(`GUI ép phôi không có button đổi ${targetItem}; không thể đổi ${targetItem}.`);
            await this._closeOpenWindow(gui);
            return Result.ITEM_NOT_FOUND;
        }

        const clicked = await screen.clickTarget(targetDefinition);
        if (clicked !== Result.SUCCESS) return clicked;
        await this._closeOpenWindow(gui);
        await this._sleep(this._clickDelayMs(settings));
        return Result.SUCCESS;
    }

    /** @private */
    _screen(gui) {
        return new MaterialConversionScreen(gui, { config: this.config, events: this.events });
    }

    _targetDefinition(settings, targetItem, direction) {
        if (direction === 'unpack') {
            const configured = settings.unpackItems?.[targetItem];
            if (configured && typeof configured === 'object') {
                return { vanillaName: targetItem, ...configured };
            }
            if (typeof configured === 'string' && configured.trim()) {
                return { vanillaName: targetItem, aliases: [configured] };
            }
            return { vanillaName: targetItem };
        }
        return { vanillaName: settings.blockItems?.[targetItem] || targetItem };
    }

    /** @private */
    async _closeOpenWindow(gui) {
        if (!gui.isOpen()) return;
        const closed = this.events?.waitFor
            ? this.events.waitFor(Events.GUI.CLOSE, 1000).catch(() => null)
            : null;
        await gui.close();
        await closed;
    }

    /** @private */
    _waitForWindowChange(gui, previousWindow, previousUpdateAt, timeout, label) {
        const hasChanged = () => {
            const window = gui.window();
            return window && (window !== previousWindow || (this.state.gui.lastUpdate || 0) > previousUpdateAt);
        };
        if (hasChanged()) return Promise.resolve(gui.window());

        return new Promise((resolve, reject) => {
            let timer;
            const cleanup = () => {
                clearTimeout(timer);
                this.events.off(Events.GUI.OPEN, onWindow);
                this.events.off(Events.GUI.UPDATE, onWindow);
            };
            const onWindow = () => {
                if (!hasChanged()) return;
                const window = gui.window();
                cleanup();
                resolve(window);
            };
            this.events.on(Events.GUI.OPEN, onWindow);
            this.events.on(Events.GUI.UPDATE, onWindow);
            timer = setTimeout(() => {
                cleanup();
                const error = new Error(`${label} không mở sau ${timeout} ms.`);
                error.code = Result.GUI_TIMEOUT;
                reject(error);
            }, this._bounded(timeout, 1000, 15000, DEFAULT_SETTINGS.guiTimeoutMs));
        });
    }

    /** @private */
    _clickDelayMs(settings) {
        return this._bounded(settings.clickDelayMs, 0, 10000, DEFAULT_SETTINGS.clickDelayMs);
    }

    /** @private */
    _bounded(value, minimum, maximum, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(Math.max(Math.floor(number), minimum), maximum) : fallback;
    }

    /** @private */
    async _sleep(milliseconds) {
        const scheduler = this.manager('scheduler');
        if (scheduler?.sleep) return scheduler.sleep(milliseconds);
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    /** @private */
    _setState(extra = {}) {
        this.state.materialConversion = {
            status: 'IDLE',
            direction: null,
            targets: [],
            converted: [],
            current: null,
            lastRunAt: null,
            lastError: null,
            ...(this.state.materialConversion || {}),
            ...extra
        };
    }

    async destroy() {
        this.running = false;
        await super.destroy();
        return Result.SUCCESS;
    }
}

module.exports = MaterialConversionService;
