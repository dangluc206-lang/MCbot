'use strict';

const { matchesItem } = require('./ItemMatcher');

function findSlot(window, definition, range = {}) {
    const slots = Array.isArray(window?.slots) ? window.slots : [];
    const { start, end } = slotRange(slots.length, range);
    const matches = [];

    for (let slot = start; slot < end; slot += 1) {
        const item = slots[slot];
        if (item && matchesItem(item, definition)) matches.push(slot);
    }

    if (matches.length === 0) return { status: 'NOT_FOUND', slot: null, slots: [] };
    if (matches.length === 1) return { status: 'FOUND', slot: matches[0], slots: matches };
    return { status: 'MULTIPLE', slot: null, slots: matches };
}

function slotRange(length, range) {
    const start = Number.isInteger(range?.start) ? range.start : 0;
    const end = Number.isInteger(range?.end) ? range.end : length;
    return {
        start: Math.min(Math.max(start, 0), length),
        end: Math.min(Math.max(end, 0), length)
    };
}

module.exports = { findSlot };
