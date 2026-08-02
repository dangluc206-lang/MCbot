'use strict';

const Result = require('../core/constants/Result');
const BaseScreen = require('./BaseScreen');

class CraftingRootScreen extends BaseScreen {
    constructor(guiService, config = {}) {
        super(guiService);
        this.config = config && typeof config === 'object' ? config : {};
    }

    recipeListSlot() {
        const configured = this.config.guiLayouts?.craftingRoot?.recipeListSlot
            ?? this.config.crafting?.entrySlot
            ?? 16;
        return Number.isInteger(configured) && configured >= 0 ? configured : null;
    }

    recipeListButton() {
        const configured = this.config.guiLayouts?.craftingRoot?.recipeListButton
            ?? this.config.crafting?.entryButton
            ?? 0;
        return Number.isInteger(configured) && configured >= 0 && configured <= 1 ? configured : null;
    }

    isRootWindow(window = this.window()) {
        return BaseScreen.isValidWindow(window);
    }

    async clickRecipeList() {
        const slot = this.recipeListSlot();
        const button = this.recipeListButton();
        const window = this.window();
        if (!this.isRootWindow(window)) return Result.GUI_NOT_FOUND;
        if (slot === null || button === null) return Result.GUI_CLICK_FAILED;
        const snapshot = this.snapshotSlot(slot);
        return this.clickRecipeListIfUnchanged(snapshot, window);
    }

    async clickRecipeListIfUnchanged(snapshot, expectedWindow = this.window()) {
        const slot = this.recipeListSlot();
        const button = this.recipeListButton();
        if (!expectedWindow || this.window() !== expectedWindow || !this.isRootWindow(expectedWindow)) return Result.GUI_NOT_FOUND;
        if (slot === null || button === null || !this.slot(slot) || !this.isSlotUnchanged(slot, snapshot)) {
            return Result.GUI_NOT_FOUND;
        }
        if (typeof this.gui?.click !== 'function') return Result.GUI_CLICK_FAILED;
        return this.gui.click(slot, button, 0, expectedWindow);
    }

}

module.exports = CraftingRootScreen;
