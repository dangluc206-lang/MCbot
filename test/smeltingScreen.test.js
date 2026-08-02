'use strict';

const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const SmeltingScreen = require('../screens/SmeltingScreen');

function menuWindow() {
    const slots = Array(27).fill(null);
    slots[12] = { name: 'furnace', count: 1 };
    return { title: 'Ch\u1ebf t\u1ea1o', slots, inventoryStart: 27 };
}

function smeltingWindow() {
    const slots = Array(27).fill(null);
    slots[1] = { name: 'furnace', count: 1 };
    return { title: 'Nung raw', slots, inventoryStart: 27 };
}

test('SmeltingScreen resolves new layout config, legacy config, and defaults', () => {
    const gui = { window: menuWindow };
    const modern = new SmeltingScreen(gui, { config: { guiLayouts: { smelting: {
        menuSlot: 9, menuButton: 1, actionSlot: 3, actionButton: 1, menuTitle: 'Root', title: 'Smelt'
    } } } });
    assert.deepEqual([modern.menuSlot(), modern.menuButton(), modern.actionSlot(), modern.actionButton(), modern.menuTitle(), modern.smeltingTitle()],
        [9, 1, 3, 1, 'Root', 'Smelt']);

    const legacy = new SmeltingScreen(gui, { config: { storage: { smelting: { menuSlot: 8, actionSlot: 4 } } } });
    assert.deepEqual([legacy.menuSlot(), legacy.actionSlot(), legacy.menuTitle(), legacy.smeltingTitle()], [8, 4, 'Ch\u1ebf t\u1ea1o', 'Nung raw']);

    const defaults = new SmeltingScreen(gui);
    assert.deepEqual([defaults.menuSlot(), defaults.menuButton(), defaults.actionSlot(), defaults.actionButton()], [12, 0, 1, 0]);
});

test('SmeltingScreen validates windows and re-reads slot before clicking through GUIService', async () => {
    let current = menuWindow();
    const clicks = [];
    const screen = new SmeltingScreen({
        window: () => current,
        click: async (...args) => { clicks.push(args); return Result.SUCCESS; }
    });

    assert.equal(await screen.clickMenu(), Result.SUCCESS);
    const snapshot = screen.snapshotSlot(12);
    current.slots[12] = { name: 'changed', count: 1 };
    assert.equal(await screen.clickMenuIfUnchanged(snapshot), Result.GUI_NOT_FOUND);
    current = { ...current, title: '§a✦ GUI custom ✦' };
    assert.equal(await screen.clickMenu(), Result.SUCCESS);
    current = smeltingWindow();
    assert.equal(await screen.clickAction(), Result.SUCCESS);
    assert.deepEqual(clicks, [[12, 0, 0], [12, 0, 0], [1, 0, 0]]);
});

test('SmeltingScreen registers and cleans next-window listener before clicking', async () => {
    const events = new EventEmitter();
    const menu = menuWindow();
    const next = smeltingWindow();
    let current = menu;
    const screen = new SmeltingScreen({
        window: () => current,
        click: async () => {
            assert.equal(events.listenerCount(Events.GUI.OPEN), 1);
            current = next;
            events.emit(Events.GUI.OPEN, next);
            return Result.SUCCESS;
        }
    }, { events });

    assert.deepEqual(await screen.clickMenuAndWait(50), { result: Result.SUCCESS, window: next });
    assert.equal(events.listenerCount(Events.GUI.OPEN), 0);
    assert.equal(events.listenerCount(Events.GUI.UPDATE), 0);

    current = menu;
    const timeoutScreen = new SmeltingScreen({ window: () => current, click: async () => Result.SUCCESS }, { events });
    assert.deepEqual(await timeoutScreen.clickMenuAndWait(5), { result: Result.GUI_TIMEOUT, window: null });
    assert.equal(events.listenerCount(Events.GUI.OPEN), 0);
    assert.equal(events.listenerCount(Events.GUI.UPDATE), 0);
});
