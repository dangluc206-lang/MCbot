'use strict';

const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const BaseScreen = require('./BaseScreen');
const { matchesItem } = require('../utils/ItemMatcher');
const { findSlot } = require('../utils/SlotFinder');

class MaterialConversionScreen extends BaseScreen {
    constructor(guiService, options = {}) {
        super(guiService);
        this.config = options.config && typeof options.config === 'object' ? options.config : {};
        this.events = options.events || null;
    }

    isMenuWindow(window = this.window()) {
        return BaseScreen.isValidWindow(window);
    }

    conversionRange(window = this.window()) {
        if (!BaseScreen.isValidWindow(window)) return { start: 0, end: 0 };
        const end = Number.isInteger(window.inventoryStart)
            ? Math.min(Math.max(window.inventoryStart, 0), window.slots.length)
            : window.slots.length;
        return { start: 0, end };
    }

    findTarget(target) {
        const window = this.window();
        if (!BaseScreen.isValidWindow(window) || !this.isConversionWindow(window)) return notFound();
        return findSlot(window, targetDefinition(target), this.conversionRange(window));
    }

    async clickMenu() {
        const slot = this.menuSlot();
        const button = this.menuButton();
        if (!this.isMenuWindow() || slot === null || button === null) return Result.GUI_NOT_FOUND;
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

    async clickTarget(target) {
        const found = this.findTarget(target);
        if (found.status !== 'FOUND') return Result.ITEM_NOT_FOUND;
        return this.clickTargetIfUnchanged(target, found.slot, this.snapshotSlot(found.slot));
    }

    async clickTargetIfUnchanged(target, slot, snapshot) {
        if (!this.isConversionWindow() || !inRange(slot, this.conversionRange())) return Result.GUI_NOT_FOUND;
        const item = this.slot(slot);
        if (!item || !this.isSlotUnchanged(slot, snapshot) || !matchesItem(item, targetDefinition(target))) {
            return Result.ITEM_NOT_FOUND;
        }
        const button = this.actionButton();
        return button === null ? Result.GUI_CLICK_FAILED : this.click(slot, button, 0);
    }

    isConversionWindow(window = this.window()) {
        return BaseScreen.isValidWindow(window);
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
        return configuredInteger(this.config.guiLayouts?.materialConversion?.menuSlot, this.config.storage?.conversion?.menuSlot, 10);
    }

    menuButton() {
        return configuredButton(this.config.guiLayouts?.materialConversion?.menuButton, this.config.storage?.conversion?.menuButton, 0);
    }

    actionButton() {
        return configuredButton(this.config.guiLayouts?.materialConversion?.actionButton, this.config.storage?.conversion?.actionButton, 0);
    }

    menuTitle() {
        return configuredTitle(this.config.guiLayouts?.materialConversion?.menuTitle, this.config.storage?.conversion?.menuTitle);
    }

    conversionTitle() {
        return configuredTitle(this.config.guiLayouts?.materialConversion?.title, this.config.storage?.conversion?.title);
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

function configuredTitle(primary, legacy) {
    const value = primary ?? legacy;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function inRange(slot, range) {
    return Number.isInteger(slot) && slot >= range.start && slot < range.end;
}

function notFound() {
    return { status: 'NOT_FOUND', slot: null, slots: [] };
}

function targetDefinition(target) {
    if (typeof target === 'string') return { vanillaName: target };
    return target && typeof target === 'object' ? target : {};
}

function normalizeTitle(value) {
    return String(value || '').replace(/\u00a7[0-9A-FK-OR]/gi, '').trim().toLowerCase();
}

function boundedTimeout(value) {
    const timeout = Number(value);
    return Number.isFinite(timeout) ? Math.min(Math.max(timeout, 1), 60000) : 5000;
}

module.exports = MaterialConversionScreen;
