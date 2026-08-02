'use strict';

const { recipeAliases, recipeItemKey } = require('./CraftingRecipeIdentity');

function buildPlan(settings, targetSlot, targetCount) {
    const slot = Number(targetSlot);
    const count = Number(targetCount);
    if (!Number.isInteger(slot) || !settings.recipes[slot]) throw new Error(`Không có recipe ở slot ${targetSlot}.`);
    if (!Number.isInteger(count) || count < 1 || count > 64) throw new Error('Số lượng Siêu Hợp Kim phải từ 1 đến 64.');

    const required = new Map();
    const raw = new Map();
    const add = (map, key, amount) => map.set(key, (map.get(key) || 0) + amount);
    const expand = (recipeSlot, amount, path = new Set()) => {
        if (path.has(recipeSlot)) throw new Error(`Recipe bị vòng lặp ở slot ${recipeSlot}.`);
        const recipe = settings.recipes[recipeSlot];
        if (!recipe) throw new Error(`Thiếu recipe cho slot ${recipeSlot}.`);
        add(required, recipeSlot, amount);
        const nextPath = new Set(path).add(recipeSlot);
        for (const input of recipe.inputs || []) {
            const inputAmount = Number(input.amount);
            if (!Number.isInteger(inputAmount) || inputAmount < 1) throw new Error(`Recipe slot ${recipeSlot} có số lượng nguyên liệu không hợp lệ.`);
            if (Number.isInteger(input.slot)) expand(input.slot, amount * inputAmount, nextPath);
            else if (input.item) add(raw, input.item, amount * inputAmount);
            else throw new Error(`Recipe slot ${recipeSlot} có nguyên liệu không hợp lệ.`);
        }
    };
    expand(slot, count);

    const order = [];
    const visited = new Set();
    const visit = recipeSlot => {
        if (visited.has(recipeSlot)) return;
        visited.add(recipeSlot);
        for (const input of settings.recipes[recipeSlot].inputs || []) {
            if (Number.isInteger(input.slot)) visit(input.slot);
        }
        order.push(recipeSlot);
    };
    visit(slot);

    const actions = order.map(recipeSlot => ({
        slot: recipeSlot,
        itemKey: recipeItemKey(recipeSlot, settings),
        name: settings.recipes[recipeSlot].name || `Slot ${recipeSlot}`,
        count: required.get(recipeSlot) || 0
    }));
    return {
        targetSlot: slot,
        targetItemKey: recipeItemKey(slot, settings),
        targetCount: count,
        targetName: settings.recipes[slot].name || `Slot ${slot}`,
        actions,
        rawRequirements: [...raw.entries()].map(([item, amount]) => ({ item, amount })),
        totalActions: actions.reduce((total, action) => total + action.count, 0)
    };
}

function reducePlanUsingExisting(basePlan, supplies, settings) {
    const needed = new Map([[basePlan.targetSlot, basePlan.targetCount]]);
    const actionCounts = new Map();
    const raw = new Map();
    const existing = new Map();
    const add = (map, key, amount) => map.set(key, (map.get(key) || 0) + amount);

    for (const action of [...basePlan.actions].reverse()) {
        const required = needed.get(action.slot) || 0;
        const supply = supplies.get(action.slot) || { inventory: 0, storage: 0, vault: 0 };
        const isTarget = action.slot === basePlan.targetSlot;
        const inventoryUsed = isTarget ? 0 : Math.min(required, supply.inventory || 0);
        const vaultUsed = isTarget ? 0 : Math.min(required - inventoryUsed, supply.vault || 0);
        const storageUsed = 0;
        const craftCount = required - inventoryUsed - vaultUsed - storageUsed;
        existing.set(action.slot, {
            slot: action.slot,
            name: action.name,
            inventoryAvailable: supply.inventory || 0,
            storageAvailable: supply.storage || 0,
            vaultAvailable: supply.vault || 0,
            inventoryUsed,
            storageUsed,
            vaultUsed
        });
        actionCounts.set(action.slot, craftCount);
        if (craftCount <= 0) continue;

        const recipe = settings.recipes[action.slot];
        for (const input of recipe.inputs || []) {
            const amount = Number(input.amount) * craftCount;
            if (Number.isInteger(input.slot)) add(needed, input.slot, amount);
            else if (input.item) add(raw, input.item, amount);
        }
    }

    const actions = basePlan.actions
        .map(action => ({ ...action, count: actionCounts.get(action.slot) || 0 }))
        .filter(action => action.count > 0);
    const existingItems = [...existing.values()];
    return {
        ...basePlan,
        actions,
        rawRequirements: [...raw.entries()].map(([item, amount]) => ({ item, amount })),
        totalActions: actions.reduce((total, action) => total + action.count, 0),
        existingItems,
        vaultWithdrawals: existingItems
            .filter(item => item.vaultUsed > 0)
            .map(item => ({
                slot: item.slot,
                name: item.name,
                aliases: recipeAliases(item.slot, item.name, settings),
                amount: item.vaultUsed
            }))
    };
}

