'use strict';

const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const BaseScreen = require('./BaseScreen');

class FishingScreen extends BaseScreen {
    constructor(guiService, options = {}) {
        super(guiService);
        this.config = options.config && typeof options.config === 'object' ? options.config : {};
        this.events = options.events || null;
    }

    isAfkWindow(window = this.window()) {
        return BaseScreen.isValidWindow(window);
    }

    afkSlots() {
        const configured = this.config.guiLayouts?.fishingAfk?.slots
            ?? this.config.fishing?.afkSlots
            ?? [11, 13, 15];
        return Array.isArray(configured)
            ? [...new Set(configured.filter(slot => Number.isInteger(slot) && slot >= 0))]
            : [];
    }

    async clickAfkSlot(slot) {
        if (!this.isAfkWindow() || !this.afkSlots().includes(slot)) return Result.GUI_NOT_FOUND;
        return this.clickAfkSlotIfUnchanged(slot, this.snapshotSlot(slot));
    }

    async clickAfkSlotIfUnchanged(slot, snapshot) {
        if (!this.isAfkWindow() || !this.afkSlots().includes(slot) || !snapshot
            || !this.isSlotUnchanged(slot, snapshot)) return Result.GUI_NOT_FOUND;
        return this.click(slot, 0, 0);
    }

    waitForOpen(previousWindow, timeout = 10000) {
        if (typeof this.events?.on !== 'function' || typeof this.events?.off !== 'function') return null;
        if (this.window() && this.window() !== previousWindow) {
            return { promise: Promise.resolve(this.window()), cancel: () => {} };
        }
        let cleanup;
        const promise = new Promise((resolve, reject) => {
            const onOpen = window => {
                if (!window || window === previousWindow) return;
                cleanup();
                resolve(window);
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error(`GUI /afk kh\u00f4ng m\u1edf sau ${timeout} ms.`));
            }, boundedTimeout(timeout));
            cleanup = () => {
                clearTimeout(timer);
                this.events.off(Events.GUI.OPEN, onOpen);
            };
            this.events.on(Events.GUI.OPEN, onOpen);
        });
        return { promise, cancel: () => cleanup?.() };
    }

    title() {
        const configured = this.config.guiLayouts?.fishingAfk?.title
            ?? this.config.fishing?.afkTitle;
        return typeof configured === 'string' && configured.trim() ? configured.trim() : null;
    }
}

function normalizeTitle(value) {
    return String(value || '').replace(/\u00a7[0-9A-FK-OR]/gi, '').trim().toLowerCase();
}

function boundedTimeout(value) {
    const timeout = Number(value);
    return Number.isFinite(timeout) ? Math.min(Math.max(timeout, 1), 60000) : 10000;
}

module.exports = FishingScreen;
