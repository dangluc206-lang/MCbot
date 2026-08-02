'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Result = require('../core/constants/Result');
const CraftingRootScreen = require('../screens/CraftingRootScreen');

function rootWindow(title = 'Danh sách công thức') {
    const slots = Array(20).fill(null);
    slots[16] = { name: 'crafting_table', count: 1 };
    return { title, slots };
}

test('CraftingRootScreen resolves the new, legacy, and default recipe-list slots', () => {
    const gui = { window: rootWindow };

    assert.equal(new CraftingRootScreen(gui, {
        guiLayouts: { craftingRoot: { recipeListSlot: 7 } },
        crafting: { entrySlot: 12 }
    }).recipeListSlot(), 7);
    assert.equal(new CraftingRootScreen(gui, { crafting: { entrySlot: 12 } }).recipeListSlot(), 12);
    assert.equal(new CraftingRootScreen(gui).recipeListSlot(), 16);
});

test('CraftingRootScreen treats the title as diagnostic data and refuses only changed slots', async () => {
    const window = rootWindow();
    const clicks = [];
    const gui = {
        window: () => window,
        click: async (...args) => {
            clicks.push(args);
            return Result.SUCCESS;
        }
    };
    const screen = new CraftingRootScreen(gui);

    window.title = '§a✦ GUI custom bất kỳ ✦';
    assert.equal(await screen.clickRecipeList(), Result.SUCCESS);

    const snapshot = screen.snapshotSlot(16);
    window.slots[16] = { name: 'paper', count: 1 };
    assert.equal(await screen.clickRecipeListIfUnchanged(snapshot), Result.GUI_NOT_FOUND);

    const invalidButton = new CraftingRootScreen(gui, {
        guiLayouts: { craftingRoot: { recipeListButton: 2 } }
    });
    assert.equal(await invalidButton.clickRecipeList(), Result.GUI_CLICK_FAILED);
    assert.equal(clicks.length, 1);
});

test('CraftingRootScreen re-reads the root slot and clicks it through GUIService', async () => {
    const window = rootWindow();
    const clicks = [];
    const screen = new CraftingRootScreen({
        window: () => window,
        click: async (...args) => {
            clicks.push(args);
            return Result.SUCCESS;
        }
    });

    assert.equal(await screen.clickRecipeList(), Result.SUCCESS);
    assert.deepEqual(clicks, [[16, 0, 0, window]]);
});
