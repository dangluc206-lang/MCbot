'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildPlan,
    reducePlanUsingExisting,
    planCraftableStages,
    createInventorySafeActions,
    recipeTier,
    assessStorage,
    describeAvailability,
    requiresFreeInventorySlot,
    shouldUseShiftCraft,
    shouldUseBulkCraft,
    boundedNumber
} = require('../utils/CraftingPlan');

test('CraftingPlan builds child-first actions and aggregates raw requirements', () => {
    const plan = buildPlan({
        recipes: {
            10: { itemKey: 'component', name: 'Component', inputs: [{ item: 'coal', amount: 4 }] },
            20: { itemKey: 'target', name: 'Target', inputs: [{ slot: 10, amount: 2 }, { item: 'iron', amount: 3 }] }
        }
    }, 20, 2);

    assert.deepEqual(plan.actions, [
        { slot: 10, itemKey: 'component', name: 'Component', count: 4 },
        { slot: 20, itemKey: 'target', name: 'Target', count: 2 }
    ]);
    assert.deepEqual(plan.rawRequirements, [{ item: 'coal', amount: 16 }, { item: 'iron', amount: 6 }]);
    assert.equal(plan.totalActions, 6);
});

test('CraftingPlan keeps stable fallback keys and rejects invalid recipe trees', () => {
    assert.equal(buildPlan({ recipes: { 10: { name: 'Fallback', inputs: [] } } }, 10, 1).targetItemKey, 'recipe_10');
    assert.throws(() => buildPlan({ recipes: { 10: { inputs: [{ slot: 11, amount: 1 }] }, 11: { inputs: [{ slot: 10, amount: 1 }] } } }, 10, 1), /vòng lặp/);
    assert.throws(() => buildPlan({ recipes: { 10: { inputs: [{ item: 'coal', amount: 0 }] } } }, 10, 1), /không hợp lệ/);
});

test('CraftingPlan uses inventory then vault for intermediates but never completed target stock', () => {
    const settings = {
        recipes: {
            10: { itemKey: 'component', name: 'Component', inputs: [{ item: 'coal', amount: 4 }] },
            20: { itemKey: 'target', name: 'Target', inputs: [{ slot: 10, amount: 2 }] }
        },
        materialAliases: { component: ['Custom Component'] }
    };
    const plan = buildPlan(settings, 20, 1);
    const reduced = reducePlanUsingExisting(plan, new Map([
        [10, { inventory: 1, storage: 9, vault: 1 }],
        [20, { inventory: 1, storage: 1, vault: 1 }]
    ]), settings);

    assert.deepEqual(reduced.actions, [{ slot: 20, itemKey: 'target', name: 'Target', count: 1 }]);
    assert.deepEqual(reduced.rawRequirements, []);
    assert.deepEqual(reduced.vaultWithdrawals, [{
        slot: 10,
        name: 'Component',
        aliases: ['Component', 'Custom Component'],
        amount: 1
    }]);
    assert.deepEqual(reduced.existingItems.find(item => item.slot === 20), {
        slot: 20,
        name: 'Target',
        inventoryAvailable: 1,
        storageAvailable: 1,
        vaultAvailable: 1,
        inventoryUsed: 0,
        storageUsed: 0,
        vaultUsed: 0
    });
});

test('CraftingPlan stages feasible branches, defers blocked work, and withdraws only consumed vault items', () => {
    const settings = {
        recipes: {
            10: { name: 'Coal Component', inputs: [{ item: 'coal', amount: 4 }] },
            11: { name: 'Red Component', inputs: [{ item: 'redstone', amount: 4 }] },
            20: { name: 'Target', inputs: [{ slot: 10, amount: 1 }, { slot: 11, amount: 1 }] }
        }
    };
    const staged = planCraftableStages({
        actions: [
            { slot: 10, name: 'Coal Component', count: 2 },
            { slot: 11, name: 'Red Component', count: 1 },
            { slot: 20, name: 'Target', count: 1 }
        ],
        existingItems: [{ slot: 10, name: 'Coal Component', inventoryUsed: 0, storageUsed: 0, vaultUsed: 1 }]
    }, { materials: [{ item: 'coal', available: 4 }, { item: 'redstone', available: 0 }] }, settings);

    assert.deepEqual(staged.actions.map(action => [action.slot, action.count]), [[10, 1]]);
    assert.deepEqual(staged.rawRequirements, [{ item: 'coal', amount: 4 }]);
    assert.equal(staged.partial, true);
    assert.deepEqual(staged.deferredActions.map(action => action.slot), [10, 11, 20]);
    assert.deepEqual(staged.vaultWithdrawals, []);
});

