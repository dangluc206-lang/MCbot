'use strict';

const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const MaterialConversionScreen = require('../screens/MaterialConversionScreen');

function menuWindow() {
    const slots = Array(27).fill(null);
    slots[10] = { name: 'anvil', count: 1 };
    return { title: 'Menu', slots, inventoryStart: 27 };
}

function conversionWindow() {
    const slots = Array(27).fill(null);
    slots[4] = { name: 'coal_block', count: 1 };
    return { title: 'Convert', slots, inventoryStart: 27 };
}

test('MaterialConversionScreen resolves new layout config, legacy config, and defaults', () => {
    const gui = { window: menuWindow };
    const modern = new MaterialConversionScreen(gui, { config: { guiLayouts: { materialConversion: {
        menuSlot: 8, menuButton: 1, actionButton: 1, menuTitle: 'Root', title: 'Conversion'
    } } } });
    assert.deepEqual([modern.menuSlot(), modern.menuButton(), modern.actionButton(), modern.menuTitle(), modern.conversionTitle()],
        [8, 1, 1, 'Root', 'Conversion']);

    const legacy = new MaterialConversionScreen(gui, { config: { storage: { conversion: { menuSlot: 9, actionButton: 1 } } } });
    assert.deepEqual([legacy.menuSlot(), legacy.menuButton(), legacy.actionButton(), legacy.menuTitle(), legacy.conversionTitle()],
        [9, 0, 1, null, null]);
    const defaults = new MaterialConversionScreen(gui);
    assert.deepEqual([defaults.menuSlot(), defaults.menuButton(), defaults.actionButton()], [10, 0, 0]);
});

test('MaterialConversionScreen finds exact target items and re-reads before safe clicks', async () => {
    let current = conversionWindow();
    const clicks = [];
    const screen = new MaterialConversionScreen({
        window: () => current,
        click: async (...args) => { clicks.push(args); return Result.SUCCESS; }
    });
    assert.deepEqual(screen.findTarget('coal_block'), { status: 'FOUND', slot: 4, slots: [4] });
    assert.equal(await screen.clickTarget('coal_block'), Result.SUCCESS);
    const snapshot = screen.snapshotSlot(4);
    current.slots[4] = { name: 'diamond_block', count: 1 };
    assert.equal(await screen.clickTargetIfUnchanged('coal_block', 4, snapshot), Result.ITEM_NOT_FOUND);
    current = conversionWindow();
    current.slots[5] = { name: 'coal_block', count: 1 };
    assert.equal(await screen.clickTarget('coal_block'), Result.ITEM_NOT_FOUND);
    assert.deepEqual(clicks, [[4, 0, 0]]);
});

test('MaterialConversionScreen accepts an explicitly configured custom unpack button alias', async () => {
    const window = conversionWindow();
    window.slots[4] = { name: 'paper', count: 1, displayName: 'Đổi thành than' };
    const clicks = [];
    const screen = new MaterialConversionScreen({
        window: () => window,
        click: async (...args) => { clicks.push(args); return Result.SUCCESS; }
    });

    const target = { aliases: ['Đổi thành than'] };
    assert.deepEqual(screen.findTarget(target), { status: 'FOUND', slot: 4, slots: [4] });
    assert.equal(await screen.clickTarget(target), Result.SUCCESS);
    assert.deepEqual(clicks, [[4, 0, 0]]);
});

test('MaterialConversionScreen waits safely for the next window before menu click', async () => {
    const events = new EventEmitter();
    const menu = menuWindow();
    const next = conversionWindow();
    let current = menu;
    const screen = new MaterialConversionScreen({
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
    const timeoutScreen = new MaterialConversionScreen({ window: () => current, click: async () => Result.SUCCESS }, { events });
    assert.deepEqual(await timeoutScreen.clickMenuAndWait(5), { result: Result.GUI_TIMEOUT, window: null });
    assert.equal(events.listenerCount(Events.GUI.OPEN), 0);
});
