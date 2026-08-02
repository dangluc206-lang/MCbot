'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findSlot } = require('../utils/SlotFinder');

test('SlotFinder finds a unique item inside the requested slot region', () => {
    const window = {
        slots: [
            { name: 'diamond' },
            null,
            { name: 'diamond' }
        ],
        click: () => assert.fail('SlotFinder must not click')
    };

    assert.deepEqual(findSlot(window, { vanillaName: 'diamond' }, { start: 1, end: 3 }), {
        status: 'FOUND', slot: 2, slots: [2]
    });
    assert.deepEqual(findSlot(window, { vanillaName: 'diamond' }, { start: 1, end: 2 }), {
        status: 'NOT_FOUND', slot: null, slots: []
    });
});

test('SlotFinder skips empty slots and reports multiple exact matches', () => {
    const window = { slots: [null, { name: 'diamond' }, undefined, { name: 'diamond' }] };

    assert.deepEqual(findSlot(window, { vanillaName: 'diamond' }, { start: 0, end: 4 }), {
        status: 'MULTIPLE', slot: null, slots: [1, 3]
    });
    assert.deepEqual(findSlot(null, { vanillaName: 'diamond' }, { start: 0, end: 4 }), {
        status: 'NOT_FOUND', slot: null, slots: []
    });
});

test('SlotFinder uses ItemMatcher instead of a shared vanilla carrier type', () => {
    const window = {
        slots: [
            { name: 'player_head', nbt: { ExtraAttributes: { id: 'OTHER_ALLOY' } } },
            { name: 'player_head', nbt: { ExtraAttributes: { id: 'SUPER_ALLOY' } } }
        ]
    };

    assert.deepEqual(findSlot(window, {
        identifiers: ['SUPER_ALLOY'],
        vanillaName: 'player_head'
    }, { start: 0, end: 2 }), {
        status: 'FOUND', slot: 1, slots: [1]
    });
});