test('CraftingPlan emits child-first inventory-safe batches without exceeding B2 batch size', () => {
    const settings = {
        b2BatchSize: 2,
        recipes: {
            10: { itemKey: 'raw_component', name: 'Raw Component', inputs: [{ item: 'coal', amount: 1 }] },
            20: { itemKey: 'block', name: 'Block', inputs: [{ slot: 10, amount: 2 }] }
        }
    };
    const actions = createInventorySafeActions({
        actions: [
            { slot: 10, count: 4 },
            { slot: 20, count: 2 }
        ]
    }, settings);

    assert.equal(recipeTier(10, settings), 2);
    assert.equal(recipeTier(20, settings), 3);
    assert.deepEqual(actions, [
        { slot: 10, itemKey: 'raw_component', name: 'Raw Component', count: 2 },
        { slot: 20, itemKey: 'block', name: 'Block', count: 1 },
        { slot: 10, itemKey: 'raw_component', name: 'Raw Component', count: 2 },
        { slot: 20, itemKey: 'block', name: 'Block', count: 1 }
    ]);
});

test('CraftingPlan assesses storage and inventory snapshots without Runtime access', () => {
    const availability = assessStorage(
        { rawRequirements: [{ item: 'coal', amount: 16 }, { item: 'copper', amount: 2 }] },
        { storageMaterialSlots: { coal: 10 } },
        [{ slot: 10, itemName: 'coal', amount: 7 }, { slot: 11, itemName: 'coal_block', amount: 1 }, { slot: 12, itemName: 'copper', amount: 1 }],
        [{ name: 'coal', count: 1 }, { name: 'copper', count: 1 }],
        123
    );

    assert.equal(availability.checkedAt, 123);
    assert.equal(availability.materials.find(item => item.item === 'coal').available, 17);
    assert.equal(availability.materials.find(item => item.item === 'copper').available, 2);
    assert.equal(availability.canCraft, true);
});

test('CraftingPlan formats unavailable and insufficient materials without service state', () => {
    assert.equal(describeAvailability({ materials: [] }), 'Không có dữ liệu nguyên liệu từ /kho.');
    assert.equal(describeAvailability({ canCraft: true, materials: [{}] }), 'Kho đủ nguyên liệu để chế tạo mục tiêu.');
    assert.equal(describeAvailability({
        canCraft: false,
        materials: [{}],
        missing: [
            { item: 'coal', available: null },
            { item: 'iron', shortage: 3, available: 13, required: 16 }
        ]
    }), 'coal: chưa đọc được số lượng; iron: thiếu 3 (13/16)');
});

test('CraftingPlan requires a free slot only for ordinary B2 clicks', () => {
    const settings = {
        recipes: {
            10: { inputs: [{ item: 'coal', amount: 1 }] },
            20: { inputs: [{ slot: 10, amount: 1 }] }
        }
    };
    assert.equal(requiresFreeInventorySlot({ slot: 10 }, false, settings), true);
    assert.equal(requiresFreeInventorySlot({ slot: 10 }, true, settings), false);
    assert.equal(requiresFreeInventorySlot({ slot: 20 }, false, settings), false);
});

test('CraftingPlan enables shift craft only for configured safe tiers on the first click', () => {
    const settings = {
        shiftCraft: { enabled: true, tier2: true, tier3: false, tier4Slots: [30] },
        recipes: {
            10: { inputs: [{ item: 'coal', amount: 1 }] },
            20: { inputs: [{ slot: 10, amount: 1 }] },
            30: { inputs: [{ slot: 20, amount: 1 }] }
        }
    };
    assert.equal(shouldUseShiftCraft({ slot: 10 }, 0, settings), true);
    assert.equal(shouldUseShiftCraft({ slot: 20 }, 0, settings), false);
    assert.equal(shouldUseShiftCraft({ slot: 30 }, 0, settings), true);
    assert.equal(shouldUseShiftCraft({ slot: 10 }, 1, settings), false);
});

test('CraftingPlan enables bulk craft only for the target on its first click', () => {
    const settings = { bulkCraft: { enabled: true, finalTargetOnly: true } };
    assert.equal(shouldUseBulkCraft({ slot: 20 }, 0, 20, settings), true);
    assert.equal(shouldUseBulkCraft({ slot: 10 }, 0, 20, settings), false);
    assert.equal(shouldUseBulkCraft({ slot: 20 }, 1, 20, settings), false);
    assert.equal(shouldUseBulkCraft({ slot: 20 }, 0, 20, { bulkCraft: { enabled: false } }), false);
});

test('CraftingPlan bounds numeric values while retaining the configured fallback', () => {
    assert.equal(boundedNumber('20', 1, 10, 5), 10);
    assert.equal(boundedNumber(-2, 1, 10, 5), 1);
    assert.equal(boundedNumber('invalid', 1, 10, 5), 5);
});
