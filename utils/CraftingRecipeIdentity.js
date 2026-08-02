'use strict';

const { compactItemLabel, normalizeItemLabel } = require('./ItemLabels');

function recipeItemKey(slot, settings = {}) {
    const configured = settings.recipes?.[slot]?.itemKey;
    return typeof configured === 'string' && configured.trim()
        ? configured.trim().toLowerCase()
        : `recipe_${Number(slot)}`;
}

function recipeAliases(slot, name, settings = {}) {
    const itemKey = recipeItemKey(slot, settings);
    const modern = settings.materialAliases?.[itemKey]
        || settings.materialAliases?.[slot]
        || settings.materialAliases?.[String(slot)]
        || [];
    const legacy = settings.personalVault?.aliases?.[itemKey]
        || settings.personalVault?.aliases?.[slot]
        || settings.personalVault?.aliases?.[String(slot)]
        || [];
    return [...new Set([name, ...(Array.isArray(modern) ? modern : [modern]), ...(Array.isArray(legacy) ? legacy : [legacy])]
        .filter(value => typeof value === 'string' && value.trim()))];
}

function materialDefinitions(settings = {}) {
    const definitions = new Map();
    for (const [slot, recipe] of Object.entries(settings.recipes || {})) {
        const numericSlot = Number(slot);
        if (!Number.isInteger(numericSlot)) continue;
        const name = recipe.name || `Slot ${numericSlot}`;
        definitions.set(numericSlot, { slot: numericSlot, itemKey: recipeItemKey(numericSlot, settings), name, aliases: recipeAliases(numericSlot, name, settings) });
    }
    return definitions;
}

function matchesRecipeItem(label, definition) {
    const normalized = normalizeItemLabel(label);
    const compact = compactItemLabel(label);
    return definition.aliases.some(alias => normalizeItemLabel(alias) === normalized
        || (compact.length >= 6 && compactItemLabel(alias) === compact));
}

function matchesRecipeItemVariant(label, definition) {
    const normalizedLabel = normalizeItemLabel(label);
    return Boolean(normalizedLabel) && definition.aliases.some(alias => {
        const normalizedAlias = normalizeItemLabel(alias);
        return normalizedAlias.length >= 8 && normalizedLabel.includes(normalizedAlias);
    });
}

function longestRecipeAlias(definition) {
    return Math.max(0, ...definition.aliases.map(alias => normalizeItemLabel(alias).length));
}

function matchMaterialDefinition(item, definitions) {
    const allLabels = item?.labels || item?.lines || [item?.displayName, item?.name, item?.itemName];
    const identityLabels = [item?.displayName, allLabels[0]].filter(label => typeof label === 'string' && label.trim());
    const candidates = [...definitions.values()];
    const exact = candidates.find(candidate => allLabels.some(label => matchesRecipeItem(label, candidate)));
    return exact || candidates.filter(candidate => identityLabels.some(label => matchesRecipeItemVariant(label, candidate)))
        .sort((left, right) => longestRecipeAlias(right) - longestRecipeAlias(left))[0] || null;
}

function buildMaterialLedger(definitions, snapshots = {}, updatedAt = Date.now()) {
    const supplies = new Map([...definitions.keys()].map(slot => [slot, { inventory: 0, storage: 0, vault: 0 }]));
    const addItems = (items, source, quantityFor) => {
        for (const item of items || []) {
            const count = Number(quantityFor(item));
            if (!Number.isFinite(count) || count <= 0) continue;
            const definition = matchMaterialDefinition(item, definitions);
            if (definition) supplies.get(definition.slot)[source] += count;
        }
    };
    addItems(snapshots.inventory, 'inventory', item => item?.count);
    addItems(snapshots.vault, 'vault', item => item?.count);
    addItems(snapshots.storage, 'storage', item => Number.isFinite(item?.amount) ? item.amount : item?.count);
    const entries = [...definitions.values()].map(definition => {
        const source = supplies.get(definition.slot);
        return {
            slot: definition.slot,
            itemKey: definition.itemKey,
            name: definition.name,
            inventory: source.inventory,
            storage: source.storage,
            vault: source.vault,
            total: source.inventory + source.storage + source.vault
        };
    });
    return { updatedAt, entries, total: entries.reduce((sum, item) => sum + item.total, 0) };
}