function planCraftableStages(plan, availability, settings) {
    const rawAvailable = new Map();
    for (const material of availability?.materials || []) {
        rawAvailable.set(material.item, Number.isFinite(material.available) ? Math.max(0, material.available) : 0);
    }

    const products = new Map();
    for (const item of plan.existingItems || []) {
        products.set(item.slot, {
            inventory: Math.max(0, Number(item.inventoryUsed) || 0),
            crafted: 0,
            storage: Math.max(0, Number(item.storageUsed) || 0),
            vault: Math.max(0, Number(item.vaultUsed) || 0),
            vaultConsumed: 0
        });
    }
    const productFor = slot => {
        if (!products.has(slot)) products.set(slot, { inventory: 0, crafted: 0, storage: 0, vault: 0, vaultConsumed: 0 });
        return products.get(slot);
    };
    const productAmount = slot => {
        const product = productFor(slot);
        return product.inventory + product.crafted + product.storage + product.vault;
    };
    const consumeProduct = (slot, amount) => {
        const product = productFor(slot);
        let remaining = amount;
        for (const source of ['inventory', 'vault', 'storage', 'crafted']) {
            const used = Math.min(remaining, product[source]);
            product[source] -= used;
            remaining -= used;
            if (source === 'vault') product.vaultConsumed += used;
            if (remaining <= 0) break;
        }
    };

    const actions = [];
    const deferredActions = [];
    const rawRequirements = new Map();
    const addRawRequirement = (item, amount) => rawRequirements.set(item, (rawRequirements.get(item) || 0) + amount);

    for (const action of plan.actions || []) {
        const recipe = settings.recipes?.[action.slot];
        if (!recipe) {
            deferredActions.push({ ...action, reason: `Thiếu recipe slot ${action.slot}.` });
            continue;
        }

        let executable = Math.max(0, Number(action.count) || 0);
        const requirements = [];
        for (const input of recipe.inputs || []) {
            const perCraft = Math.max(0, Number(input.amount) || 0);
            if (perCraft <= 0) continue;
            const sourceAvailable = Number.isInteger(input.slot)
                ? productAmount(input.slot)
                : (rawAvailable.get(input.item) || 0);
            executable = Math.min(executable, Math.floor(sourceAvailable / perCraft));
            requirements.push({ ...input, perCraft, sourceAvailable });
        }

        if (executable <= 0) {
            const blockers = requirements
                .filter(input => input.sourceAvailable < input.perCraft)
                .map(input => Number.isInteger(input.slot)
                    ? `slot ${input.slot} (${input.sourceAvailable}/${input.perCraft})`
                    : `${input.item} (${input.sourceAvailable}/${input.perCraft})`);
            deferredActions.push({
                ...action,
                reason: blockers.length ? `Thiếu ${blockers.join(', ')}` : 'Chưa có đầu vào.'
            });
            continue;
        }

        for (const input of requirements) {
            const consumed = executable * input.perCraft;
            if (Number.isInteger(input.slot)) consumeProduct(input.slot, consumed);
            else {
                rawAvailable.set(input.item, Math.max(0, (rawAvailable.get(input.item) || 0) - consumed));
                addRawRequirement(input.item, consumed);
            }
        }
        productFor(action.slot).crafted += executable;
        actions.push({ ...action, count: executable });
        if (executable < action.count) {
            deferredActions.push({
                ...action,
                count: action.count - executable,
                reason: `Chỉ đủ nguyên liệu cho ${executable}/${action.count}.`
            });
        }
    }

    const existingBySlot = new Map((plan.existingItems || []).map(item => [item.slot, item]));
    const vaultWithdrawals = [...products.entries()]
        .filter(([, product]) => product.vaultConsumed > 0)
        .map(([slot, product]) => {
            const item = existingBySlot.get(slot);
            const name = item?.name || settings.recipes?.[slot]?.name || `Slot ${slot}`;
            return { slot, name, aliases: recipeAliases(slot, name, settings), amount: product.vaultConsumed };
        });

    return {
        ...plan,
        actions,
        rawRequirements: [...rawRequirements.entries()].map(([item, amount]) => ({ item, amount })),
        totalActions: actions.reduce((total, action) => total + action.count, 0),
        deferredActions,
        partial: deferredActions.length > 0,
        vaultWithdrawals
    };
}

