'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const RecipeIdentity = require('../utils/CraftingRecipeIdentity');

test('CraftingRecipeIdentity resolves configured keys and merges modern and legacy aliases', () => {
    const settings = {
        recipes: { 25: { itemKey: ' Refined_Gold_Block ', name: 'Khối vàng tinh luyện' } },
        materialAliases: { refined_gold_block: ['Khối vàng tinh luyện', 'KHOI_VANG_TINH_LUYEN'] },
        personalVault: { aliases: { refined_gold_block: ['Legacy gold block'] } }
    };

    assert.equal(RecipeIdentity.recipeItemKey(25, settings), 'refined_gold_block');
    assert.equal(RecipeIdentity.recipeItemKey(12, settings), 'recipe_12');
    assert.deepEqual(RecipeIdentity.recipeAliases(25, 'Khối vàng tinh luyện', settings), [
        'Khối vàng tinh luyện',
        'KHOI_VANG_TINH_LUYEN',
        'Legacy gold block'
    ]);
});

test('CraftingRecipeIdentity uses exact label matching and rejects similar aliases', () => {
    const definition = { aliases: ['Khối vàng tinh luyện', 'Refined Gold Block'] };

    assert.equal(RecipeIdentity.matchesRecipeItem('KHOI_VANG-TINH_LUYEN', definition), true);
    assert.equal(RecipeIdentity.matchesRecipeItem('Khối vàng tinh luyện thêm', definition), false);
    assert.equal(RecipeIdentity.matchesRecipeItemVariant('[TL] Khối vàng tinh luyện ✦', definition), true);
    assert.equal(RecipeIdentity.matchesRecipeItemVariant('Gold', definition), false);
});

test('CraftingRecipeIdentity maps the most-specific decorated material without inspecting lore variants', () => {
    const definitions = new Map([
        [15, { slot: 15, aliases: ['Vàng tinh luyện'] }],
        [25, { slot: 25, aliases: ['Khối vàng tinh luyện'] }]
    ]);

    assert.equal(RecipeIdentity.matchMaterialDefinition({
        displayName: '[TL] Khối vàng tinh luyện ✦',
        labels: ['[TL] Khối vàng tinh luyện ✦', 'Dùng vàng tinh luyện']
    }, definitions).slot, 25);
    assert.equal(RecipeIdentity.matchMaterialDefinition({
        displayName: 'Vật phẩm khác',
        labels: ['Vật phẩm khác', 'Khối vàng tinh luyện']
    }, definitions).slot, 25);
    assert.equal(RecipeIdentity.matchMaterialDefinition({
        displayName: 'Vật phẩm khác',
        labels: ['Vật phẩm khác', 'lore nhắc Khối vàng tinh luyện']
    }, definitions), null);
});

test('CraftingRecipeIdentity builds a source-aware ledger from supplied snapshots', () => {
    const definitions = new Map([[10, { slot: 10, itemKey: 'component', name: 'Component', aliases: ['Component'] }]]);
    const ledger = RecipeIdentity.buildMaterialLedger(definitions, {
        inventory: [{ displayName: 'Component', count: 2 }],
        vault: [{ displayName: 'Component', count: 3 }],
        storage: [{ displayName: 'Component', amount: 4 }]
    }, 123);

    assert.deepEqual(ledger, {
        updatedAt: 123,
        entries: [{ slot: 10, itemKey: 'component', name: 'Component', inventory: 2, vault: 3, storage: 4, total: 9 }],
        total: 9
    });
});

test('CraftingRecipeIdentity formats only populated intermediate ledger slots', () => {
    assert.equal(RecipeIdentity.describeLedgerIntermediates({
        entries: [
            { slot: 10, name: 'Component', inventory: 2, vault: 3, storage: 4, total: 9 },
            { slot: 99, name: 'Ignored', inventory: 1, vault: 0, storage: 0, total: 1 },
            { slot: 11, name: 'Empty', inventory: 0, vault: 0, storage: 0, total: 0 }
        ]
    }), '#10 Component: inv=2, pv2=3, kho=4');
    assert.equal(RecipeIdentity.describeLedgerIntermediates(null), 'không nhận diện được vật liệu SHK nào.');
});

