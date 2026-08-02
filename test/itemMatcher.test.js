'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesItem } = require('../utils/ItemMatcher');

test('ItemMatcher prioritizes direct, NBT, and component custom identifiers', () => {
    const definition = { identifiers: ['SUPER_ALLOY'], aliases: ['Siêu Hợp Kim'], vanillaName: 'player_head' };

    assert.equal(matchesItem({ name: 'player_head', customIdentifier: 'SUPER_ALLOY' }, definition), true);
    assert.equal(matchesItem({
        name: 'player_head',
        nbt: { ExtraAttributes: { id: 'SUPER_ALLOY' } }
    }, definition), true);
    assert.equal(matchesItem({
        name: 'paper',
        components: [{ type: 'custom_data', data: { identifier: 'SUPER_ALLOY' } }]
    }, definition), true);
    assert.equal(matchesItem({
        name: 'player_head',
        nbt: { ExtraAttributes: { id: 'OTHER_ALLOY' } },
        displayName: 'Siêu Hợp Kim'
    }, definition), false);
});

test('ItemMatcher uses only exact compact and normalized aliases', () => {
    assert.equal(matchesItem(
        { name: 'player_head', displayName: 'KHOI_VANG-TINH_LUYEN' },
        { aliases: ['Khối vàng tinh luyện'] }
    ), true);
    assert.equal(matchesItem(
        { name: 'player_head', displayName: 'Siêu Hợp Kim' },
        { aliases: ['sieu hop kim'] }
    ), true);
    assert.equal(matchesItem(
        { name: 'player_head', displayName: 'Khối vàng tinh luyện thêm' },
        { aliases: ['Khối vàng tinh luyện', 'Khối vàng'] }
    ), false);
});

test('ItemMatcher uses vanilla name only as a safe fallback', () => {
    assert.equal(matchesItem({ name: 'diamond' }, { vanillaName: 'minecraft:diamond' }), true);
    assert.equal(matchesItem({ name: 'player_head' }, { vanillaName: 'player_head' }), false);
    assert.equal(matchesItem({ name: 'paper' }, { vanillaName: 'paper' }), false);
    assert.equal(matchesItem({ name: 'glass_pane' }, { vanillaName: 'glass_pane' }), false);
});

test('ItemMatcher safely rejects null and malformed item metadata', () => {
    const definition = { identifiers: ['SUPER_ALLOY'], aliases: ['Siêu Hợp Kim'], vanillaName: 'diamond' };

    assert.equal(matchesItem(null, definition), false);
    assert.equal(matchesItem({ name: 'diamond', components: 42, nbt: { ExtraAttributes: { id: null } } }, definition), true);
    assert.equal(matchesItem({ name: 'player_head', components: { type: 'custom_data', data: ['{bad json'] } }, definition), false);
});
