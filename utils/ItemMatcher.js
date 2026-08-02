'use strict';

const { compactItemLabel, itemLabels, normalizeItemLabel } = require('./ItemLabels');

const GENERIC_CUSTOM_CARRIERS = new Set(['player_head', 'paper', 'glass_pane']);

function matchesItem(item, definition = {}) {
    if (!item || typeof item !== 'object' || !definition || typeof definition !== 'object') return false;

    const expectedIdentifiers = values(definition.identifier, definition.identifiers);
    const actualIdentifiers = itemIdentifiers(item);
    if (actualIdentifiers.length && expectedIdentifiers.length) {
        return actualIdentifiers.some(actual => expectedIdentifiers.some(expected => sameIdentifier(actual, expected)));
    }

    const aliases = values(definition.aliases);
    const labels = itemLabels(item);
    const compactAliases = aliases.map(compactItemLabel).filter(Boolean);
    if (compactAliases.length && labels.some(label => compactAliases.includes(compactItemLabel(label)))) return true;

    const normalizedAliases = aliases.map(normalizeItemLabel).filter(Boolean);
    if (normalizedAliases.length && labels.some(label => normalizedAliases.includes(normalizeItemLabel(label)))) return true;

    if (actualIdentifiers.length) return false;
    const vanillaNames = values(definition.vanillaName, definition.vanillaNames)
        .map(normalizeVanillaName)
        .filter(Boolean);
    const itemName = normalizeVanillaName(item.name || item.itemName);
    return Boolean(itemName && !GENERIC_CUSTOM_CARRIERS.has(itemName) && vanillaNames.includes(itemName));
}

function itemIdentifiers(item) {
    const identifiers = [];
    collectIdentifiers({ customIdentifier: item.customIdentifier, identifier: item.identifier }, identifiers);
    collectIdentifiers(item.components, identifiers);
    collectIdentifiers(item.componentMap, identifiers);
    collectIdentifiers(item.nbt, identifiers);
    collectIdentifiers(item.customData, identifiers, true);
    return [...new Set(identifiers.map(value => String(value).trim()).filter(Boolean))];
}

function collectIdentifiers(value, output, customContainer = false, depth = 0) {
    if (depth > 16 || value === null || value === undefined) return;
    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) return;
        if ((text.startsWith('{') || text.startsWith('[')) && text.length <= 20000) {
            try {
                collectIdentifiers(JSON.parse(text), output, customContainer, depth + 1);
                return;
            } catch (_) {
                // A custom identifier may be an unparsed string.
            }
        }
        if (customContainer) output.push(text);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach(entry => collectIdentifiers(entry, output, customContainer, depth + 1));
        return;
    }
    if (value instanceof Map) {
        value.forEach((entry, key) => collectIdentifiers(
            entry,
            output,
            customContainer || isCustomContainer(key),
            depth + 1
        ));
        return;
    }
    if (typeof value !== 'object') return;

    const context = customContainer || isCustomContainer(value.type);
    for (const [key, entry] of Object.entries(value)) {
        if (isIdentifierKey(key) || (context && normalizeKey(key) === 'id')) {
            collectIdentifierValue(entry, output, depth + 1);
        } else {
            collectIdentifiers(entry, output, context || isCustomContainer(key), depth + 1);
        }
    }
}

function collectIdentifierValue(value, output, depth) {
    if (depth > 16 || value === null || value === undefined) return;
    if (typeof value === 'string') {
        const text = value.trim();
        if (text) output.push(text);
        return;
    }
    collectIdentifiers(value, output, true, depth + 1);
}

function values(...entries) {
    return entries.flatMap(entry => Array.isArray(entry) ? entry : [entry])
        .filter(entry => typeof entry === 'string' && entry.trim());
}

function sameIdentifier(left, right) {
    const compactLeft = compactItemLabel(left);
    const compactRight = compactItemLabel(right);
    return Boolean(compactLeft && compactLeft === compactRight);
}

function normalizeKey(value) {
    return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isIdentifierKey(key) {
    return ['identifier', 'customidentifier', 'customid', 'itemid', 'itemidentifier'].includes(normalizeKey(key));
}

function isCustomContainer(key) {
    return ['customdata', 'extraattributes'].includes(normalizeKey(key));
}

function normalizeVanillaName(value) {
    return normalizeItemLabel(value).replace(/^minecraft:/, '');
}

module.exports = { matchesItem };
