'use strict';

const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const BaseScreen = require('./BaseScreen');
const { matchesItem } = require('../utils/ItemMatcher');
const { findSlot } = require('../utils/SlotFinder');

class CraftingRecipeScreen extends BaseScreen {
    constructor(guiService, options = {}) {
        super(guiService);
        this.events = options.events || null;
    }

    isRecipeWindow(window = this.window()) {
        return BaseScreen.isValidWindow(window);
    }

    recipeRange(window = this.window()) {
        if (!this.isRecipeWindow(window)) return { start: 0, end: 0 };
        const end = Number.isInteger(window.inventoryStart)
            ? Math.min(Math.max(window.inventoryStart, 0), window.slots.length)
            : window.slots.length;
        return { start: 0, end };
    }

    findRecipe(recipe) {
        const window = this.window();
        if (!this.isRecipeWindow(window)) return notFound();
        const definition = itemDefinition(recipe);
        const configuredSlot = Number.isInteger(recipe?.slot) ? recipe.slot : null;
        if (configuredSlot !== null && inRange(configuredSlot, this.recipeRange(window))
            && this.slot(configuredSlot)) {
            return { status: 'FOUND', slot: configuredSlot, slots: [configuredSlot] };
        }
        return findSlot(window, definition, this.recipeRange(window));
    }

    async clickRecipe(recipe, mouseButton = 0, mode = 0) {
        const found = this.findRecipe(recipe);
        if (found.status !== 'FOUND') return Result.ITEM_NOT_FOUND;
        return this.clickRecipeIfUnchanged(recipe, found.slot, this.snapshotSlot(found.slot), mouseButton, mode);
    }

    async clickRecipeIfUnchanged(recipe, slot, snapshot, mouseButton = 0, mode = 0) {
        if (!this.isRecipeWindow()) return Result.GUI_NOT_FOUND;
        const item = this.slot(slot);
        if (!item || !this.isSlotUnchanged(slot, snapshot)) {
            return Result.ITEM_NOT_FOUND;
        }
        return this.click(slot, mouseButton, mode);
    }

    async clickRecipeAndWait(recipe, timeout = 5000, mouseButton = 0, mode = 0) {
        const waiting = this.waitForNextWindow(this.window(), timeout);
        if (!waiting) return { result: Result.FAILED, window: null };

        const result = await this.clickRecipe(recipe, mouseButton, mode);
        if (result !== Result.SUCCESS) {
            waiting.cancel();
            return { result, window: null };
        }
        return waiting.promise;
    }

    waitForNextWindow(previousWindow, timeout = 5000) {
        if (typeof this.events?.on !== 'function' || typeof this.events?.off !== 'function') return null;

        let cleanup;
        const promise = new Promise(resolve => {
            const onOpen = window => {
                if (window && window !== previousWindow) finish({ result: Result.SUCCESS, window });
            };
            const onUpdate = () => {
                if (this.window() === previousWindow) finish({ result: Result.NO_ACTION, window: previousWindow });
            };
            // A server may accept the recipe click without opening a separate
            // amount window. Leave acknowledgement to CraftingService instead
            // of turning this observation timeout into a click failure.
            const timer = setTimeout(() => finish({ result: Result.NO_ACTION, window: previousWindow }), boundedTimeout(timeout));
            const finish = value => {
                cleanup();
                resolve(value);
            };
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
}

function itemDefinition(recipe) {
    const configured = recipe?.itemDefinition || recipe?.item || {};
    const aliases = [
        ...(Array.isArray(configured.aliases) ? configured.aliases : []),
        ...(Array.isArray(recipe?.aliases) ? recipe.aliases : []),
        recipe?.name
    ].filter(value => typeof value === 'string' && value.trim());
    return { ...configured, aliases };
}

function inRange(slot, range) {
    return slot >= range.start && slot < range.end;
}

function notFound() {
    return { status: 'NOT_FOUND', slot: null, slots: [] };
}

function boundedTimeout(value) {
    const timeout = Number(value);
    return Number.isFinite(timeout) ? Math.min(Math.max(timeout, 1), 60000) : 5000;
}

module.exports = CraftingRecipeScreen;
