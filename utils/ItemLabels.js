'use strict';

/**
 * Extracts visible labels from legacy NBT and 1.20.5+ item components.
 * Minecraft servers often use a vanilla carrier item with a custom component
 * name, so `item.name` alone is not a reliable identity.
 */
function itemLabels(item = {}) {
    const labels = [];
    collectText(item.customName, labels);
    if (item.componentMap instanceof Map) {
        for (const component of item.componentMap.values()) collectText(component?.data ?? component, labels);
    }
    collectText(item.components, labels);
    collectText(item.customLore, labels);
    collectText(item.nbt, labels);
    if (item.displayName) labels.push(String(item.displayName));
    if (item.name) labels.push(String(item.name));
    return [...new Set(labels
        .map(value => String(value || '').replace(/[\r\n\t]+/g, ' ').trim())
        .filter(value => value && !value.startsWith('minecraft:')))]
        .slice(0, 32);
}

function collectText(value, labels, depth = 0) {
    if (depth > 32 || value === null || value === undefined) return;
    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return;
        if ((text.startsWith('{') || text.startsWith('[')) && text.length <= 20000) {
            try {
                collectText(JSON.parse(text), labels, depth + 1);
                return;
            } catch (_) {
                // Component text may legitimately start with a brace.
            }
        }
        labels.push(text);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach(entry => collectText(entry, labels, depth + 1));
        return;
    }
    if (value instanceof Map) {
        value.forEach(entry => collectText(entry, labels, depth + 1));
        return;
    }
    if (typeof value !== 'object') return;
    if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
        try {
            const rendered = value.toString();
            if (rendered && !/^\[object\s.+\]$/.test(rendered)) collectText(rendered, labels, depth + 1);
        } catch (_) {
            // Continue with enumerable fields.
        }
    }
    if (typeof value[Symbol.iterator] === 'function') {
        try {
            for (const entry of value) collectText(entry, labels, depth + 1);
            return;
        } catch (_) {
            // Continue with enumerable fields.
        }
    }
    if (value.type === 'string') {
        collectText(value.value, labels, depth + 1);
        return;
    }
    if (value.type === 'compound' || value.type === 'list') {
        collectText(value.value, labels, depth + 1);
        return;
    }
    if (typeof value.text === 'string') labels.push(value.text);
    if (value.extra) collectText(value.extra, labels, depth + 1);
    if (Object.prototype.hasOwnProperty.call(value, 'data')) collectText(value.data, labels, depth + 1);
    if (Object.prototype.hasOwnProperty.call(value, 'value') && Object.keys(value).length <= 3) {
        collectText(value.value, labels, depth + 1);
        return;
    }
    Object.entries(value).forEach(([key, entry]) => {
        // Style metadata is frequently present beside every text component.
        // It is not an item label: collecting `red`, `aqua`, `bold`, etc.
        // made /pv 2 entries look like colours and could hide the useful
        // custom display name at the top of Discord/terminal output.
        if (![
            'text', 'extra', 'data', 'value', 'type',
            'color', 'bold', 'italic', 'underlined', 'strikethrough',
            'obfuscated', 'font', 'insertion', 'clickEvent', 'hoverEvent'
        ].includes(key)) {
            collectText(entry, labels, depth + 1);
        }
    });
}

function normalizeItemLabel(value) {
    return String(value || '')
        .replace(/§[0-9A-FK-OR]/gi, '')
        .replace(/[\r\n\t]+/g, ' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Vietnamese đ/Đ is not a combining character, so NFD alone does
        // not convert it.  Custom server identifiers use plain ASCII (DA,
        // KHOI, SIEU...), therefore fold it explicitly before compact match.
        .replace(/[đĐ]/g, 'd')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Server custom items often expose a machine identifier in lore, for example
 * `KHOIVANGTINHLUYEN`, while the human recipe is `Khối vàng tinh luyện`.
 * Both collapse to the same compact key.  Keep this separate from the normal
 * display matcher so callers can use it only for exact material identity.
 */
function compactItemLabel(value) {
    return normalizeItemLabel(value).replace(/[^a-z0-9]/g, '');
}

module.exports = { itemLabels, normalizeItemLabel, compactItemLabel };
