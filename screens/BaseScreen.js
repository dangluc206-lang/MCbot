'use strict';

const { isDeepStrictEqual } = require('node:util');
const Result = require('../core/constants/Result');

class BaseScreen {
    constructor(guiService) {
        this.gui = guiService || null;
    }

    window() {
        const window = typeof this.gui?.window === 'function' ? this.gui.window() : null;
        return BaseScreen.isValidWindow(window) ? window : null;
    }

    isOpen() {
        return this.window() !== null;
    }

    slot(slot) {
        const window = this.window();
        if (!window || !Number.isInteger(slot) || slot < 0 || slot >= window.slots.length) return null;
        return window.slots[slot] || null;
    }

    snapshotSlot(slot) {
        const item = this.slot(slot);
        return item ? structuredClone(item) : null;
    }

    isSlotUnchanged(slot, snapshot) {
        const item = this.slot(slot);
        if (snapshot === null) return item === null;
        return Boolean(item && isDeepStrictEqual(structuredClone(item), snapshot));
    }

    async click(slot, mouseButton = 0, mode = 0, expectedWindow = null) {
        if (!this.window()) return Result.GUI_NOT_FOUND;
        if (typeof this.gui?.click !== 'function') return Result.GUI_CLICK_FAILED;
        return expectedWindow
            ? this.gui.click(slot, mouseButton, mode, expectedWindow)
            : this.gui.click(slot, mouseButton, mode);
    }

    static isValidWindow(window) {
        return Boolean(window && typeof window === 'object' && Array.isArray(window.slots));
    }
}

module.exports = BaseScreen;
