'use strict';
const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const DungeonScreen = require('../screens/DungeonScreen');
function window(title, index) { const slots = Array(54).fill(null); slots[index] = { name: 'paper', count: 1 }; return { title, slots }; }
test('DungeonScreen resolves slots and clicks validated Dungeon and AutoFarm buttons', async () => {
    let current = window('Dungeon', 12); const calls = [];
    const screen = new DungeonScreen({ window: () => current, click: async (...args) => { calls.push(args); return Result.SUCCESS; } });
    assert.deepEqual([screen.entrySlot(), screen.autofarmSlot()], [12, 21]);
    assert.equal(await screen.clickEntry(), Result.SUCCESS);
    current = window('AutoFarm', 21);
    assert.equal(await screen.clickAutofarm(), Result.SUCCESS);
    current.slots[21] = null;
    assert.equal(await screen.clickAutofarm(), Result.GUI_NOT_FOUND);
    assert.deepEqual(calls, [[12, 0, 0], [21, 0, 0]]);
});
test('DungeonScreen supports new and legacy config and cleans open listeners', async () => {
    const events = new EventEmitter(); const previous = window('Dungeon', 12); const next = window('AutoFarm', 21); let current = previous;
    const modern = new DungeonScreen({ window: () => current }, { events, config: { guiLayouts: { dungeon: { entrySlot: 7, autofarmSlot: 8 } } } });
    assert.deepEqual([modern.entrySlot(), modern.autofarmSlot()], [7, 8]);
    const waiting = modern.waitForOpen(previous, 50); assert.equal(events.listenerCount(Events.GUI.OPEN), 1);
    current = next; events.emit(Events.GUI.OPEN, next); assert.equal(await waiting.promise, next); assert.equal(events.listenerCount(Events.GUI.OPEN), 0);
});