function recipeTier(slot, settings, visiting = new Set()) {
    const numericSlot = Number(slot);
    if (visiting.has(numericSlot)) return null;
    const recipe = settings.recipes?.[numericSlot];
    if (!recipe) return null;
    const next = new Set(visiting).add(numericSlot);
    const childTiers = (recipe.inputs || [])
        .filter(input => Number.isInteger(input.slot))
        .map(input => recipeTier(input.slot, settings, next))
        .filter(Number.isFinite);
    return childTiers.length ? Math.max(...childTiers) + 1 : 2;
}

function createInventorySafeActions(plan, settings) {
    const remaining = new Map((plan?.actions || []).map(action => [
        action.slot,
        Math.max(0, Number(action.count) || 0)
    ]));
    const actions = [];
    const configuredBatchSize = Number(settings.b2BatchSize);
    const b2BatchSize = Number.isFinite(configuredBatchSize)
        ? Math.min(Math.max(configuredBatchSize, 1), 64)
        : 16;
    const append = slot => {
        const previous = actions.at(-1);
        const tier = recipeTier(slot, settings);
        const mayExtendPrevious = previous?.slot === slot && (tier !== 2 || previous.count < b2BatchSize);
        if (mayExtendPrevious) {
            previous.count += 1;
            return;
        }
        actions.push({
            slot,
            itemKey: recipeItemKey(slot, settings),
            name: settings.recipes?.[slot]?.name || `Slot ${slot}`,
            count: 1
        });
    };
    const emit = (slot, count) => {
        const available = remaining.get(slot) || 0;
        const requested = Math.min(Math.max(0, Number(count) || 0), available);
        if (requested <= 0) return;
        remaining.set(slot, available - requested);

        const recipe = settings.recipes?.[slot];
        for (let index = 0; index < requested; index += 1) {
            for (const input of recipe?.inputs || []) {
                if (Number.isInteger(input.slot)) emit(input.slot, input.amount);
            }
            append(slot);
        }
    };

    for (const action of [...(plan?.actions || [])].reverse()) emit(action.slot, remaining.get(action.slot));
    return actions;
}

const BLOCK_EQUIVALENTS = {
    coal: [{ slot: 11, itemName: 'coal_block', multiplier: 9 }],
    diamond: [{ slot: 14, itemName: 'diamond_block', multiplier: 9 }],
    emerald: [{ slot: 16, itemName: 'emerald_block', multiplier: 9 }],
    gold_ingot: [{ slot: 19, itemName: 'gold_block', multiplier: 9 }, { slot: 21, itemName: 'gold_ore', multiplier: 1 }],
    iron_ingot: [{ slot: 22, itemName: 'iron_block', multiplier: 9 }, { slot: 24, itemName: 'iron_ore', multiplier: 1 }],
    lapis_lazuli: [{ slot: 25, itemName: 'lapis_block', multiplier: 9 }],
    redstone: [{ slot: 32, itemName: 'redstone_block', multiplier: 9 }]
};

