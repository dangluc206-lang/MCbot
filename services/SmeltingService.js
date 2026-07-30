'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    command: '/ks',
    menuSlot: 12,
    menuButton: 0,
    actionSlot: 1,
    actionButton: 0,
    passes: 2,
    guiTimeoutMs: 5000,
    actionDelayMs: 1000
});

/**
 * Runs MinerUA's raw-smelting GUI flow independently from SHK crafting.
 * StorageService invokes it after a successful `/kho` snapshot and GUI close:
 * `/ks` -> slot 12 -> smelting GUI -> slot 1.
 */
class SmeltingService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'SmeltingService';
        this.events = ctx.getManager('events');
        this.running = false;
    }

    settings() {
        return { ...DEFAULT_SETTINGS, ...(this.config.storage?.smelting || {}) };
    }

    isRunning() {
        return this.running;
    }

    /**
     * `/ks > 12` is only valid when NPC storage actually contains a raw
     * material.  Opening it on an empty raw queue makes MinerUA return a
     * different GUI, which previously produced a noisy GUI_NOT_FOUND warning.
     */
    hasRawMaterials(items = this.state.storage?.gui?.items || []) {
        const rawItems = new Set(['raw_iron', 'raw_gold']);
        return (items || []).some(item => {
            if (!rawItems.has(item?.itemName)) return false;
            const amount = Number.isFinite(item?.amount) ? item.amount : item?.count;
            return Number.isFinite(amount) && amount > 0;
        });
    }

    /** Executes the configured number of raw-smelting passes. */
    async run() {
        if (!this.state.bot.connected) return Result.NOT_CONNECTED;
        if (this.running) return Result.BUSY;

        const settings = this.settings();
        if (settings.enabled === false || this._passCount(settings) === 0) return Result.NO_ACTION;
        if (!this.hasRawMaterials()) {
            this._setState({ status: 'IDLE', pass: 0, lastError: null, lastSkipReason: 'NO_RAW_MATERIALS' });
            return Result.NO_ACTION;
        }

        this.running = true;
        this._setState({ status: 'RUNNING', pass: 0, lastError: null });
        try {
            for (let pass = 0; pass < this._passCount(settings); pass += 1) {
                this._setState({ status: 'OPENING_MENU', pass: pass + 1 });
                const result = await this._runPass(settings, pass + 1);
                if (result !== Result.SUCCESS) {
                    this._setState({ status: 'FAILED', lastError: result });
                    return result;
                }
            }
            this._setState({ status: 'READY', lastRunAt: Date.now(), lastError: null });
            this.success(`Đã nung raw ${this._passCount(settings)} lượt qua ${settings.command} > ${settings.menuSlot}.`);
            return Result.SUCCESS;
        } catch (error) {
            this._setState({ status: 'FAILED', lastError: error.message });
            this.warn(`Không thể nung raw: ${error.message}`);
            return Result.FAILED;
        } finally {
            this.running = false;
        }
    }

    async _runPass(settings, pass) {
        const gui = this.service('gui');
        const chat = this.service('chat');
        if (!gui || !chat) return Result.FAILED;

        const beforeMenu = gui.window();
        const beforeMenuUpdate = this.state.gui.lastUpdate || 0;
        const sent = await chat.sendCommand(settings.command);
        if (sent !== Result.SUCCESS) return sent;

        const menu = await this._waitForWindowChange(gui, beforeMenu, beforeMenuUpdate, settings.guiTimeoutMs);
        const menuSlot = Number(settings.menuSlot);
        if (!Number.isInteger(menuSlot) || !menu?.slots?.[menuSlot]) return Result.GUI_NOT_FOUND;

        this._setState({ status: 'OPENING_SMELTING_GUI', pass });
        const menuUpdate = this.state.gui.lastUpdate || 0;
        const clickedMenu = await gui.click(menuSlot, Number(settings.menuButton) || 0, 0);
        if (clickedMenu !== Result.SUCCESS) return clickedMenu;

        const smeltingWindow = await this._waitForWindowChange(gui, menu, menuUpdate, settings.guiTimeoutMs);
        const actionSlot = Number(settings.actionSlot);
        if (!Number.isInteger(actionSlot) || !smeltingWindow?.slots?.[actionSlot]) return Result.GUI_NOT_FOUND;

        this._setState({ status: 'SMELTING', pass });
        const clickedAction = await gui.click(actionSlot, Number(settings.actionButton) || 0, 0);
        if (clickedAction !== Result.SUCCESS) return clickedAction;
        await this._sleep(this._actionDelayMs(settings));
        await this._closeOpenWindow(gui);
        return Result.SUCCESS;
    }

    async _closeOpenWindow(gui) {
        if (!gui.isOpen()) return;
        const closed = this.events?.waitFor
            ? this.events.waitFor(Events.GUI.CLOSE, 1000).catch(() => null)
            : null;
        await gui.close();
        await closed;
    }

    _waitForWindowChange(gui, previousWindow, previousUpdateAt, timeout) {
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
                const error = new Error(`GUI nung không mở sau ${timeout} ms.`);
                error.code = Result.GUI_TIMEOUT;
                reject(error);
            }, this._bounded(timeout, 1000, 15000, DEFAULT_SETTINGS.guiTimeoutMs));
        });
    }

    _passCount(settings) {
        return this._bounded(settings.passes, 0, 5, DEFAULT_SETTINGS.passes);
    }

    _actionDelayMs(settings) {
        return this._bounded(settings.actionDelayMs, 0, 10000, DEFAULT_SETTINGS.actionDelayMs);
    }

    _bounded(value, minimum, maximum, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(Math.max(Math.floor(number), minimum), maximum) : fallback;
    }

    async _sleep(milliseconds) {
        const scheduler = this.manager('scheduler');
        if (scheduler?.sleep) return scheduler.sleep(milliseconds);
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    _setState(extra = {}) {
        this.state.smelting = {
            status: 'IDLE',
            pass: 0,
            lastRunAt: null,
            lastError: null,
            lastSkipReason: null,
            ...(this.state.smelting || {}),
            ...extra
        };
    }

    async destroy() {
        this.running = false;
        await super.destroy();
        return Result.SUCCESS;
    }
}

module.exports = SmeltingService;
