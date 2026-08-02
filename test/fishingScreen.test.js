'use strict';

const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const FishingScreen = require('../screens/FishingScreen');

function afkWindow() {
    const slots = Array(27).fill(null);
    slots[11] = { name: 'fishing_rod', count: 1 };
    slots[13] = { name: 'fishing_rod', count: 1 };
    return { title: 'AFK Fishing', slots, inventoryStart: 27 };
}

test('FishingScreen resolves new layout config, legacy config, and defaults', () => {
    const gui = { window: afkWindow };
    const modern = new FishingScreen(gui, { config: { guiLayouts: { fishingAfk: { slots: [4, 6], title: 'AFK Menu' } } } });
    assert.deepEqual(modern.afkSlots(), [4, 6]);
    assert.equal(modern.title(), 'AFK Menu');
    const legacy = new FishingScreen(gui, { config: { fishing: { afkSlots: [11, 13, 11], afkTitle: 'Legacy AFK' } } });
    assert.deepEqual(legacy.afkSlots(), [11, 13]);
    assert.equal(legacy.title(), 'Legacy AFK');
    assert.deepEqual(new FishingScreen(gui).afkSlots(), [11, 13, 15]);
});

test('FishingScreen recognises AFK GUI and re-reads configured slots before clicking', async () => {
    let current = afkWindow();
    const clicks = [];
    const screen = new FishingScreen({
        window: () => current,
        click: async (...args) => { clicks.push(args); return Result.SUCCESS; }
    }, { config: { fishing: { afkSlots: [11, 13] } } });

    assert.equal(await screen.clickAfkSlot(11), Result.SUCCESS);
    const snapshot = screen.snapshotSlot(13);
    current.slots[13] = { name: 'paper', count: 1 };
    assert.equal(await screen.clickAfkSlotIfUnchanged(13, snapshot), Result.GUI_NOT_FOUND);
    assert.equal(await screen.clickAfkSlot(15), Result.GUI_NOT_FOUND);
    current = { ...current, title: 'Other' };
    assert.equal(await screen.clickAfkSlot(11), Result.SUCCESS);
    assert.deepEqual(clicks, [[11, 0, 0], [11, 0, 0]]);
});

test('FishingScreen registers and cleans the open listener safely', async () => {
    const events = new EventEmitter();
    const previous = { title: 'Old', slots: [] };
    const next = afkWindow();
    let current = previous;
    const screen = new FishingScreen({ window: () => current }, { events });
    const waiting = screen.waitForOpen(previous, 50);
    assert.equal(events.listenerCount(Events.GUI.OPEN), 1);
    current = next;
    events.emit(Events.GUI.OPEN, next);
    assert.equal(await waiting.promise, next);
    assert.equal(events.listenerCount(Events.GUI.OPEN), 0);

    current = previous;
    const timeout = screen.waitForOpen(previous, 5);
    await assert.rejects(timeout.promise, /GUI \/afk/);
    assert.equal(events.listenerCount(Events.GUI.OPEN), 0);
});
