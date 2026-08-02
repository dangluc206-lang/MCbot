'use strict';

const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const CraftingRecipeScreen = require('../screens/CraftingRecipeScreen');

function recipeWindow() {
    const slots = Array(30).fill(null);
    slots[3] = { name: 'amethyst_shard', displayName: 'Titan', count: 1 };
    return { title: 'Danh sách công thức', slots, inventoryStart: 27 };
}

test('CraftingRecipeScreen prefers a configured matching recipe slot, then falls back to SlotFinder', () => {
    const window = recipeWindow();
    window.slots[8] = { name: 'amethyst_shard', displayName: 'Wolfram', count: 1 };
    const screen = new CraftingRecipeScreen({ window: () => window });

    assert.deepEqual(screen.findRecipe({ slot: 3, name: 'Titan' }), {
        status: 'FOUND', slot: 3, slots: [3]
    });
    assert.deepEqual(screen.findRecipe({ slot: 2, aliases: ['Wolfram'] }), {
        status: 'FOUND', slot: 8, slots: [8]
    });
});

test('CraftingRecipeScreen clicks a configured recipe slot without title or item-name gating', async () => {
    const window = recipeWindow();
    window.title = '§d✦ GUI custom ✦';
    window.slots[11] = { name: 'paper', displayName: 'Tên server tùy chỉnh', count: 1 };
    const clicks = [];
    const screen = new CraftingRecipeScreen({
        window: () => window,
        click: async (...args) => { clicks.push(args); return Result.SUCCESS; }
    });

    assert.equal(await screen.clickRecipe({ slot: 11, name: 'Than tinh luyện' }), Result.SUCCESS);
    assert.deepEqual(clicks, [[11, 0, 0]]);
});

test('CraftingRecipeScreen does not select absent, ambiguous, or same-carrier custom recipes', async () => {
    const window = recipeWindow();
    window.slots[8] = { name: 'player_head', nbt: { ExtraAttributes: { id: 'OTHER_ALLOY' } } };
    window.slots[9] = { name: 'player_head', nbt: { ExtraAttributes: { id: 'SUPER_ALLOY' } } };
    window.slots[10] = { name: 'player_head', nbt: { ExtraAttributes: { id: 'SUPER_ALLOY' } } };
    const clicks = [];
    const screen = new CraftingRecipeScreen({
        window: () => window,
        click: async (...args) => {
            clicks.push(args);
            return Result.SUCCESS;
        }
    });

    assert.deepEqual(screen.findRecipe({ name: 'Missing' }), { status: 'NOT_FOUND', slot: null, slots: [] });
    assert.deepEqual(screen.findRecipe({ itemDefinition: { identifiers: ['SUPER_ALLOY'] } }), {
        status: 'MULTIPLE', slot: null, slots: [9, 10]
    });
    assert.equal(await screen.clickRecipe({ itemDefinition: { identifiers: ['SUPER_ALLOY'] } }), Result.ITEM_NOT_FOUND);
    assert.deepEqual(clicks, []);
});

test('CraftingRecipeScreen re-reads the recipe before click and waits for a new window with cleanup', async () => {
    let window = recipeWindow();
    const events = new EventEmitter();
    const clicks = [];
    let emitNextWindow = true;
    const screen = new CraftingRecipeScreen({
        window: () => window,
        click: async (...args) => {
            assert.equal(events.listenerCount(Events.GUI.OPEN), 1);
            clicks.push(args);
            if (emitNextWindow) {
                window = { title: 'Chọn số lượng', slots: [] };
                events.emit(Events.GUI.OPEN, window);
            }
            return Result.SUCCESS;
        }
    }, { events });
    const recipe = { slot: 3, name: 'Titan' };
    const snapshot = screen.snapshotSlot(3);
    window.slots[3] = { name: 'amethyst_shard', displayName: 'Wolfram', count: 1 };

    assert.equal(await screen.clickRecipeIfUnchanged(recipe, 3, snapshot), Result.ITEM_NOT_FOUND);
    assert.deepEqual(clicks, []);
    window = recipeWindow();
    assert.deepEqual(await screen.clickRecipeAndWait(recipe, 25), { result: Result.SUCCESS, window });
    assert.deepEqual(clicks, [[3, 0, 0]]);
    assert.equal(events.listenerCount(Events.GUI.OPEN), 0);

    emitNextWindow = false;
    window = recipeWindow();
    const timedOut = await screen.clickRecipeAndWait(recipe, 5);
    assert.equal(timedOut.result, Result.NO_ACTION);
    assert.equal(timedOut.window, window);
    assert.equal(events.listenerCount(Events.GUI.OPEN), 0);
});