test('CraftingRecipeIdentity maps every ledger entry to its source supplies', () => {
    const supplies = RecipeIdentity.suppliesFromLedger({
        entries: [
            { slot: 10, inventory: 2, storage: 3, vault: 4 },
            { slot: 11, inventory: 0, storage: 0, vault: 0 }
        ]
    });

    assert.deepEqual([...supplies.entries()], [
        [10, { inventory: 2, storage: 3, vault: 4 }],
        [11, { inventory: 0, storage: 0, vault: 0 }]
    ]);
});

test('CraftingRecipeIdentity merges actual vault withdrawals by recipe slot', () => {
    const merged = RecipeIdentity.mergeVaultWithdrawals(
        [{ slot: 10, name: 'Component', aliases: ['Component'], amount: 2 }],
        [
            { slot: 10, name: 'Changed', aliases: ['Changed'], amount: 3 },
            { slot: 11, name: 'Other', aliases: ['Other'], amount: -1 }
        ]
    );

    assert.deepEqual(merged, [
        { slot: 10, name: 'Component', aliases: ['Component'], amount: 5 },
        { slot: 11, name: 'Other', aliases: ['Other'], amount: 0 }
    ]);
});

test('CraftingRecipeIdentity calculates only the vault input still needed for one action', () => {
    const definitions = new Map([
        [10, { slot: 10, name: 'A', aliases: ['A'] }],
        [11, { slot: 11, name: 'B', aliases: ['B'] }]
    ]);
    const result = RecipeIdentity.vaultInputRequirements(
        { inputs: [{ slot: 10, amount: 4 }, { slot: 11, amount: 3 }, { item: 'coal', amount: 9 }] },
        definitions,
        slot => ({ 10: 1, 11: 0 }[slot] || 0),
        slot => ({ 10: 2, 11: 1 }[slot] || 0)
    );

    assert.deepEqual(result, {
        requests: [
            { slot: 10, name: 'A', aliases: ['A'], amount: 2 },
            { slot: 11, name: 'B', aliases: ['B'], amount: 1 }
        ],
        missing: [{ name: 'A', amount: 1 }, { name: 'B', amount: 2 }]
    });
});

test('CraftingRecipeIdentity creates a deposit request only for a completed target output', () => {
    const settings = { recipes: { 20: { itemKey: 'target', name: 'Target' } }, materialAliases: { target: ['Custom Target'] } };
    const plan = { targetSlot: 20, targetName: 'Target' };
    assert.equal(RecipeIdentity.craftedTargetCount(false, 3), 0);
    assert.equal(RecipeIdentity.completedTargetDepositRequest(true, plan, settings, 0), null);
    assert.deepEqual(RecipeIdentity.completedTargetDepositRequest(true, plan, settings, 2), {
        name: 'Target', aliases: ['Target', 'Custom Target'], amount: 2
    });
});

test('CraftingRecipeIdentity aggregates only B2-B4 items for recovery deposits', () => {
    const definitions = new Map([
        [10, { slot: 10, itemKey: 'b2', name: 'B2', aliases: ['B2'] }],
        [20, { slot: 20, itemKey: 'b5', name: 'B5', aliases: ['B5'] }]
    ]);
    const requests = RecipeIdentity.intermediateRecoveryDepositRequests(
        [{ displayName: 'B2', count: 2 }, { displayName: 'B2', count: 3 }, { displayName: 'B5', count: 9 }, { displayName: 'Other', count: 4 }],
        definitions,
        { recipes: { 10: { itemKey: 'b2' } } },
        slot => (slot === 10 ? 2 : 5)
    );

    assert.deepEqual(requests, [{ name: 'B2', aliases: ['B2'], amount: 5 }]);
});

test('CraftingRecipeIdentity counts only matching material stacks with positive counts', () => {
    const definition = { slot: 10, aliases: ['Component'] };
    assert.equal(RecipeIdentity.countMaterial([
        { displayName: 'Component', count: 2 },
        { displayName: 'Component', count: -1 },
        { displayName: 'Other', count: 9 }
    ], definition), 2);
    assert.equal(RecipeIdentity.countMaterial([], null), 0);
});
