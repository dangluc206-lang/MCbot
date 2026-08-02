'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Result = require('../core/constants/Result');
const { withdrawVaultItems } = require('../actions/CraftingVaultAction');

test('CraftingVaultAction preserves withdraw results and syncs only successful requests', async () => {
    let synced = 0;
    assert.equal(await withdrawVaultItems([], () => Result.SUCCESS, () => { synced += 1; }, Result), Result.NO_ACTION);
    assert.equal(synced, 0);
    assert.equal(await withdrawVaultItems([{ slot: 10 }], async () => Result.SUCCESS, () => { synced += 1; }, Result), Result.SUCCESS);
    assert.equal(synced, 1);
    assert.equal(await withdrawVaultItems([{ slot: 10 }], async () => Result.NOT_CONNECTED, () => { synced += 1; }, Result), Result.NOT_CONNECTED);
    assert.equal(synced, 1);
});
