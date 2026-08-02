'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Result = require('../core/constants/Result');
const PersonalVaultScreen = require('../screens/PersonalVaultScreen');

function vaultWindow() {
    return {
        title: 'Personal Vault',
        inventoryStart: 3,
        inventoryEnd: 6,
        slots: [
            { name: 'player_head', nbt: { ExtraAttributes: { id: 'SUPER_ALLOY' } }, count: 2 },
            null,
            { name: 'player_head', nbt: { ExtraAttributes: { id: 'OTHER_ALLOY' } }, count: 1 },
            { name: 'diamond', count: 4 },
            null,
            { name: 'diamond', count: 1 }
        ]
    };
}

test('PersonalVaultScreen recognises its window, regions, snapshots, and ItemMatcher matches', () => {
    const window = vaultWindow();
    const screen = new PersonalVaultScreen({ window: () => window });
    const superAlloy = { identifiers: ['SUPER_ALLOY'], vanillaName: 'player_head' };

    assert.equal(screen.isVaultWindow(), true);
    assert.deepEqual(screen.vaultRange(), { start: 0, end: 3 });
    assert.deepEqual(screen.playerInventoryRange(), { start: 3, end: 6 });
    assert.deepEqual(screen.findVaultItem(superAlloy), { status: 'FOUND', slot: 0, slots: [0] });
    assert.deepEqual(screen.findPlayerInventoryItem({ vanillaName: 'diamond' }), {
        status: 'MULTIPLE', slot: null, slots: [3, 5]
    });

    const snapshots = screen.snapshotVaultSlots();
    assert.equal(snapshots.length, 3);
    assert.equal(snapshots[0].item.count, 2);
    window.slots[0].count = 1;
    assert.equal(snapshots[0].item.count, 2);
});

test('PersonalVaultScreen refuses invalid windows, changed slots, mismatches, and ambiguous clicks', async () => {
    const window = vaultWindow();
    const clicks = [];
    const gui = {
        window: () => window,
        click: async (...args) => {
            clicks.push(args);
            return Result.SUCCESS;
        }
    };
    const screen = new PersonalVaultScreen(gui);
    const superAlloy = { identifiers: ['SUPER_ALLOY'], vanillaName: 'player_head' };
    const snapshot = screen.snapshotSlot(0);

    window.slots[0] = { name: 'player_head', nbt: { ExtraAttributes: { id: 'OTHER_ALLOY' } }, count: 2 };
    assert.equal(await screen.clickIfUnchanged(0, snapshot, superAlloy), Result.ITEM_NOT_FOUND);
    assert.equal(await screen.clickUnique({ vanillaName: 'diamond' }, screen.playerInventoryRange()), Result.ITEM_NOT_FOUND);
    assert.deepEqual(clicks, []);

    window.title = 'Other Window';
    assert.equal(screen.isVaultWindow(), true);
    assert.equal(await screen.clickIfUnchanged(0, snapshot, superAlloy), Result.ITEM_NOT_FOUND);
    assert.deepEqual(clicks, []);
});

test('PersonalVaultScreen re-reads a matching slot immediately before delegating a safe click', async () => {
    const window = vaultWindow();
    const clicks = [];
    const screen = new PersonalVaultScreen({
        window: () => window,
        click: async (...args) => {
            clicks.push(args);
            return Result.SUCCESS;
        }
    });
    const superAlloy = { identifiers: ['SUPER_ALLOY'], vanillaName: 'player_head' };
    const snapshot = screen.snapshotSlot(0);

    assert.equal(await screen.clickIfUnchanged(0, snapshot, superAlloy, 1, 2), Result.SUCCESS);
    assert.deepEqual(clicks, [[0, 1, 2]]);
});
