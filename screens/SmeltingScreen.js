'use strict';

const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const BaseScreen = require('./BaseScreen');

class SmeltingScreen extends BaseScreen {
    constructor(guiService, options = {}) {
        super(guiService);
        this.config = options.config && typeof options.config === 'object' ? options.config : {};
        this.events = options.events || null;
    }

    isMenuWindow(window = this.window()) {
        return BaseScreen.isValidWindow(window);
    }

    isSmeltingWindow(window = this.window()) {
        return BaseScreen.isValidWindow(window);
    }

    async clickMenu() {
        const slot = this.menuSlot();
        const button = this.menuButton();
        if (!this.isMenuWindow()) return Result.GUI_NOT_FOUND;
        if (slot === null || button === null) return Result.GUI_CLICK_FAILED;
        return this.clickMenuIfUnchanged(this.snapshotSlot(slot));
    }

    async clickMenuIfUnchanged(snapshot) {
        const slot = this.menuSlot();
        const button = this.menuButton();
        if (!this.isMenuWindow() || slot === null || button === null || !this.slot(slot)
            || !this.isSlotUnchanged(slot, snapshot)) return Result.GUI_NOT_FOUND;
        return this.click(slot, button, 0);
    }

    async clickMenuAndWait(timeout = 5000) {
        const waiting = this.waitForNextWindow(this.window(), timeout);
        if (!waiting) return { result: Result.FAILED, window: null };
        try {
            const result = await this.clickMenu();
            if (result !== Result.SUCCESS) {
                waiting.cancel();
                return { result, window: null };
            }
            return await waiting.promise;
        } catch (_) {
            waiting.cancel();
            return { result: Result.GUI_CLICK_FAILED, window: null };
        }
    }

    async clickAction() {
        const slot = this.actionSlot();
        const button = this.actionButton();
        if (!this.isSmeltingWindow()) return Result.GUI_NOT_FOUND;
        if (slot === null || button === null) return Result.GUI_CLICK_FAILED;
        return this.clickActionIfUnchanged(this.snapshotSlot(slot));
    }

    async clickActionIfUnchanged(snapshot) {
        const slot = this.actionSlot();
        const button = this.actionButton();
        if (!this.isSmeltingWindow() || slot === null || button === null || !this.slot(slot)
            || !this.isSlotUnchanged(slot, snapshot)) return Result.GUI_NOT_FOUND;
        return this.click(slot, button, 0);
    }

    waitForNextWindow(previousWindow, timeout = 5000) {
        if (typeof this.events?.on !== 'function' || typeof this.events?.off !== 'function') return null;
        let cleanup;
        const promise = new Promise(resolve => {
            const finish = value => {
                cleanup();
                resolve(value);
            };
            const onOpen = window => {
                if (window && window !== previousWindow) finish({ result: Result.SUCCESS, window });
            };
            const onUpdate = () => {
                const window = this.window();
                if (window && window !== previousWindow) finish({ result: Result.SUCCESS, window });
            };
            const timer = setTimeout(() => finish({ result: Result.GUI_TIMEOUT, window: null }), boundedTimeout(timeout));
            cleanup = () => {
                clearTimeout(timer);
                this.events.off(Events.GUI.OPEN, onOpen);
                this.events.off(Events.GUI.UPDATE, onUpdate);
            };
            this.events.on(Events.GUI.OPEN, onOpen);
            this.events.on(Events.GUI.UPDATE, onUpdate);
        });
        return { promise, cancel: () => cleanup?.() };
    }

    menuSlot() {
        return configuredInteger(this.config.guiLayouts?.smelting?.menuSlot, this.config.storage?.smelting?.menuSlot, 12);
    }

    menuButton() {
        return configuredButton(this.config.guiLayouts?.smelting?.menuButton, this.config.storage?.smelting?.menuButton, 0);
    }

    actionSlot() {
        return configuredInteger(this.config.guiLayouts?.smelting?.actionSlot, this.config.storage?.smelting?.actionSlot, 1);
    }

    actionButton() {
        return configuredButton(this.config.guiLayouts?.smelting?.actionButton, this.config.storage?.smelting?.actionButton, 0);
    }

    menuTitle() {
        return configuredTitle(this.config.guiLayouts?.smelting?.menuTitle, this.config.storage?.smelting?.menuTitle, 'Ch\u1ebf t\u1ea1o');
    }

    smeltingTitle() {
        return configuredTitle(this.config.guiLayouts?.smelting?.title, this.config.storage?.smelting?.title, 'Nung raw');
    }
}

function configuredInteger(primary, legacy, fallback) {
    const value = primary ?? legacy ?? fallback;
    return Number.isInteger(value) && value >= 0 ? value : null;
}

function configuredButton(primary, legacy, fallback) {
    const value = primary ?? legacy ?? fallback;
    return Number.isInteger(value) && value >= 0 && value <= 1 ? value : null;
}

function configuredTitle(primary, legacy, fallback) {
    const value = primary ?? legacy ?? fallback;
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeTitle(value) {
    return String(value || '').replace(/\u00a7[0-9A-FK-OR]/gi, '').trim().toLowerCase();
}

function boundedTimeout(value) {
    const timeout = Number(value);
    return Number.isFinite(timeout) ? Math.min(Math.max(timeout, 1), 60000) : 5000;
}

module.exports = SmeltingScreen;
