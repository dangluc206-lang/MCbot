'use strict';

const Result = require('../core/constants/Result');
const BaseScreen = require('./BaseScreen');

const AMOUNTS = Object.freeze({ ONE: 'ONE', STACK: 'STACK', ALL: 'ALL' });
const DEFAULT_SLOTS = Object.freeze({ ONE: 20, STACK: 22, ALL: 24 });

class CraftAmountScreen extends BaseScreen {
    constructor(guiService, options = {}) {
        super(guiService);
        this.config = options.config && typeof options.config === 'object' ? options.config : {};
    }

    isAmountWindow(window = this.window()) {
        return BaseScreen.isValidWindow(window);
    }

    resolveAmount(amount) {
        const key = typeof amount === 'string' ? amount.trim().toUpperCase() : '';
        if (!Object.hasOwn(AMOUNTS, key)) return null;
        const slot = this.amountSlot(key);
        return Number.isInteger(slot) && slot >= 0 ? { amount: key, slot } : null;
    }

    amountSlot(amount) {
        const key = String(amount || '').toUpperCase();
        const lower = key.toLowerCase();
        const configured = this.config.guiLayouts?.craftAmount?.[`${lower}Slot`]
            ?? this.config.crafting?.amount?.[`${lower}Slot`]
            ?? this.config.crafting?.amountSlots?.[lower]
            ?? this.config.crafting?.[`${lower}Slot`]
            ?? DEFAULT_SLOTS[key];
        return Number.isInteger(configured) && configured >= 0 ? configured : null;
    }

    closeTimeoutMs() {
        const configured = this.config.guiLayouts?.craftAmount?.closeTimeoutMs
            ?? this.config.crafting?.amount?.closeTimeoutMs
            ?? this.config.crafting?.amountCloseTimeoutMs
            ?? this.config.crafting?.closeTimeoutMs
            ?? this.config.crafting?.guiTimeoutMs
            ?? 5000;
        const timeout = Number(configured);
        return Number.isFinite(timeout) ? Math.min(Math.max(timeout, 1), 60000) : 5000;
    }

    async select(amount, mouseButton = 0, mode = 0, expectedWindow = null) {
        const resolved = this.resolveAmount(amount);
        if (!this.isAmountWindow() || (expectedWindow && this.window() !== expectedWindow)) {
            return { result: Result.GUI_NOT_FOUND, window: null };
        }
        if (!resolved || !validButton(mouseButton) || !this.slot(resolved.slot)) {
            return { result: Result.GUI_CLICK_FAILED, window: null };
        }
        try {
            const result = await this.clickIfUnchanged(
                resolved.slot,
                this.snapshotSlot(resolved.slot),
                mouseButton,
                mode,
                expectedWindow
            );
            return { result, window: null };
        } catch (_) {
            return { result: Result.GUI_CLICK_FAILED, window: null };
        }
    }

    async clickIfUnchanged(slot, snapshot, mouseButton = 0, mode = 0, expectedWindow = null) {
        if (!this.isAmountWindow() || (expectedWindow && this.window() !== expectedWindow)
            || !validButton(mouseButton) || !this.slot(slot) || !this.isSlotUnchanged(slot, snapshot)) {
            return Result.GUI_NOT_FOUND;
        }
        return this.click(slot, mouseButton, mode, expectedWindow);
    }

}

function validButton(button) {
    return Number.isInteger(button) && button >= 0 && button <= 1;
}

module.exports = CraftAmountScreen;
