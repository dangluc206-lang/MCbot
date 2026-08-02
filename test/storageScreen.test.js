'use strict';

const { EventEmitter } = require('node:events');
const test = require('node:test');
const assert = require('node:assert/strict');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const StorageScreen = require('../screens/StorageScreen');

function storageWindow() {
    const slots = Array(90).fill(null);
    slots[10] = { name: 'player_head', nbt: { ExtraAttributes: { id: 'REFINED_GOLD' } }, count: 1 };
    slots[55] = { name: 'diamond', count: 1 };
    return { title: 'Kho chứa', slots, inventoryStart: 54 };
}

test('StorageScreen recognises storage, scopes searches to container slots, and snapshots safely', () => {
    const window = storageWindow();
    const screen = new StorageScreen({ window: () => window });

    assert.equal(screen.isStorageWindow(), true);
    assert.deepEqual(screen.storageRange(), { start: 0, end: 54 });
    assert.deepEqual(screen.findItem({ identifiers: ['REFINED_GOLD'] }), {
        status: 'FOUND', slot: 10, slots: [10]
    });
    assert.deepEqual(screen.findItem({ vanillaName: 'diamond' }), { status: 'NOT_FOUND', slot: null, slots: [] });
    const snapshot = screen.snapshotStorageSlot(10);
    window.slots[10].count = 2;
    assert.equal(snapshot.count, 1);
});

test('StorageScreen refuses wrong windows, changed items, and ambiguous matches without clicking', async () => {
    const window = storageWindow();
    window.slots[11] = { name: 'player_head', nbt: { ExtraAttributes: { id: 'REFINED_GOLD' } } };
    const clicks = [];
    const screen = new StorageScreen({
        window: () => window,
        click: async (...args) => {
            clicks.push(args);
            return Result.SUCCESS;
        }
    });
    const definition = { identifiers: ['REFINED_GOLD'] };
    const snapshot = screen.snapshotStorageSlot(10);

    assert.equal(await screen.clickUnique(definition), Result.ITEM_NOT_FOUND);
    window.slots[11] = null;
    window.slots[10] = { name: 'player_head', nbt: { ExtraAttributes: { id: 'OTHER_ITEM' } } };
    assert.equal(await screen.clickIfUnchanged(10, snapshot, definition), Result.ITEM_NOT_FOUND);
    window.title = 'Personal Vault';
    assert.equal(await screen.clickUnique(definition), Result.ITEM_NOT_FOUND);
    assert.deepEqual(clicks, []);
});

test('StorageScreen clicks through GUIService and cleans its close listener', async () => {
    const window = storageWindow();
    const events = new EventEmitter();
    const clicks = [];
    const definition = { identifiers: ['REFINED_GOLD'] };
    const screen = new StorageScreen({
        window: () => window,
        click: async (...args) => {
            assert.equal(events.listenerCount(Events.GUI.CLOSE), 1);
            clicks.push(args);
            events.emit(Events.GUI.CLOSE, window);
            return Result.SUCCESS;
        }
    }, { events });

    assert.deepEqual(await screen.clickUniqueAndWaitForClose(definition), { result: Result.SUCCESS, window });
    assert.deepEqual(clicks, [[10, 0, 0]]);
    assert.equal(events.listenerCount(Events.GUI.CLOSE), 0);

    const timeoutScreen = new StorageScreen({ window: () => window, click: async () => Result.SUCCESS }, { events });
    assert.deepEqual(await timeoutScreen.clickUniqueAndWaitForClose(definition, 5), {
        result: Result.GUI_TIMEOUT,
        window: null
    });
    assert.equal(events.listenerCount(Events.GUI.CLOSE), 0);
});