function assessStorage(plan, settings, snapshots = [], inventoryItems = [], checkedAt = Date.now()) {
    const bySlot = new Map(snapshots.map(item => [item.slot, item]));
    const byName = new Map();
    for (const snapshot of snapshots) {
        if (snapshot?.itemName && Number.isFinite(snapshot.amount)) {
            byName.set(snapshot.itemName, (byName.get(snapshot.itemName) || 0) + snapshot.amount);
        }
    }
    const inventoryByName = new Map();
    for (const item of inventoryItems) {
        const itemName = item?.itemName || item?.name;
        const count = Number(item?.count);
        if (itemName && Number.isFinite(count) && count > 0) inventoryByName.set(itemName, (inventoryByName.get(itemName) || 0) + count);
    }
    const sourceFor = item => {
        const configuredSlot = Number(settings.storageMaterialSlots?.[item]);
        const storagePrimary = Number.isInteger(configuredSlot) ? bySlot.get(configuredSlot)?.amount : undefined;
        const inventoryPrimary = inventoryByName.get(item) || 0;
        const equivalents = BLOCK_EQUIVALENTS[item] || [];
        const storageEquivalentAmounts = equivalents.map(source => {
            const amount = bySlot.get(source.slot)?.amount;
            return Number.isFinite(amount) ? amount * source.multiplier : null;
        });
        const inventoryEquivalentAmount = equivalents.reduce((total, source) => total + ((inventoryByName.get(source.itemName) || 0) * source.multiplier), 0);
        if (Number.isInteger(configuredSlot) || equivalents.length > 0) {
            const storageKnown = Number.isFinite(storagePrimary);
            const knownEquivalentAmounts = storageEquivalentAmounts.filter(Number.isFinite);
            return {
                primary: (storageKnown ? storagePrimary : 0) + inventoryPrimary,
                compressed: (storageKnown ? knownEquivalentAmounts.reduce((total, amount) => total + amount, 0) : 0) + inventoryEquivalentAmount,
                storageAvailable: storageKnown ? storagePrimary + knownEquivalentAmounts.reduce((total, amount) => total + amount, 0) : null,
                inventoryAvailable: inventoryPrimary + inventoryEquivalentAmount,
                known: storageKnown
            };
        }
        const fallback = byName.get(item);
        const storageKnown = Number.isFinite(fallback);
        return { primary: (storageKnown ? fallback : 0) + inventoryPrimary, compressed: 0, storageAvailable: storageKnown ? fallback : null, inventoryAvailable: inventoryPrimary, known: storageKnown };
    };
    const materials = (plan.rawRequirements || []).map(requirement => {
        const source = sourceFor(requirement.item);
        const storageAvailable = source.known ? source.storageAvailable || 0 : 0;
        const certainAvailable = source.inventoryAvailable + storageAvailable;
        const known = source.known || certainAvailable >= requirement.amount;
        const available = known ? certainAvailable : null;
        return { item: requirement.item, required: requirement.amount, direct: source.primary, compressed: source.compressed, rawItem: null, raw: null, inventory: source.inventoryAvailable, available, shortage: Number.isFinite(available) ? Math.max(0, requirement.amount - available) : null, enough: Number.isFinite(available) && available >= requirement.amount };
    });
    return { checkedAt, materials, canCraft: materials.every(material => material.enough), missing: materials.filter(material => !material.enough) };
}

function describeAvailability(availability) {
    if (!availability?.materials?.length) return 'Không có dữ liệu nguyên liệu từ /kho.';
    if (availability.canCraft) return 'Kho đủ nguyên liệu để chế tạo mục tiêu.';
    return availability.missing.map(material => {
        if (!Number.isFinite(material.available)) return `${material.item}: chưa đọc được số lượng`;
        return `${material.item}: thiếu ${material.shortage.toLocaleString('vi-VN')} (${material.available.toLocaleString('vi-VN')}/${material.required.toLocaleString('vi-VN')})`;
    }).join('; ');
}

function requiresFreeInventorySlot(action, usesShift, settings) {
    return !usesShift && recipeTier(action?.slot, settings) === 2;
}

function shouldUseShiftCraft(action, actionProgress, settings) {
    const shift = settings?.shiftCraft || {};
    if (shift.enabled !== true || !action || actionProgress !== 0) return false;
    const tier = recipeTier(action.slot, settings);
    if (tier === 2) return shift.tier2 !== false;
    if (tier === 3) return shift.tier3 !== false;
    if (tier !== 4) return false;
    const allowedSlots = Array.isArray(shift.tier4Slots) ? shift.tier4Slots : [];
    return allowedSlots.map(Number).includes(Number(action.slot));
}

function shouldUseBulkCraft(action, actionProgress, targetSlot, settings) {
    const bulk = settings?.bulkCraft || {};
    if (bulk.enabled !== true || !action) return false;
    if (bulk.finalTargetOnly !== false && action.slot !== targetSlot) return false;
    return action.slot === targetSlot && actionProgress === 0;
}

function boundedNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
}

module.exports = { buildPlan, reducePlanUsingExisting, planCraftableStages, recipeTier, createInventorySafeActions, assessStorage, describeAvailability, requiresFreeInventorySlot, shouldUseShiftCraft, shouldUseBulkCraft, boundedNumber };