function describeLedgerIntermediates(ledger) {
    const usefulSlots = new Set([10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 31, 32, 33]);
    const entries = (ledger?.entries || [])
        .filter(item => usefulSlots.has(item.slot) && item.total > 0)
        .map(item => `#${item.slot} ${item.name}: inv=${item.inventory}, pv2=${item.vault}, kho=${item.storage}`);
    return entries.length ? entries.join(' | ') : 'không nhận diện được vật liệu SHK nào.';
}

function suppliesFromLedger(ledger) {
    return new Map((ledger?.entries || []).map(item => [item.slot, {
        inventory: item.inventory,
        storage: item.storage,
        vault: item.vault
    }]));
}

function mergeVaultWithdrawals(currentWithdrawals = [], requests = []) {
    const totals = new Map(currentWithdrawals.map(item => [item.slot, { ...item }]));
    for (const request of requests) {
        const current = totals.get(request.slot) || { ...request, amount: 0 };
        current.amount += Math.max(0, Number(request.amount) || 0);
        totals.set(request.slot, current);
    }
    return [...totals.values()];
}

function vaultInputRequirements(recipe, definitions, countInventory, countVault) {
    const requests = [];
    const missing = [];
    for (const input of recipe?.inputs || []) {
        if (!Number.isInteger(input?.slot)) continue;
        const definition = definitions.get(Number(input.slot));
        if (!definition) continue;
        const required = Math.max(0, Math.floor(Number(input.amount) || 0));
        if (required <= 0) continue;
        const needed = Math.max(0, required - countInventory(definition.slot));
        if (needed <= 0) continue;
        const amount = Math.min(needed, countVault(definition.slot));
        if (amount > 0) requests.push({ slot: definition.slot, name: definition.name, aliases: definition.aliases, amount });
        if (amount < needed) missing.push({ name: definition.name, amount: needed - amount });
    }
    return { requests, missing };
}

function craftedTargetCount(succeeded, targetCraftCount) {
    return succeeded ? Math.max(0, Number(targetCraftCount) || 0) : 0;
}

function completedTargetDepositRequest(succeeded, plan, settings, targetCraftCount) {
    if (!succeeded || !plan || !settings) return null;
    const amount = craftedTargetCount(succeeded, targetCraftCount);
    if (amount <= 0) return null;
    return {
        name: plan.targetName,
        aliases: recipeAliases(plan.targetSlot, plan.targetName, settings),
        amount
    };
}

function intermediateRecoveryDepositRequests(items, definitions, settings, tierFor) {
    const totals = new Map();
    for (const item of items || []) {
        const definition = matchMaterialDefinition(item, definitions);
        if (!definition) continue;
        const tier = tierFor(definition.slot);
        if (tier === null || tier < 2 || tier > 4) continue;
        totals.set(definition.slot, (totals.get(definition.slot) || 0) + Math.max(0, Number(item.count) || 0));
    }
    return [...totals.entries()]
        .filter(([, amount]) => amount > 0)
        .map(([slot, amount]) => {
            const definition = definitions.get(slot);
            return { name: definition.name, aliases: recipeAliases(slot, definition.name, settings), amount };
        });
}

function countMaterial(items, definition) {
    if (!definition) return 0;
    const definitions = new Map([[definition.slot, definition]]);
    return (items || []).reduce((total, item) => (
        matchMaterialDefinition(item, definitions)
            ? total + Math.max(0, Number(item?.count) || 0)
            : total
    ), 0);
}

module.exports = { recipeItemKey, recipeAliases, materialDefinitions, matchesRecipeItem, matchesRecipeItemVariant, longestRecipeAlias, matchMaterialDefinition, buildMaterialLedger, describeLedgerIntermediates, suppliesFromLedger, mergeVaultWithdrawals, vaultInputRequirements, craftedTargetCount, completedTargetDepositRequest, intermediateRecoveryDepositRequests, countMaterial };
