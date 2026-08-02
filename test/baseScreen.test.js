'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Result = require('../core/constants/Result');
const BaseScreen = require('../screens/BaseScreen');

test('BaseScreen safely reads a valid GUI window and snapshots slots', () => {
    const window = { slots: [null, { name: 'diamond', count: 3 }] };
    const screen = new BaseScreen({ window: () => window });

    assert.equal(screen.isOpen(), true);
    assert.equal(screen.window(), window);
    assert.equal(screen.slot(1), window.slots[1]);
    assert.equal(screen.slot(5), null);

    const snapshot = screen.snapshotSlot(1);
    const emptySnapshot = screen.snapshotSlot(0);
    assert.equal(screen.isSlotUnchanged(0, emptySnapshot), true);
    window.slots[0] = { name: 'coal', count: 1 };
    assert.equal(screen.isSlotUnchanged(0, emptySnapshot), false);
    window.slots[0] = null;
    window.slots[1].count = 2;
    assert.equal(snapshot.count, 3);
    assert.equal(screen.isSlotUnchanged(1, snapshot), false);
    window.slots[1].count = 3;
    assert.equal(screen.isSlotUnchanged(1, snapshot), true);
});

test('BaseScreen accepts an unchanged Mineflayer-style item instance after snapshotting', () => {
    class MineflayerItem {
        constructor() {
            this.name = 'grass_block';
            this.count = 1;
            this.components = { custom_name: 'SkyBlock' };
        }
    }

    const window = { slots: [new MineflayerItem()] };
    const screen = new BaseScreen({ window: () => window });
    const snapshot = screen.snapshotSlot(0);

    assert.equal(screen.isSlotUnchanged(0, snapshot), true);
    window.slots[0].count = 2;
    assert.equal(screen.isSlotUnchanged(0, snapshot), false);
});

test('BaseScreen rejects invalid windows and delegates clicks only to GUIService', async () => {
    const clicks = [];
    const gui = {
        window: () => ({ slots: [] }),
        click: async (...args) => {
            clicks.push(args);
            return Result.SUCCESS;
        }
    };
    const screen = new BaseScreen(gui);

    assert.equal(await screen.click(4, 1, 2), Result.SUCCESS);
    assert.deepEqual(clicks, [[4, 1, 2]]);

    const missing = new BaseScreen({ window: () => ({ slots: null }) });
    assert.equal(missing.isOpen(), false);
    assert.equal(missing.slot(0), null);
    assert.equal(await missing.click(0), Result.GUI_NOT_FOUND);
});
