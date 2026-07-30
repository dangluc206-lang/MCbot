'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const { compactItemLabel, normalizeItemLabel } = require('../utils/ItemLabels');

const DEFAULT_RECIPES = Object.freeze({
    10: { itemKey: 'super_cobblestone', name: 'Siêu đá cuội', inputs: [{ item: 'cobblestone', amount: 16 }] },
    11: { itemKey: 'refined_coal', name: 'Than tinh luyện', inputs: [{ item: 'coal', amount: 16 }] },
    12: { itemKey: 'refined_redstone', name: 'Đá đỏ tinh luyện', inputs: [{ item: 'redstone', amount: 64 }] },
    13: { itemKey: 'refined_lapis', name: 'Lưu ly tinh luyện', inputs: [{ item: 'lapis_lazuli', amount: 64 }] },
    14: { itemKey: 'refined_iron', name: 'Sắt tinh luyện', inputs: [{ item: 'iron_ingot', amount: 64 }] },
    15: { itemKey: 'refined_gold', name: 'Vàng tinh luyện', inputs: [{ item: 'gold_ingot', amount: 64 }] },
    16: { itemKey: 'refined_diamond', name: 'Kim cương tinh luyện', inputs: [{ item: 'diamond', amount: 32 }] },
    19: { itemKey: 'refined_emerald', name: 'Ngọc lục bảo tinh luyện', inputs: [{ item: 'emerald', amount: 32 }] },
    20: { itemKey: 'super_cobblestone_block', name: 'Khối siêu đá cuội', inputs: [{ slot: 10, amount: 16 }] },
    21: { itemKey: 'refined_coal_block', name: 'Khối than tinh luyện', inputs: [{ slot: 11, amount: 16 }] },
    22: { itemKey: 'refined_redstone_block', name: 'Khối đá đỏ tinh luyện', inputs: [{ slot: 12, amount: 16 }] },
    23: { itemKey: 'refined_lapis_block', name: 'Khối lưu ly tinh luyện', inputs: [{ slot: 13, amount: 16 }] },
    24: { itemKey: 'refined_iron_block', name: 'Khối sắt tinh luyện', inputs: [{ slot: 14, amount: 16 }] },
    25: { itemKey: 'refined_gold_block', name: 'Khối vàng tinh luyện', inputs: [{ slot: 15, amount: 16 }] },
    28: { itemKey: 'refined_diamond_block', name: 'Khối kim cương tinh luyện', inputs: [{ slot: 16, amount: 16 }] },
    29: { itemKey: 'refined_emerald_block', name: 'Khối ngọc lục bảo tinh luyện', inputs: [{ slot: 19, amount: 16 }] },
    30: { itemKey: 'carbon', name: 'Cacbon', inputs: [{ slot: 22, amount: 8 }, { slot: 20, amount: 4 }, { slot: 21, amount: 16 }] },
    31: { itemKey: 'titan', name: 'Titan', inputs: [{ slot: 23, amount: 4 }, { slot: 24, amount: 16 }, { slot: 25, amount: 8 }, { slot: 29, amount: 2 }] },
    // User supplied the last gold-block requirement after an additional '='.
    // It is treated as another ingredient, not as a second recipe.
    32: { itemKey: 'wolfram', name: 'Volfram', inputs: [{ slot: 20, amount: 2 }, { slot: 28, amount: 16 }, { slot: 29, amount: 4 }, { slot: 24, amount: 8 }, { slot: 25, amount: 8 }] },
    33: { itemKey: 'super_alloy', name: 'Siêu Hợp Kim', inputs: [{ slot: 32, amount: 8 }, { slot: 31, amount: 16 }, { slot: 30, amount: 32 }] }
});

const DEFAULT_SETTINGS = Object.freeze({
    command: '/ks',
    entrySlot: 16,
    entryButton: 0,
    targetSlot: 33,
    targetCount: 1,
    guiTimeoutMs: 5000,
    clickIntervalMs: 500,
    clickAckTimeoutMs: 3000,
    // A custom GUI occasionally drops one click acknowledgement while the
    // connection itself remains healthy. Retry only non-bulk clicks; Shift
    // crafting is intentionally never repeated because it may craft many.
    clickAckMaxRetries: 2,
    clickAckRetryDelayMs: 1000,
    // When existing B2/B3 fill the inventory, rebuild the ledger before
    // giving up. The new plan can consume those items into B3/B4 instead of
    // blindly attempting another raw -> B2 click.
    inventoryPressureMaxReplans: 2,
    // A B2 action expands B1 blocks. Keep it bounded so the matching B1
    // remainder is re-packed frequently even if a custom recipe requests a
    // large amount of the same material.
    b2BatchSize: 16,
    maxActions: 100000,
    bulkCraft: {
        enabled: false,
        finalTargetOnly: true,
        minFreeSlots: 18,
        mouseButton: 0,
        mode: 1
    },
    // Intermediate tiers must be deterministic. MinerUA's Shift+left can
    // create materials until player inventory is full, which prevents later
    // B3/B4 consumption and can block the `/pv 2` recovery path.
    shiftCraft: {
        enabled: false,
        tier2: false,
        tier3: false,
        tier4Slots: [],
        stableMs: 400,
        maxReplans: 24
    },
    // A full Super Alloy tree is large. Build every currently feasible branch
    // instead of rejecting the entire run because one unrelated material is
    // missing. The next Collector cycle continues the deferred branches.
    partialCraft: {
        enabled: true
    },
    personalVault: {
        enabled: true,
        command: '/pv 2',
        guiTimeoutMs: 5000,
        transferMode: 1,
        transferDelayMs: 250,
        reserveInventorySlots: 4,
        aliases: {}
    },
    // Source-neutral aliases.  These are used for inventory, /pv 2, and
    // /kho; legacy personalVault.aliases remains supported.
    materialAliases: {},
    storageMaterialSlots: {
        coal: 10,
        cobblestone: 12,
        diamond: 13,
        emerald: 15,
        gold_ingot: 20,
        iron_ingot: 23,
        lapis_lazuli: 28,
        raw_gold: 29,
        raw_iron: 30,
        redstone: 31
    }
});

/** Plans and executes the configurable /ks recipe tree through GUIService. */
class CraftingService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'CraftingService';
        this.run = null;
    }

    settings() {
        const configured = this.config.crafting || {};
        // Preserve framework metadata (especially itemKey) when config.json
        // overrides only a recipe name or input list. A shallow object spread
        // used to replace an entire default recipe and silently removed its
        // stable material identity.
        const recipes = {};
        const configuredRecipes = configured.recipes || {};
        for (const slot of new Set([...Object.keys(DEFAULT_RECIPES), ...Object.keys(configuredRecipes)])) {
            recipes[slot] = {
                ...(DEFAULT_RECIPES[slot] || {}),
                ...(configuredRecipes[slot] || {})
            };
        }
        return {
            ...DEFAULT_SETTINGS,
            ...configured,
            bulkCraft: { ...DEFAULT_SETTINGS.bulkCraft, ...(configured.bulkCraft || {}) },
            shiftCraft: { ...DEFAULT_SETTINGS.shiftCraft, ...(configured.shiftCraft || {}) },
            partialCraft: { ...DEFAULT_SETTINGS.partialCraft, ...(configured.partialCraft || {}) },
            personalVault: { ...DEFAULT_SETTINGS.personalVault, ...(configured.personalVault || {}) },
            materialAliases: { ...(configured.materialAliases || {}) },
            storageMaterialSlots: {
                ...DEFAULT_SETTINGS.storageMaterialSlots,
                ...(configured.storageMaterialSlots || {})
            },
            recipes
        };
    }

    /**
     * Builds one post-order plan: materials first, Siêu Hợp Kim last.
     * @param {Number} targetSlot
     * @param {Number} targetCount
     */
    plan(targetSlot = this.settings().targetSlot, targetCount = this.settings().targetCount) {
        const settings = this.settings();
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
            itemKey: this._recipeItemKey(recipeSlot, settings),
            name: settings.recipes[recipeSlot].name || `Slot ${recipeSlot}`,
            count: required.get(recipeSlot) || 0
        }));
        return {
            targetSlot: slot,
            targetItemKey: this._recipeItemKey(slot, settings),
            targetCount: count,
            targetName: settings.recipes[slot].name || `Slot ${slot}`,
            actions,
            rawRequirements: [...raw.entries()].map(([item, amount]) => ({ item, amount })),
            totalActions: actions.reduce((total, action) => total + action.count, 0)
        };
    }

    /**
     * Removes recipe clicks that are already represented by custom items in
     * the bot inventory, /pv 2, or /kho. The recipe is resolved from target to raw
     * materials, then emitted in normal child-first crafting order.
     */
    planUsingExisting(basePlan, supplies, settings = this.settings()) {
        const needed = new Map([[basePlan.targetSlot, basePlan.targetCount]]);
        const actionCounts = new Map();
        const raw = new Map();
        const existing = new Map();
        const add = (map, key, amount) => map.set(key, (map.get(key) || 0) + amount);

        for (const action of [...basePlan.actions].reverse()) {
            const required = needed.get(action.slot) || 0;
            const supply = supplies.get(action.slot) || { inventory: 0, storage: 0, vault: 0 };
            // targetCount means "create this many NEW target items". An SHK
            // already in inventory, /pv 2, or /kho is completed stock, never
            // an input which can satisfy the current craft request. All
            // intermediate recipes still consume existing stock normally.
            const isTarget = action.slot === basePlan.targetSlot;
            const inventoryUsed = isTarget ? 0 : Math.min(required, supply.inventory || 0);
            // `/ks` consumes player-carried intermediate components. `/kho`
            // is intentionally B1-only: the server draws raw inputs from it
            // while crafting B2, but B2/B3/B4 shown there must never be
            // treated as player-carried stock. Only inventory and `/pv 2`
            // can satisfy an intermediate dependency.
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
                    aliases: this._recipeAliases(item.slot, item.name, settings),
                    amount: item.vaultUsed
                }))
        };
    }

    /**
     * Splits a full recipe tree into the branch actions that can be crafted
     * now. This prevents one missing raw material from blocking unrelated
     * refined materials, blocks, Carbon, Titan, or Volfram.
     *
     * Existing recipe outputs are consumed in this order: inventory, `/pv 2`,
     * `/kho`, then outputs planned earlier in this stage.  This ensures a
     * custom material already stored in the player's vault is withdrawn and
     * used before Collector creates a duplicate from raw material.
     * The resulting vault request contains only items needed by actions that
     * will actually run.
     *
     * @param {Object} plan plan already reduced by planUsingExisting()
     * @param {Object} availability result from assessStorage(plan)
     * @param {Object} settings resolved crafting settings
     * @returns {Object}
     */
    planCraftableStages(plan, availability, settings = this.settings()) {
        const rawAvailable = new Map();
        for (const material of availability?.materials || []) {
            rawAvailable.set(
                material.item,
                Number.isFinite(material.available) ? Math.max(0, material.available) : 0
            );
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
            if (!products.has(slot)) {
                products.set(slot, { inventory: 0, crafted: 0, storage: 0, vault: 0, vaultConsumed: 0 });
            }
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
        const produceProduct = (slot, amount) => {
            productFor(slot).crafted += amount;
        };

        const actions = [];
        const deferredActions = [];
        const rawRequirements = new Map();
        const addRawRequirement = (item, amount) => {
            rawRequirements.set(item, (rawRequirements.get(item) || 0) + amount);
        };

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
            produceProduct(action.slot, executable);
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
                return {
                    slot,
                    name: item?.name || settings.recipes?.[slot]?.name || `Slot ${slot}`,
                    aliases: this._recipeAliases(slot, item?.name || settings.recipes?.[slot]?.name || `Slot ${slot}`, settings),
                    amount: product.vaultConsumed
                };
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

    /** Withdraws only the /pv 2 items consumed by the current craft stage. */
    async _withdrawVaultItems(requests) {
        if (!Array.isArray(requests) || requests.length === 0) return Result.NO_ACTION;
        const result = await this.service('personalVault')?.withdraw?.(requests);
        if (result !== Result.SUCCESS && result !== Result.NO_ACTION) return result || Result.FAILED;
        this.service('inventory')?.sync?.({ emit: false });
        return result;
    }

    /**
     * Ensures player inventory holds only the inputs needed for the one
     * upcoming click.  This is deliberately just-in-time: opening /pv 2 for
     * every planned B3/B4/B5 material at once used to pull whole stacks and
     * make the inventory full before the high-tier recipe could consume them.
     *
     * @private
     */
    async _prepareVaultInputsForAction(action) {
        if (!this.run?.settings || !action) return Result.NO_ACTION;
        const vaultSettings = this.run.settings.personalVault || {};
        if (vaultSettings.enabled === false) return Result.NO_ACTION;

        const actionKey = `${this.run.actionIndex}:${this.run.actionProgress}:${action.slot}`;
        if (this.run.preparedVaultActionKey === actionKey) return Result.NO_ACTION;

        const recipe = this.run.settings.recipes?.[Number(action.slot)] || {};
        const definitions = this._materialDefinitions(this.run.settings);
        const requests = [];
        const missing = [];
        for (const input of recipe.inputs || []) {
            if (!Number.isInteger(input?.slot)) continue;
            const definition = definitions.get(Number(input.slot));
            if (!definition) continue;
            const required = Math.max(0, Math.floor(Number(input.amount) || 0));
            if (required <= 0) continue;

            const carried = this._countMaterialInInventory(definition.slot);
            const needed = Math.max(0, required - carried);
            if (needed <= 0) continue;

            const inVault = this._countMaterialInVault(definition.slot, definitions);
            const amount = Math.min(needed, inVault);
            if (amount > 0) {
                requests.push({
                    slot: definition.slot,
                    name: definition.name,
                    aliases: definition.aliases,
                    amount
                });
            }
            if (amount < needed) {
                missing.push({ name: definition.name, amount: needed - amount });
            }
        }

        if (missing.length > 0) {
            return this._fail(
                Result.INSUFFICIENT_ITEMS,
                `Thiếu nguyên liệu mang theo cho ${action.name}: ${missing
                    .map(item => `${item.name} thiếu ${item.amount}`)
                    .join(', ')}.`
            );
        }
        if (requests.length === 0) {
            this.run.preparedVaultActionKey = actionKey;
            return Result.NO_ACTION;
        }

        const gui = this.service('gui');
        if (gui?.isOpen?.()) await gui.close();
        const result = await this._withdrawVaultItems(requests);
        if (result !== Result.SUCCESS && result !== Result.NO_ACTION) {
            return this._fail(result || Result.FAILED, `Không thể rút đúng nguyên liệu cho ${action.name}: ${result || Result.FAILED}.`);
        }

        this.run.preparedVaultActionKey = actionKey;
        this._recordActualVaultWithdrawals(requests);
        this.run.status = 'OPENING_GUI';
        this.run.nextAt = Date.now();
        this._setState('OPENING_GUI', {
            currentVaultWithdrawal: { action: action.name, items: requests },
            personalVaultWithdrawals: this.run.actualVaultWithdrawals
        });
        this.info(
            `Rút đúng từ /pv 2 cho ${action.name}: ${requests
                .map(item => `${item.name} x${item.amount}`)
                .join(', ')}.`
        );
        return Result.PENDING;
    }

    /** @private */
    _countMaterialInVault(slot, definitions = this._materialDefinitions(this.run?.settings || this.settings())) {
        const definition = definitions.get(Number(slot));
        if (!definition) return 0;
        const items = this.service('personalVault')?.getItems?.() || this.state.personalVault?.items || [];
        return items.reduce((total, item) => (
            this._matchMaterialDefinition(item, new Map([[definition.slot, definition]]))
                ? total + Math.max(0, Number(item?.count) || 0)
                : total
        ), 0);
    }

    /** @private */
    _recordActualVaultWithdrawals(requests) {
        const totals = new Map((this.run.actualVaultWithdrawals || []).map(item => [item.slot, { ...item }]));
        for (const request of requests) {
            const current = totals.get(request.slot) || { ...request, amount: 0 };
            current.amount += Math.max(0, Number(request.amount) || 0);
            totals.set(request.slot, current);
        }
        this.run.actualVaultWithdrawals = [...totals.values()];
    }

    /**
     * Produces a source-aware ledger for every custom recipe output.  `/kho`
     * exposes the actual quantity through lore (`Số lượng`), while inventory
     * and `/pv 2` use their stack count.
     */
    buildMaterialLedger(settings = this.settings()) {
        const definitions = this._materialDefinitions(settings);
        const supplies = new Map([...definitions.keys()].map(slot => [slot, {
            inventory: 0,
            storage: 0,
            vault: 0
        }]));
        const addItems = (items, source, quantityFor) => {
            for (const item of items || []) {
                const count = Number(quantityFor(item));
                if (!Number.isFinite(count) || count <= 0) continue;
                const definition = this._matchMaterialDefinition(item, definitions);
                if (!definition) continue;
                supplies.get(definition.slot)[source] += count;
            }
        };
        const inventoryItems = this.service('inventory')?.getItems?.() || this.state.inventory.items || [];
        const vaultItems = this.service('personalVault')?.getItems?.() || this.state.personalVault?.items || [];
        const storageItems = this.state.storage?.gui?.items || [];
        addItems(inventoryItems, 'inventory', item => item?.count);
        addItems(vaultItems, 'vault', item => item?.count);
        addItems(storageItems, 'storage', item => Number.isFinite(item?.amount) ? item.amount : item?.count);

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
        return {
            updatedAt: Date.now(),
            entries,
            total: entries.reduce((sum, item) => sum + item.total, 0)
        };
    }

    /**
     * Opens `/pv 2` once and reports exactly how Mineflayer labels every
     * stored stack. This is an explicit diagnostic only: it never withdraws,
     * moves, sells, or crafts an item.
     */
    async auditPersonalVault() {
        if (!this.state.bot.connected) {
            return { result: Result.NOT_CONNECTED, message: 'Minecraft bot chưa sẵn sàng.', items: [] };
        }
        if (this.run?.active || this.service('personalVault')?.busy) {
            return { result: Result.BUSY, message: 'Đang có luồng craft hoặc /pv 2 khác chạy; không thể audit an toàn.', items: [] };
        }

        const vault = this.service('personalVault');
        const result = await vault?.refresh?.();
        if (result !== Result.SUCCESS) {
            return { result: result || Result.FAILED, message: `Không thể mở /pv 2: ${result || Result.FAILED}.`, items: [] };
        }

        const definitions = this._materialDefinitions(this.settings());
        const items = (vault.getItems?.() || []).map(item => {
            const material = this._matchMaterialDefinition(item, definitions);
            return {
                vaultSlot: item.slot,
                carrier: item.itemName || null,
                count: Number(item.count) || 0,
                displayName: item.displayName || null,
                labels: (item.labels || []).slice(0, 8),
                recipeSlot: material?.slot ?? null,
                itemKey: material?.itemKey ?? null,
                recipeName: material?.name ?? null
            };
        });
        const mapped = items.filter(item => item.recipeSlot !== null);
        const unknown = items.length - mapped.length;
        const audit = { updatedAt: Date.now(), itemCount: items.length, mappedCount: mapped.length, unknownCount: unknown, items };
        this._setState(this.run?.status || 'IDLE', { lastPersonalVaultAudit: audit });
        this.success(`[PV2 audit] ${mapped.length}/${items.length} stack được map vào nguyên liệu SHK; unknown=${unknown}.`);
        for (const item of items) {
            const mappedText = item.recipeSlot === null
                ? 'UNKNOWN'
                : `slot ${item.recipeSlot} (${item.recipeName})`;
            this.info(
                `[PV2 audit] #${item.vaultSlot} ${item.carrier || 'unknown'} x${item.count} `
                + `| display="${this._trimDiagnostic(item.displayName || '')}" `
                + `| map=${mappedText} `
                + `| labels=${this._trimDiagnostic(item.labels.join(' || '))}`
            );
        }
        return {
            result: Result.SUCCESS,
            message: `Đã audit /pv 2: map ${mapped.length}/${items.length} stack, unknown ${unknown}. Xem terminal [PV2 audit].`,
            items
        };
    }

    _materialDefinitions(settings = this.settings()) {
        const definitions = new Map();
        for (const [slot, recipe] of Object.entries(settings.recipes || {})) {
            const numericSlot = Number(slot);
            if (!Number.isInteger(numericSlot)) continue;
            definitions.set(numericSlot, {
                slot: numericSlot,
                itemKey: this._recipeItemKey(numericSlot, settings),
                name: recipe.name || `Slot ${numericSlot}`,
                aliases: this._recipeAliases(numericSlot, recipe.name || `Slot ${numericSlot}`, settings)
            });
        }
        return definitions;
    }

    _matchMaterialDefinition(item, definitions) {
        const allLabels = item?.labels || item?.lines || [item?.displayName, item?.name, item?.itemName];
        // The first visible text is the item's custom display name. Lore also
        // contains recipe descriptions, so only the display name may use the
        // forgiving variant matcher; otherwise an unrelated item can be
        // counted because its lore mentions a material.
        const identityLabels = [item?.displayName, allLabels[0]]
            .filter(label => typeof label === 'string' && label.trim());
        const candidates = [...definitions.values()];
        const exact = candidates.find(candidate => allLabels
            .some(label => this._matchesRecipeItem(label, candidate)));
        if (exact) return exact;

        // "Khối vàng tinh luyện" also contains "Vàng tinh luyện". Choose
        // the most-specific alias so the block maps to slot 25, not slot 15.
        return candidates
            .filter(candidate => identityLabels
                .some(label => this._matchesRecipeItemVariant(label, candidate)))
            .sort((left, right) => this._longestRecipeAlias(right) - this._longestRecipeAlias(left))[0] || null;
    }

    _recipeSupplies(settings = this.settings()) {
        const ledger = this.buildMaterialLedger(settings);
        const supplies = new Map(ledger.entries.map(item => [item.slot, {
            inventory: item.inventory,
            storage: item.storage,
            vault: item.vault
        }]));
        this._setLedger(ledger);
        return supplies;
    }

    /**
     * Recipe GUI slots are stable only inside `/ks`. Material identity for
     * inventory, `/pv 2`, and `/kho` is the explicit item key. A predictable
     * fallback keeps legacy custom recipes working until their config adds
     * `itemKey`.
     */
    _recipeItemKey(slot, settings = this.settings()) {
        const configured = settings.recipes?.[slot]?.itemKey;
        if (typeof configured === 'string' && configured.trim()) {
            return configured.trim().toLowerCase();
        }
        return `recipe_${Number(slot)}`;
    }

    _recipeAliases(slot, name, settings = this.settings()) {
        const itemKey = this._recipeItemKey(slot, settings);
        const modern = settings.materialAliases?.[itemKey]
            || settings.materialAliases?.[slot]
            || settings.materialAliases?.[String(slot)]
            || [];
        const legacy = settings.personalVault?.aliases?.[itemKey]
            || settings.personalVault?.aliases?.[slot]
            || settings.personalVault?.aliases?.[String(slot)]
            || [];
        return [...new Set([name,
            ...(Array.isArray(modern) ? modern : [modern]),
            ...(Array.isArray(legacy) ? legacy : [legacy])]
            .filter(value => typeof value === 'string' && value.trim()))];
    }

    _matchesRecipeItem(label, definition) {
        const normalized = this._normalizeItemLabel(label);
        const compact = compactItemLabel(label);
        return definition.aliases.some(alias => {
            const normalizedAlias = this._normalizeItemLabel(alias);
            return normalizedAlias === normalized
                || (compact.length >= 6 && compactItemLabel(alias) === compact);
        });
    }

    /**
     * Matches harmless server decorations in an item display name, for
     * example "Khối Vàng Tinh Luyện ✦" or "[TL] Khối Vàng Tinh Luyện".
     * This intentionally does not inspect lore: lore commonly lists other
     * recipe ingredients and would create false ledger entries.
     */
    _matchesRecipeItemVariant(label, definition) {
        const normalizedLabel = this._normalizeItemLabel(label);
        if (!normalizedLabel) return false;
        return definition.aliases.some(alias => {
            const normalizedAlias = this._normalizeItemLabel(alias);
            return normalizedAlias.length >= 8 && normalizedLabel.includes(normalizedAlias);
        });
    }

    _longestRecipeAlias(definition) {
        return Math.max(0, ...definition.aliases.map(alias => this._normalizeItemLabel(alias).length));
    }

    _describeLedgerIntermediates(ledger) {
        const usefulSlots = new Set([10, 11, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 24, 25, 28, 29, 30, 31, 32, 33]);
        const entries = (ledger?.entries || [])
            .filter(item => usefulSlots.has(item.slot) && item.total > 0)
            .map(item => `#${item.slot} ${item.name}: inv=${item.inventory}, pv2=${item.vault}, kho=${item.storage}`);
        return entries.length ? entries.join(' | ') : 'không nhận diện được vật liệu SHK nào.';
    }

    _trimDiagnostic(value, maxLength = 240) {
        const text = String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
        return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
    }

    _normalizeItemLabel(value) {
        return normalizeItemLabel(value);
    }

    /**
     * Compares the current /kho quantities against the raw inputs needed by a
     * crafting plan.
     *
     * Raw iron and raw gold deliberately do not count as ingots here. The
     * StorageService post-processing pipeline handles `/ks > 12 > 1` before
     * CraftingService takes its authoritative second `/kho` snapshot. Counting
     * raw items as if they were already smelted made the planner click a recipe
     * which the server could still reject when a smelting pass failed or was
     * rate-limited.
     */
    assessStorage(plan, settings = this.settings()) {
        const snapshots = this.state.storage?.gui?.items || [];
        const bySlot = new Map(snapshots.map(item => [item.slot, item]));
        const byName = new Map();
        for (const snapshot of snapshots) {
            if (!snapshot?.itemName || !Number.isFinite(snapshot.amount)) continue;
            byName.set(snapshot.itemName, (byName.get(snapshot.itemName) || 0) + snapshot.amount);
        }
        const inventoryByName = new Map();
        const inventoryItems = this.service('inventory')?.getItems?.() || this.state.inventory?.items || [];
        for (const item of inventoryItems) {
            const itemName = item?.itemName || item?.name;
            const count = Number(item?.count);
            if (!itemName || !Number.isFinite(count) || count <= 0) continue;
            inventoryByName.set(itemName, (inventoryByName.get(itemName) || 0) + count);
        }

        const blockEquivalents = {
            coal: [{ slot: 11, itemName: 'coal_block', multiplier: 9 }],
            diamond: [{ slot: 14, itemName: 'diamond_block', multiplier: 9 }],
            emerald: [{ slot: 16, itemName: 'emerald_block', multiplier: 9 }],
            gold_ingot: [{ slot: 19, itemName: 'gold_block', multiplier: 9 }, { slot: 21, itemName: 'gold_ore', multiplier: 1 }],
            iron_ingot: [{ slot: 22, itemName: 'iron_block', multiplier: 9 }, { slot: 24, itemName: 'iron_ore', multiplier: 1 }],
            lapis_lazuli: [{ slot: 25, itemName: 'lapis_block', multiplier: 9 }],
            redstone: [{ slot: 32, itemName: 'redstone_block', multiplier: 9 }]
        };
        const sourceFor = item => {
            const configuredSlot = Number(settings.storageMaterialSlots?.[item]);
            const slotItem = Number.isInteger(configuredSlot) ? bySlot.get(configuredSlot) : null;
            const storagePrimary = slotItem?.amount;
            const inventoryPrimary = inventoryByName.get(item) || 0;
            const equivalents = blockEquivalents[item] || [];
            const storageEquivalentAmounts = equivalents.map(source => {
                const amount = bySlot.get(source.slot)?.amount;
                return Number.isFinite(amount) ? amount * source.multiplier : null;
            });
            const inventoryEquivalentAmount = equivalents.reduce(
                (total, source) => total + ((inventoryByName.get(source.itemName) || 0) * source.multiplier),
                0
            );
            const usesConfiguredSlots = Number.isInteger(configuredSlot) || equivalents.length > 0;
            if (usesConfiguredSlots) {
                // A readable primary material is enough to prove a recipe is
                // feasible by itself. Unknown optional block slots must not
                // prevent Collector from starting a valid SHK run.
                const storageKnown = Number.isFinite(storagePrimary);
                const knownEquivalentAmounts = storageEquivalentAmounts
                    .filter(Number.isFinite);
                const storageAvailable = storageKnown
                    ? storagePrimary + knownEquivalentAmounts.reduce((total, amount) => total + amount, 0)
                    : null;
                return {
                    primary: (Number.isFinite(storagePrimary) ? storagePrimary : 0) + inventoryPrimary,
                    compressed: (storageKnown ? knownEquivalentAmounts.reduce((total, amount) => total + amount, 0) : 0) + inventoryEquivalentAmount,
                    storageAvailable,
                    inventoryAvailable: inventoryPrimary + inventoryEquivalentAmount,
                    known: storageKnown
                };
            }
            const fallback = byName.get(item);
            const storageKnown = Number.isFinite(fallback);
            return {
                primary: (storageKnown ? fallback : 0) + inventoryPrimary,
                compressed: 0,
                storageAvailable: storageKnown ? fallback : null,
                inventoryAvailable: inventoryPrimary,
                known: storageKnown
            };
        };
        const materials = plan.rawRequirements.map(requirement => {
            const source = sourceFor(requirement.item);
            const inventoryAvailable = source.inventoryAvailable;
            const storageAvailable = source.known ? source.storageAvailable || 0 : 0;
            // Inventory is authoritative too: if it alone covers the recipe,
            // crafting may proceed even while a custom /kho item lacks lore.
            const certainAvailable = inventoryAvailable + storageAvailable;
            const known = source.known || certainAvailable >= requirement.amount;
            const available = known ? certainAvailable : null;
            return {
                item: requirement.item,
                required: requirement.amount,
                direct: source.primary,
                compressed: source.compressed,
                rawItem: null,
                raw: null,
                inventory: inventoryAvailable,
                available,
                shortage: Number.isFinite(available) ? Math.max(0, requirement.amount - available) : null,
                enough: Number.isFinite(available) && available >= requirement.amount
            };
        });
        return {
            checkedAt: Date.now(),
            materials,
            canCraft: materials.every(material => material.enough),
            missing: materials.filter(material => !material.enough)
        };
    }

    describeAvailability(availability) {
        if (!availability?.materials?.length) return 'Không có dữ liệu nguyên liệu từ /kho.';
        if (availability.canCraft) return 'Kho đủ nguyên liệu để chế tạo mục tiêu.';
        return availability.missing.map(material => {
            if (!Number.isFinite(material.available)) {
                return `${material.item}: chưa đọc được số lượng`;
            }
            return `${material.item}: thiếu ${material.shortage.toLocaleString('vi-VN')} (${material.available.toLocaleString('vi-VN')}/${material.required.toLocaleString('vi-VN')})`;
        }).join('; ');
    }

    /**
     * Returns whether the latest `/kho` snapshot has every raw material needed
     * for the configured target. Collector uses this as its trigger instead
     * of the decorative/full-capacity value from storage slot 49.
     */
    getStorageReadiness(targetSlot = this.settings().targetSlot, targetCount = this.settings().targetCount) {
        try {
            const settings = this.settings();
            const plan = this.plan(targetSlot, targetCount);
            const availability = this.assessStorage(plan, settings);
            return {
                ready: availability.canCraft,
                plan,
                availability,
                reason: availability.canCraft ? null : this.describeAvailability(availability)
            };
        } catch (error) {
            return {
                ready: false,
                plan: null,
                availability: null,
                reason: error.message
            };
        }
    }

    /**
     * Converts an aggregated feasible plan into small child-first batches.
     * If a child recipe has no remaining action, that output is already in
     * inventory or `/pv 2`; otherwise it is crafted directly before its
     * parent. Adjacent identical clicks are compressed into one action.
     *
     * @param {Object} plan aggregated craftable plan
     * @param {Object} settings resolved crafting settings
     * @returns {Array<{slot:Number,name:String,count:Number}>}
     */
    createInventorySafeActions(plan, settings = this.settings()) {
        const remaining = new Map((plan?.actions || []).map(action => [
            action.slot,
            Math.max(0, Number(action.count) || 0)
        ]));
        const actions = [];
        const b2BatchSize = this._bounded(Number(settings.b2BatchSize), 1, 64, 16);
        const append = slot => {
            const previous = actions.at(-1);
            const tier = this._recipeTier(slot, settings);
            const mayExtendPrevious = previous?.slot === slot
                && (tier !== 2 || previous.count < b2BatchSize);
            if (mayExtendPrevious) {
                previous.count += 1;
                return;
            }
            actions.push({
                slot,
                itemKey: this._recipeItemKey(slot, settings),
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

        // Start at final products. Remaining partial branches are emitted in
        // reverse dependency order after the final target is satisfied.
        for (const action of [...(plan?.actions || [])].reverse()) {
            emit(action.slot, remaining.get(action.slot));
        }
        return actions;
    }

    /** Returns the SHK stack created by a completed run, if one was created. */
    getCompletedTargetDepositRequest() {
        if (!this.succeeded() || !this.run?.settings || !this.run?.plan) return null;
        const amount = this.getCraftedTargetCount();
        if (amount <= 0) return null;
        return {
            name: this.run.plan.targetName,
            aliases: this._recipeAliases(this.run.plan.targetSlot, this.run.plan.targetName, this.run.settings),
            amount
        };
    }

    /**
     * Returns B2-B4 materials currently in the player inventory. This is used
     * both after a completed batch and after a safe failure (for example an
     * unexpected full inventory), so custom intermediates can be recovered to
     * `/pv 2` instead of blocking the next craft attempt. Raw B1, tools,
     * food, and unrelated drops are never included.
     */
    getIntermediateRecoveryDepositRequests() {
        if (!this.run?.settings) return [];
        const settings = this.run.settings;
        const definitions = this._materialDefinitions(settings);
        const totals = new Map();
        const items = this.service('inventory')?.getItems?.() || this.state.inventory?.items || [];
        for (const item of items) {
            const definition = this._matchMaterialDefinition(item, definitions);
            if (!definition) continue;
            const tier = this._recipeTier(definition.slot, settings);
            if (tier === null || tier < 2 || tier > 4) continue;
            totals.set(definition.slot, (totals.get(definition.slot) || 0) + Math.max(0, Number(item.count) || 0));
        }
        return [...totals.entries()]
            .filter(([, amount]) => amount > 0)
            .map(([slot, amount]) => {
                const definition = definitions.get(slot);
                return {
                    name: definition.name,
                    aliases: this._recipeAliases(slot, definition.name, settings),
                    amount
                };
            });
    }

    /** Number of configured target items actually created by GUI clicks. */
    getCraftedTargetCount() {
        if (!this.succeeded()) return 0;
        return Math.max(0, Number(this.run?.targetCraftCount) || 0);
    }

    getMaterialLedger() {
        return this.state.crafting?.materialLedger || null;
    }

    start(targetSlot, targetCount, options = {}) {
        if (!this.state.bot.connected) return Result.NOT_CONNECTED;
        if (this.run?.active) return Result.BUSY;

        let plan;
        let settings;
        try {
            settings = this.settings();
            if (options.bulkCraftEnabled === false) {
                settings.bulkCraft = { ...settings.bulkCraft, enabled: false };
            }
            plan = this.plan(targetSlot, targetCount);
        } catch (error) {
            this._setState('FAILED', { error: error.message });
            this.error(error.message);
            return Result.FAILED;
        }
        if (plan.totalActions > Number(settings.maxActions)) {
            const message = `Kế hoạch cần ${plan.totalActions} click, vượt crafting.maxActions=${settings.maxActions}.`;
            this._setState('FAILED', { error: message });
            this.warn(message);
            return Result.FAILED;
        }

        this.run = {
            active: true,
            status: 'CHECKING_STORAGE',
            settings,
            plan,
            basePlan: plan,
            actionIndex: 0,
            actionProgress: 0,
            completedActions: 0,
            availability: null,
            personalVaultChecked: false,
            // `plannedVaultWithdrawals` is only a ledger estimate.  Items are
            // transferred from /pv 2 immediately before the one click that
            // consumes them, never all at preflight.
            plannedVaultWithdrawals: [],
            vaultWithdrawals: [],
            actualVaultWithdrawals: [],
            preparedVaultActionKey: null,
            postTargetB3PromotionChecked: false,
            createdTargetCount: 0,
            targetCraftCount: 0,
            resumeStatus: null,
            partial: false,
            nextAt: 0,
            guiDeadline: 0,
            previousWindow: null,
            openedWindow: null,
            entryGuiUpdatedAt: 0,
            loggedActionIndex: -1,
            lastLoggedCompletedActions: -1,
            pendingClick: null,
            actionRetryCount: 0,
            shiftReplanCount: 0,
            shiftHistory: [],
            inventoryPressureReplanCount: 0,
            // The current B2 group is prepared just-in-time. It is reset
            // after B1 is packed back into blocks, so each later B2 group
            // must reserve safe `/kho` capacity before it can unpack again.
            preparedTier2ActionIndex: null,
            error: null
        };
        this._setState('CHECKING_STORAGE');
        this.info(this.describePlan(plan));
        return Result.SUCCESS;
    }

    async tick() {
        if (!this.run?.active) return Result.NO_ACTION;
        if (!this.state.bot.connected) return this._fail(Result.DISCONNECTED, 'Mất kết nối khi đang chế tạo.');

        const now = Date.now();
        const gui = this.service('gui');
        if (this.run.status === 'CHECKING_STORAGE') {
            if (!this.run.personalVaultChecked) {
                const vaultSettings = this.run.settings.personalVault || {};
                if (vaultSettings.enabled !== false) {
                    const personalVault = this.service('personalVault');
                    const vaultResult = await personalVault?.refresh?.();
                    if (vaultResult !== Result.SUCCESS) {
                        return this._fail(vaultResult || Result.FAILED, `Không thể đọc /pv 2 trước khi chế tạo: ${vaultResult || Result.FAILED}.`);
                    }
                }
                // InventoryService snapshots main inventory and hotbar.  It
                // must be refreshed after /pv as the server can place an item
                // directly in a hotbar slot.
                this.service('inventory')?.sync?.();
                this.run.personalVaultChecked = true;
                this._setState('CHECKING_STORAGE', {
                    personalVaultCheckedAt: this.state.personalVault?.updatedAt || null,
                    personalVaultWithdrawals: this.run.actualVaultWithdrawals || []
                });
            }

            // The full preflight order is inventory -> /pv 2 -> /kho.  Do it
            // even when the initial plan contains no raw inputs so an SHK or
            // intermediate already stored in NPC storage is counted too.
            const storage = this.service('storage');
            const storageResult = await storage?.refreshStorageGui?.({
                // Raw inputs may be needed for B1 immediately below. Nung is
                // still allowed; packing waits until Collector is idle.
                runCompression: false
            });
            if (storageResult !== Result.SUCCESS) {
                return this._fail(storageResult, `Không thể đọc /kho trước khi chế tạo: ${storageResult}.`);
            }

            // Smelting may mutate /kho. Read once more before the ledger; this
            // snapshot intentionally skips post-processing so it remains the
            // authoritative raw-vs-block source for the staged craft batch.
            const postProcessStorageResult = await storage.refreshStorageGui({
                runPostProcessing: false
            });
            if (postProcessStorageResult !== Result.SUCCESS) {
                return this._fail(
                    postProcessStorageResult,
                    `Không thể đọc lại /kho sau nung/đổi khối: ${postProcessStorageResult}.`
                );
            }
            this.run.plan = this.planUsingExisting(
                this.run.basePlan,
                this._recipeSupplies(this.run.settings),
                this.run.settings
            );
            if (this.run.plan.totalActions > Number(this.run.settings.maxActions)) {
                return this._fail(Result.FAILED, `Kế hoạch sau khi đọc inventory + /pv 2 + /kho cần ${this.run.plan.totalActions} click, vượt crafting.maxActions=${this.run.settings.maxActions}.`);
            }
            this.success(
                `Đã lập ledger inventory + /pv 2 + /kho: `
                + `${this.run.plan.totalActions} click trước khi tách công đoạn.`
            );
            this.info(`Ledger SHK: ${this._describeLedgerIntermediates(this.getMaterialLedger())}`);

            if (this.run.plan.totalActions === 0) {
                // A valid craft request always retains its target action even
                // when an SHK is already in /pv 2. This branch is defensive
                // for a malformed/custom empty plan only; never treat owned
                // target stock as a completed new craft.
                this.run.plannedVaultWithdrawals = [];
                this.run.vaultWithdrawals = [];
                this.run.availability = {
                    checkedAt: Date.now(),
                    materials: [],
                    canCraft: true,
                    missing: []
                };
                this.success('Kế hoạch không có công đoạn cần click; kết thúc mà không rút mục tiêu đã có.');
                return this._complete();
            }

            let availability = {
                checkedAt: Date.now(),
                materials: [],
                canCraft: true,
                missing: []
            };
            if (this.run.plan.rawRequirements.length > 0) {
                availability = this.assessStorage(this.run.plan, this.run.settings);
            }

            const partialEnabled = this.run.settings.partialCraft?.enabled !== false;
            let stagedPlan = partialEnabled
                ? this.planCraftableStages(this.run.plan, availability, this.run.settings)
                : this.run.plan;

            // Never expand every B1 block at preflight. MinerUA expands an
            // entire material type per click, so that old behaviour could fill
            // `/kho` long before the matching B2 action consumed its inputs.
            // A B2 group now reserves space and unpacks immediately before it
            // clicks, then packs B1 again as soon as the group is complete.
            if (!partialEnabled && !availability.canCraft) {
                return this._fail(Result.INSUFFICIENT_ITEMS, `Kho chưa đủ nguyên liệu: ${this.describeAvailability(availability)}.`);
            }
            if (stagedPlan.totalActions === 0) {
                return this._fail(
                    Result.INSUFFICIENT_ITEMS,
                    `Chưa có công đoạn SHK nào đủ nguyên liệu: ${this.describeAvailability(availability)}.`
                );
            }

            this.run.plan = stagedPlan;
            this.run.partial = Boolean(stagedPlan.partial);
            this.run.targetCraftCount = Math.max(0, Number(stagedPlan.actions
                .find(action => action.slot === stagedPlan.targetSlot)?.count) || 0);
            this.run.plannedVaultWithdrawals = stagedPlan.vaultWithdrawals || [];
            this.run.vaultWithdrawals = this.run.plannedVaultWithdrawals;
            this.run.actualVaultWithdrawals = [];
            if (this.run.plannedVaultWithdrawals.length > 0) {
                this.info(
                    `Sẽ rút /pv 2 theo từng click SHK: ${this.run.plannedVaultWithdrawals
                        .map(item => `${item.name} x${item.amount}`)
                        .join(', ')}.`
                );
            }
            // Do not pull the whole planned list here. Each B3/B4/B5 click
            // prepares only the missing inputs immediately before that click.
            const withdrawn = Result.NO_ACTION;
            if (withdrawn !== Result.SUCCESS && withdrawn !== Result.NO_ACTION) {
                return this._fail(withdrawn, `Không thể rút nguyên liệu công đoạn SHK từ /pv 2: ${withdrawn}.`);
            }

            const stageAvailability = stagedPlan.rawRequirements.length > 0
                ? this.assessStorage(stagedPlan, this.run.settings)
                : availability;
            // Keep material availability aggregated, but execute in small
            // dependency batches. This turns 16 refined items into a block
            // before creating the next batch, instead of filling inventory
            // with every refined item required by the complete SHK tree.
            this.run.plan = {
                ...stagedPlan,
                actions: this.createInventorySafeActions(stagedPlan, this.run.settings)
            };
            this.run.preparedVaultActionKey = null;
            this.run.availability = stageAvailability;
            this._setState('CHECKING_STORAGE', {
                materials: stageAvailability.materials,
                storageCheckedAt: stageAvailability.checkedAt,
                deferredActions: stagedPlan.deferredActions || []
            });

            this.run.status = 'OPENING_GUI';
            this._setState(this.run.status);
            const deferred = stagedPlan.deferredActions?.length || 0;
            this.success(
                deferred > 0
                    ? `Tách chu kỳ SHK: chạy ${stagedPlan.totalActions} click khả dụng, hoãn ${deferred} công đoạn thiếu nguyên liệu.`
                    : `Đã kiểm tra /kho: ${this.describeAvailability(stageAvailability)}`
            );
            return Result.PENDING;
        }

        if (this.run.status === 'WAITING_PERSONAL_VAULT_COOLDOWN') {
            if (now < this.run.nextAt) return Result.PENDING;
            const resumeStatus = this.run.resumeStatus || 'OPENING_GUI';
            this.run.resumeStatus = null;
            this.run.status = resumeStatus;
            this._setState(resumeStatus);
            return Result.PENDING;
        }

        if (this.run.status === 'OPENING_GUI') {
            if (this._deferForPersonalVaultCooldown('OPENING_GUI', now)) return Result.PENDING;
            this.run.previousWindow = gui.window();
            const result = await this.service('chat').sendCommand(this.run.settings.command);
            if (result !== Result.SUCCESS) return this._fail(result, `Không gửi được ${this.run.settings.command}: ${result}.`);
            this.run.status = 'WAITING_GUI';
            // ChatService may wait six seconds after a previous GUI close
            // before it actually transmits /ks. The GUI timeout starts only
            // after sendCommand resolves, never from the earlier Engine tick.
            this.run.guiDeadline = Date.now() + this._bounded(this.run.settings.guiTimeoutMs, 1000, 15000, 5000);
            this._setState('WAITING_GUI');
            this.info(`Đang mở GUI chế tạo bằng ${this.run.settings.command}.`);
            return Result.PENDING;
        }

        if (this.run.status === 'WAITING_GUI') {
            const window = gui.window();
            if (window && window !== this.run.previousWindow) {
                const entrySlot = Number(this.run.settings.entrySlot);
                if (!Number.isInteger(entrySlot) || !window.slots?.[entrySlot]) {
                    return this._fail(Result.GUI_NOT_FOUND, `GUI ${this.run.settings.command} không có slot vào chế tạo ${this.run.settings.entrySlot}.`);
                }
                this.run.previousWindow = window;
                this.run.entryGuiUpdatedAt = this.state.gui.lastUpdate || 0;
                const result = await gui.click(entrySlot, Number(this.run.settings.entryButton) || 0, 0);
                if (result !== Result.SUCCESS) return this._fail(result, `Không click được slot ${entrySlot} để vào GUI chế tạo: ${result}.`);
                this.run.status = 'WAITING_CRAFTING_GUI';
                this.run.guiDeadline = Date.now() + this._bounded(this.run.settings.guiTimeoutMs, 1000, 15000, 5000);
                this._setState('WAITING_CRAFTING_GUI');
                this.info(`Đã click ${this.run.settings.command} > ${entrySlot}; đang chờ GUI chế tạo.`);
                return Result.PENDING;
            }
            if (now >= this.run.guiDeadline) {
                return this._fail(Result.GUI_TIMEOUT, `GUI ${this.run.settings.command} không mở sau ${this.run.settings.guiTimeoutMs} ms.`);
            }
            return Result.PENDING;
        }

        if (this.run.status === 'WAITING_CRAFTING_GUI') {
            const window = gui.window();
            const changed = window
                && (window !== this.run.previousWindow || (this.state.gui.lastUpdate || 0) > this.run.entryGuiUpdatedAt);
            if (changed) {
                this.run.openedWindow = window;
                this.run.status = 'CRAFTING';
                this.run.nextAt = now;
                this._setState('CRAFTING');
                this.info(`GUI chế tạo đã mở; kế hoạch có ${this.run.plan.totalActions} click.`);
                return Result.PENDING;
            }
            if (now >= this.run.guiDeadline) {
                return this._fail(Result.GUI_TIMEOUT, `GUI chế tạo không mở sau ${this.run.settings.guiTimeoutMs} ms kể từ ${this.run.settings.command} > ${this.run.settings.entrySlot}.`);
            }
            return Result.PENDING;
        }

        if (now < this.run.nextAt) return Result.PENDING;
        if (this.run.pendingClick) return this._confirmPendingClick(now);
        const action = this.run.plan.actions[this.run.actionIndex];
        if (!action) return this._completeOrPromoteB3();

        // Do not leave B1 expanded while unrelated recipe groups run. A B2
        // action gets a fresh, capacity-reserved raw preparation exactly once
        // before its first click. The marker is cleared when that group has
        // finished and its B1 remainder has been compressed again.
        if (this._recipeTier(action.slot, this.run.settings) === 2
            && this.run.preparedTier2ActionIndex !== this.run.actionIndex) {
            return this._prepareCurrentTier2Action(action);
        }

        // B3/B4/B5 inputs stored in /pv 2 are pulled in the exact amount for
        // this click only. The helper closes /ks and returns PENDING whenever
        // a vault transfer is needed, then the normal opener resumes safely.
        const vaultPreparation = await this._prepareVaultInputsForAction(action);
        if (vaultPreparation !== Result.NO_ACTION) return vaultPreparation;

        const window = gui.window();
        if (!window || !window.slots?.[action.slot]) {
            return this._fail(Result.GUI_NOT_FOUND, `GUI chế tạo không còn item ở slot ${action.slot} (${action.name}).`);
        }
        const shiftCraft = this._shouldUseShiftCraft(action);
        const bulkCraft = this._shouldUseBulkCraft(action);
        const usesShift = shiftCraft || bulkCraft;
        if (this.state.inventory.full && this._requiresFreeInventorySlot(action, usesShift)) {
            return this._restartForInventoryPressure(action);
        }
        if (bulkCraft && this._freeInventorySlots() < this._bulkCraftMinimumFreeSlots()) {
            return this._fail(
                Result.NO_FREE_SLOT,
                `Shift-craft bị chặn: cần ít nhất ${this._bulkCraftMinimumFreeSlots()} slot trống để không làm đầy inventory.`
            );
        }

        if (this.run.loggedActionIndex !== this.run.actionIndex
            && (this.run.completedActions === 0
                || this.run.completedActions - this.run.lastLoggedCompletedActions >= 512
                || action.slot === this.run.plan.targetSlot)) {
            this.run.loggedActionIndex = this.run.actionIndex;
            this.run.lastLoggedCompletedActions = this.run.completedActions;
            this.info(
                `Chế tạo ${action.name}: ${action.count} lần (slot ${action.slot}) `
                + `[${this.run.completedActions}/${this.run.plan.totalActions} click].`
            );
        }
        const pendingClick = {
            action,
            bulkCraft,
            shiftCraft,
            outputBefore: shiftCraft ? this._countMaterialInInventory(action.slot) : null,
            inventorySignature: this._inventorySignature(),
            guiUpdatedAt: this.state.gui.lastUpdate || 0,
            retryCount: this.run.actionRetryCount || 0,
            deadline: 0
        };
        const result = await gui.click(
            action.slot,
            usesShift ? this._bulkCraftMouseButton() : 0,
            usesShift ? this._bulkCraftMode() : 0
        );
        if (result !== Result.SUCCESS) return this._fail(result, `Không click được slot ${action.slot}: ${result}.`);
        // clickWindow is asynchronous too; do not consume its acknowledgement
        // window while the request itself is still queued by the protocol.
        pendingClick.deadline = Date.now() + this._bounded(this.run.settings.clickAckTimeoutMs, 500, 10000, 3000);
        this.run.pendingClick = pendingClick;
        return Result.PENDING;
    }

    /** @private */
    _rawRequirementsForAction(action) {
        const recipe = this.run?.settings?.recipes?.[Number(action?.slot)] || {};
        const remaining = Math.max(0, (Number(action?.count) || 0) - (Number(this.run?.actionProgress) || 0));
        const requirements = new Map();
        for (const input of recipe.inputs || []) {
            if (typeof input?.item !== 'string' || !input.item.trim()) continue;
            const amount = Number(input.amount);
            if (!Number.isFinite(amount) || amount <= 0 || remaining <= 0) continue;
            const item = input.item.trim();
            requirements.set(item, (requirements.get(item) || 0) + (amount * remaining));
        }
        return [...requirements.entries()].map(([item, amount]) => ({ item, amount }));
    }

    /** @private */
    _remainingTier2RawRequirements() {
        const requirements = new Map();
        const actions = this.run?.plan?.actions || [];
        for (let index = this.run?.actionIndex || 0; index < actions.length; index += 1) {
            const action = actions[index];
            if (this._recipeTier(action?.slot, this.run?.settings) !== 2) continue;
            const progress = index === this.run.actionIndex ? this.run.actionProgress : 0;
            const recipe = this.run.settings.recipes?.[Number(action.slot)] || {};
            const remaining = Math.max(0, (Number(action.count) || 0) - (Number(progress) || 0));
            for (const input of recipe.inputs || []) {
                if (typeof input?.item !== 'string' || !input.item.trim()) continue;
                const amount = Number(input.amount);
                if (!Number.isFinite(amount) || amount <= 0 || remaining <= 0) continue;
                const item = input.item.trim();
                requirements.set(item, (requirements.get(item) || 0) + (amount * remaining));
            }
        }
        return [...requirements.entries()].map(([item, amount]) => ({ item, amount }));
    }

    /**
     * Opens the B1 conversion flow only for the B2 group about to run. This
     * prevents one large SHK plan from expanding every stored block at once.
     * @private
     */
    async _prepareCurrentTier2Action(action) {
        const storage = this.service('storage');
        const conversion = this.service('materialConversion');
        const rawRequirements = this._rawRequirementsForAction(action);
        const unpackPlan = conversion?.getUnpackPlan?.(
            rawRequirements,
            this.run.settings.storageMaterialSlots
        );
        if (!unpackPlan || unpackPlan.targets.length === 0) {
            this.run.preparedTier2ActionIndex = this.run.actionIndex;
            return Result.PENDING;
        }

        const gui = this.service('gui');
        if (gui?.isOpen?.()) await gui.close();

        const protectedItems = this._remainingTier2RawRequirements();
        const reserved = await storage?.reserveCapacityForUnpack?.(
            rawRequirements,
            this.run.settings.storageMaterialSlots,
            { protectedItems }
        );
        if (reserved !== Result.SUCCESS) {
            return this._fail(
                reserved || Result.FAILED,
                `Không tách khối cho B2 ${action.name}: /kho không còn vùng đệm an toàn (${reserved || Result.FAILED}).`
            );
        }

        const unpacked = await storage?.prepareRawForCraft?.(
            rawRequirements,
            this.run.settings.storageMaterialSlots,
            { capacityReserved: true, protectedItems }
        );
        if (unpacked !== Result.SUCCESS && unpacked !== Result.NO_ACTION) {
            return this._fail(unpacked, `Không thể đổi khối về phôi cho B2 ${action.name}: ${unpacked}.`);
        }

        this.run.preparedTier2ActionIndex = this.run.actionIndex;
        if (unpacked === Result.SUCCESS) {
            // Every conversion closes its GUI. Go through the normal /ks
            // opener so ChatService enforces the post-GUI command cooldown.
            this.run.status = 'OPENING_GUI';
            this.run.nextAt = Date.now();
            this._setState('OPENING_GUI', {
                currentB2Preparation: { action: action.name, targets: unpackPlan.targets }
            });
            this.info(`Đã tách B1 cho ${action.name}: ${unpackPlan.targets.join(', ')}; mở lại /ks để craft đúng nhóm này.`);
        }
        return Result.PENDING;
    }

    /**
     * Compresses B1 immediately after a B2 group and forces the configured
     * capacity buffer/sell policy before any later raw group can run.
     * @private
     */
    async _repackAfterTier2Group(completeAfterPacking = false) {
        const gui = this.service('gui');
        if (gui?.isOpen?.()) await gui.close();

        this.run.status = 'PROTECTING_STORAGE';
        this._setState('PROTECTING_STORAGE');
        const protectedItems = this._remainingTier2RawRequirements();
        const result = await this.service('storage')?.repackAndProtectCapacity?.({ protectedItems });
        if (result !== Result.SUCCESS) {
            return this._fail(
                result || Result.FAILED,
                `Đã craft B2 nhưng không thể nén/bảo vệ /kho sau đó: ${result || Result.FAILED}.`
            );
        }

        this.run.preparedTier2ActionIndex = null;
        this.service('inventory')?.sync?.();
        if (completeAfterPacking) return this._completeOrPromoteB3();

        this.run.status = 'OPENING_GUI';
        this.run.nextAt = Date.now();
        this._setState('OPENING_GUI');
        this.info('Đã nén lại B1 và kiểm tra vùng đệm /kho; tiếp tục công đoạn SHK kế tiếp.');
        return Result.PENDING;
    }

    _shouldUseBulkCraft(action) {
        const bulk = this.run?.settings?.bulkCraft || {};
        if (bulk.enabled !== true || !action) return false;
        // A custom GUI's shift-click makes items until inventory is full. It
        // is never allowed for intermediate recipe nodes by default because
        // that would create large amounts of materials unexpectedly.
        if (bulk.finalTargetOnly !== false && action.slot !== this.run.plan.targetSlot) return false;
        return action.slot === this.run.plan.targetSlot && this.run.actionProgress === 0;
    }

    /**
     * Uses one server-side Shift+left batch for safe intermediate tiers. The
     * result is measured from the actual inventory and then fully re-planned;
     * this prevents a variable-size server batch from being mistaken for a
     * fixed number of ordinary recipe clicks.
     */
    _shouldUseShiftCraft(action) {
        const shift = this.run?.settings?.shiftCraft || {};
        if (shift.enabled !== true || !action || this.run.actionProgress !== 0) return false;
        const tier = this._recipeTier(action.slot, this.run.settings);
        if (tier === 2) return shift.tier2 !== false;
        if (tier === 3) return shift.tier3 !== false;
        if (tier !== 4) return false;

        // B4 recipes share several B3 components. An operator may opt in to
        // a specific slot only after proving that its inputs are isolated on
        // this server. Keeping the default empty is deliberately conservative.
        const allowedSlots = Array.isArray(shift.tier4Slots) ? shift.tier4Slots : [];
        return allowedSlots.map(Number).includes(Number(action.slot));
    }

    _recipeTier(slot, settings = this.settings(), visiting = new Set()) {
        const numericSlot = Number(slot);
        if (visiting.has(numericSlot)) return null;
        const recipe = settings.recipes?.[numericSlot];
        if (!recipe) return null;
        const next = new Set(visiting).add(numericSlot);
        const childTiers = (recipe.inputs || [])
            .filter(input => Number.isInteger(input.slot))
            .map(input => this._recipeTier(input.slot, settings, next))
            .filter(Number.isFinite);
        return childTiers.length ? Math.max(...childTiers) + 1 : 2;
    }

    _requiresFreeInventorySlot(action, usesShift) {
        if (usesShift) return false;
        // B3/B4/B5 consume inputs before inserting their output on MinerUA;
        // they remain safe at zero free slots. Only an ordinary raw -> B2
        // click needs a free slot. This is a guard, not a planning shortcut.
        return this._recipeTier(action.slot, this.run?.settings) === 2;
    }

    _countMaterialInInventory(slot) {
        const definition = this._materialDefinitions(this.run?.settings || this.settings()).get(Number(slot));
        if (!definition) return 0;
        const items = this.service('inventory')?.getItems?.() || this.state.inventory?.items || [];
        return items.reduce((total, item) => (
            this._matchMaterialDefinition(item, new Map([[definition.slot, definition]]))
                ? total + Math.max(0, Number(item?.count) || 0)
                : total
        ), 0);
    }

    _shiftCraftStableMs() {
        const value = Number(this.run?.settings?.shiftCraft?.stableMs);
        return Number.isFinite(value) ? Math.min(Math.max(value, 0), 5000) : 400;
    }

    _shiftCraftMaxReplans() {
        const value = Number(this.run?.settings?.shiftCraft?.maxReplans);
        return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 1), 100) : 24;
    }

    _inventoryPressureMaxReplans() {
        const value = Number(this.run?.settings?.inventoryPressureMaxReplans);
        return this._bounded(value, 0, 5, 2);
    }

    _freeInventorySlots() {
        return this.service('inventory')?.countEmptySlots?.() ?? this.state.inventory.emptySlots ?? 0;
    }

    _bulkCraftMinimumFreeSlots() {
        const value = Number(this.run?.settings?.bulkCraft?.minFreeSlots);
        return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 1), 36) : 18;
    }

    _bulkCraftMouseButton() {
        return Number(this.run?.settings?.bulkCraft?.mouseButton) === 1 ? 1 : 0;
    }

    _bulkCraftMode() {
        // Mineflayer mode 1 is Shift-click. Never permit config to downgrade
        // this to an ordinary click while bulkCraft is enabled.
        return 1;
    }

    _clickAckMaxRetries() {
        const value = Number(this.run?.settings?.clickAckMaxRetries);
        return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 0), 5) : 2;
    }

    _clickAckRetryDelayMs() {
        const value = Number(this.run?.settings?.clickAckRetryDelayMs);
        return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 0), 10000) : 1000;
    }

    /**
     * MinerUA applies the `/pv` cooldown to the next chat command too. Do not
     * await here: Engine ticks must remain responsive while the cooldown runs.
     */
    _deferForPersonalVaultCooldown(resumeStatus, now = Date.now()) {
        if (this.run?.settings?.personalVault?.enabled === false) return false;
        const personalVault = this.service('personalVault');
        const remainingMs = Number(personalVault?.commandCooldownRemainingMs?.());
        if (!Number.isFinite(remainingMs) || remainingMs <= 0) return false;

        this.run.resumeStatus = resumeStatus;
        this.run.nextAt = now + Math.ceil(remainingMs);
        this.run.status = 'WAITING_PERSONAL_VAULT_COOLDOWN';
        this._setState('WAITING_PERSONAL_VAULT_COOLDOWN', {
            nextCommandAt: this.run.nextAt,
            resumeStatus
        });
        this.info(`Chờ ${Math.ceil(remainingMs)} ms sau /pv 2 trước khi gửi lệnh GUI tiếp theo.`);
        return true;
    }

    isFinished() {
        return ['COMPLETED', 'FAILED', 'STOPPED'].includes(this.run?.status);
    }

    isActive() {
        return this.run?.active === true;
    }

    succeeded() {
        return this.run?.status === 'COMPLETED';
    }

    /** Returns whether the completed run deferred unavailable SHK branches. */
    wasPartial() {
        return this.succeeded() && this.run?.partial === true;
    }

    async stop() {
        if (!this.run) return Result.NO_ACTION;
        const wasActive = this.run.active;
        if (wasActive) {
            this.run.active = false;
            this.run.status = 'STOPPED';
            this._setState('STOPPED');
        }
        await this.service('gui').close();
        return wasActive ? Result.SUCCESS : Result.NO_ACTION;
    }

    describePlan(plan = this.run?.plan) {
        if (!plan) return 'Chưa có kế hoạch chế tạo.';
        const actions = plan.actions.map(action => `${action.name}=${action.count}`).join(', ');
        const raw = plan.rawRequirements.map(item => `${item.item}=${item.amount}`).join(', ');
        return `Kế hoạch ${plan.targetName} x${plan.targetCount}: ${plan.totalActions} click. Recipe: ${actions}. Nguyên liệu thô: ${raw || 'không có'}.`;
    }

    _complete() {
        this.run.active = false;
        this.run.status = 'COMPLETED';
        this._setState('COMPLETED');
        const suffix = this.run.partial
            ? `; còn ${this.run.plan.deferredActions?.length || 0} công đoạn sẽ thử lại khi đủ nguyên liệu.`
            : '';
        this.success(`Hoàn tất ${this.run.plan.targetName} x${this.run.plan.targetCount}: ${this.run.completedActions}/${this.run.plan.totalActions} click${suffix}`);
        return Result.SUCCESS;
    }

    /**
     * After a real final-target click, compact any carried B2 surplus into
     * B3.  This is intentionally post-target only: before B5, a B2 stack can
     * still be a dependency of another B3 branch.  At this point the planned
     * tree is exhausted, so every full B2 recipe is safe to promote and frees
     * inventory slots for the next collector cycle.
     *
     * @private
     */
    _completeOrPromoteB3() {
        if (this._appendPostTargetB3Promotions()) {
            this.run.nextAt = Date.now() + this._bounded(this.run.settings.clickIntervalMs, 100, 5000, 500);
            this._setState('CRAFTING', { postTargetB3Promotion: true });
            return Result.PENDING;
        }
        return this._complete();
    }

    /** @private */
    _appendPostTargetB3Promotions() {
        if (!this.run?.settings || this.run.postTargetB3PromotionChecked) return false;
        this.run.postTargetB3PromotionChecked = true;
        if ((Number(this.run.createdTargetCount) || 0) <= 0) return false;

        const promotions = [];
        for (const [rawSlot, recipe] of Object.entries(this.run.settings.recipes || {})) {
            const slot = Number(rawSlot);
            if (!Number.isInteger(slot) || this._recipeTier(slot, this.run.settings) !== 3) continue;
            const inputs = Array.isArray(recipe?.inputs) ? recipe.inputs : [];
            if (inputs.length === 0 || inputs.some(input => !Number.isInteger(input?.slot))) continue;

            let craftable = Infinity;
            for (const input of inputs) {
                const required = Math.max(0, Math.floor(Number(input.amount) || 0));
                if (required <= 0) {
                    craftable = 0;
                    break;
                }
                craftable = Math.min(craftable, Math.floor(this._countMaterialInInventory(input.slot) / required));
            }
            if (!Number.isFinite(craftable) || craftable <= 0) continue;
            promotions.push({
                slot,
                itemKey: this._recipeItemKey(slot, this.run.settings),
                name: recipe.name || `Slot ${slot}`,
                count: craftable
            });
        }

        if (promotions.length === 0) return false;
        const total = promotions.reduce((sum, action) => sum + action.count, 0);
        this.run.plan.actions.push(...promotions);
        this.run.plan.totalActions += total;
        this.run.postTargetB3PromotionCount = total;
        this.info(`Đã tạo SHK; nén tiếp B2 dư thành B3: ${promotions.map(action => `${action.name} x${action.count}`).join(', ')}.`);
        return true;
    }

    async _confirmPendingClick(now) {
        const pending = this.run.pendingClick;

        // MinerUA custom recipes can mutate the player inventory without
        // emitting windowUpdate or a GUI slot update.  Do not depend solely
        // on those events: refresh the authoritative Mineflayer inventory
        // snapshot before deciding that a click was ignored.  This also
        // includes hotbar slots, which are a common destination for a recipe
        // result when the main inventory is crowded.
        this.service('inventory')?.sync?.();

        const inventoryChanged = this._inventorySignature() !== pending.inventorySignature;
        const guiChanged = (this.state.gui.lastUpdate || 0) > pending.guiUpdatedAt;
        const outputAfter = pending.shiftCraft
            ? this._countMaterialInInventory(pending.action.slot)
            : null;
        const outputIncreased = pending.shiftCraft && outputAfter > pending.outputBefore;
        const acknowledged = pending.shiftCraft
            ? outputIncreased
            : inventoryChanged || guiChanged;

        if (!acknowledged) {
            if (now >= pending.deadline) {
                const nextRetry = (pending.retryCount || 0) + 1;
                const maxRetries = this._clickAckMaxRetries();
                if (!pending.bulkCraft && !pending.shiftCraft && nextRetry <= maxRetries) {
                    this.run.pendingClick = null;
                    this.run.actionRetryCount = nextRetry;
                    this.run.nextAt = Date.now() + this._clickAckRetryDelayMs();
                    this.warn(
                        `Không thấy inventory/GUI cập nhật sau ${pending.action.name} ở slot ${pending.action.slot}; `
                        + `thử click lại (${nextRetry}/${maxRetries}).`
                    );
                    return Result.PENDING;
                }
                const attempts = (pending.retryCount || 0) + 1;
                return this._fail(
                    Result.FAILED,
                    pending.shiftCraft
                        ? `Shift-craft ${pending.action.name} ở slot ${pending.action.slot} không làm tăng ${pending.action.itemKey || 'output'}; không lặp click để tránh craft dư.`
                        : `Không thấy inventory/GUI cập nhật sau khi craft ${pending.action.name} ở slot ${pending.action.slot} sau ${attempts} lần click.`
                );
            }
            return Result.PENDING;
        }

        if (pending.shiftCraft) {
            // A single window update is not enough: the server can still be
            // moving stacks. Wait until the named output no longer changes.
            if (pending.outputAfter !== outputAfter) {
                pending.outputAfter = outputAfter;
                pending.stableSince = now;
                return Result.PENDING;
            }
            if (now < (pending.stableSince || now) + this._shiftCraftStableMs()) {
                return Result.PENDING;
            }

            const crafted = Math.max(0, outputAfter - pending.outputBefore);
            if (crafted <= 0) {
                return this._fail(
                    Result.FAILED,
                    `Shift-craft ${pending.action.name} đã có phản hồi nhưng không xác minh được output tăng.`
                );
            }
            this.run.pendingClick = null;
            this.run.actionRetryCount = 0;
            return this._restartAfterShiftCraft(pending.action, crafted);
        }

        this.run.pendingClick = null;
        this.run.actionRetryCount = 0;
        if (pending.bulkCraft) {
            // Legacy final-target bulk crafting is still opt-in. It has no
            // deterministic output size, so it completes this explicit run.
            this.run.actionIndex = this.run.plan.actions.length;
            this.run.actionProgress = 0;
            this.run.completedActions = this.run.plan.totalActions;
            return this._complete();
        }
        this.run.actionProgress += 1;
        this.run.completedActions += 1;
        if (pending.action.slot === this.run.plan.targetSlot) {
            this.run.createdTargetCount = (this.run.createdTargetCount || 0) + 1;
        }
        const completedTier2Group = this.run.actionProgress >= pending.action.count
            && this._recipeTier(pending.action.slot, this.run.settings) === 2;
        if (this.run.actionProgress >= pending.action.count) {
            this.run.actionIndex += 1;
            this.run.actionProgress = 0;
        }
        if (completedTier2Group) {
            const completeAfterPacking = this.run.completedActions === this.run.plan.totalActions
                || !this.run.plan.actions[this.run.actionIndex];
            return this._repackAfterTier2Group(completeAfterPacking);
        }
        this.run.nextAt = now + this._bounded(this.run.settings.clickIntervalMs, 100, 5000, 1000);
        this._setState('CRAFTING');
        if (this.run.completedActions === this.run.plan.totalActions || !this.run.plan.actions[this.run.actionIndex]) {
            return this._completeOrPromoteB3();
        }
        return Result.PENDING;
    }

    /**
     * Inventory can already contain a useful B2/B3 surplus from an earlier
     * partial craft. Before rejecting the next B2 click, rebuild the ledger
     * from that real inventory so B3/B4 actions using the surplus are emitted
     * first. This is deliberately bounded: an unrecognised custom item must
     * eventually fail safely and be handed to Collector's `/pv 2` recovery.
     *
     * @private
     */
    async _restartForInventoryPressure(action) {
        this.run.inventoryPressureReplanCount = (this.run.inventoryPressureReplanCount || 0) + 1;
        const maxReplans = this._inventoryPressureMaxReplans();
        if (this.run.inventoryPressureReplanCount > maxReplans) {
            return this._fail(
                Result.INVENTORY_FULL,
                `Inventory vẫn đầy sau ${maxReplans} lần tính lại để dùng B2/B3 có sẵn; `
                + 'dừng lượt craft để cất các bán thành phẩm vào /pv 2.'
            );
        }

        this.info(
            `Inventory đầy trước B2 ${action.name}; tính lại lần ${this.run.inventoryPressureReplanCount}/${maxReplans} `
            + 'để ưu tiên dùng B2/B3 hiện có lên tier cao hơn.'
        );
        const gui = this.service('gui');
        if (gui?.isOpen?.()) await gui.close();
        this.service('inventory')?.sync?.();

        this.run.personalVaultChecked = false;
        this.run.preparedTier2ActionIndex = null;
        this.run.preparedVaultActionKey = null;
        this.run.status = 'CHECKING_STORAGE';
        this.run.actionIndex = 0;
        this.run.actionProgress = 0;
        this.run.completedActions = 0;
        this.run.nextAt = 0;
        this._setState('CHECKING_STORAGE', {
            inventoryPressureReplanCount: this.run.inventoryPressureReplanCount,
            inventoryPressureAction: { slot: action.slot, name: action.name }
        });
        return Result.PENDING;
    }

    /** Re-scan all dynamic containers after a variable-size Shift craft. */
    async _restartAfterShiftCraft(action, crafted) {
        this.run.shiftReplanCount = (this.run.shiftReplanCount || 0) + 1;
        if (this.run.shiftReplanCount > this._shiftCraftMaxReplans()) {
            return this._fail(
                Result.FAILED,
                `Đã re-plan ${this.run.shiftReplanCount - 1} batch Shift mà chưa hoàn tất; dừng để tránh vòng lặp vô hạn.`
            );
        }

        this.run.shiftHistory.push({
            itemKey: action.itemKey || this._recipeItemKey(action.slot, this.run.settings),
            slot: action.slot,
            crafted,
            at: Date.now()
        });
        this.info(
            `Shift-craft ${action.name} (${action.itemKey || `slot ${action.slot}`}) tăng ${crafted}; `
            + 'đóng GUI và tính lại inventory + /pv 2 + /kho.'
        );

        const gui = this.service('gui');
        if (gui?.isOpen?.()) await gui.close();
        this.service('inventory')?.sync?.();
        this.run.personalVaultChecked = false;
        this.run.preparedVaultActionKey = null;
        this.run.status = 'CHECKING_STORAGE';
        this.run.actionIndex = 0;
        this.run.actionProgress = 0;
        this.run.completedActions = 0;
        this.run.nextAt = 0;
        this._setState('CHECKING_STORAGE', {
            lastShiftCraft: this.run.shiftHistory.at(-1),
            shiftReplanCount: this.run.shiftReplanCount
        });
        return Result.PENDING;
    }

    _fail(result, message) {
        if (this.run) {
            this.run.active = false;
            this.run.status = 'FAILED';
            this.run.error = message;
        }
        this._setState('FAILED', { error: message });
        this.error(message);
        return result;
    }

    _setState(status, extra = {}) {
        const state = this.state.crafting || (this.state.crafting = {});
        const run = this.run;
        Object.assign(state, {
            active: Boolean(run?.active),
            status,
            targetName: run?.plan?.targetName || null,
            targetItemKey: run?.plan?.targetItemKey || null,
            targetCount: run?.plan?.targetCount || 0,
            completedActions: run?.completedActions || 0,
            totalActions: run?.plan?.totalActions || 0,
            currentSlot: run?.plan?.actions[run?.actionIndex]?.slot ?? null,
            clickRetryCount: run?.actionRetryCount || 0,
            materials: run?.availability?.materials || [],
            storageCheckedAt: run?.availability?.checkedAt || null,
            existingItems: run?.plan?.existingItems || [],
            personalVaultCheckedAt: this.state.personalVault?.updatedAt || null,
            personalVaultWithdrawals: run?.actualVaultWithdrawals || [],
            plannedVaultWithdrawals: run?.plannedVaultWithdrawals || [],
            partial: Boolean(run?.partial),
            deferredActions: run?.plan?.deferredActions || [],
            shiftReplanCount: run?.shiftReplanCount || 0,
            inventoryPressureReplanCount: run?.inventoryPressureReplanCount || 0,
            lastShiftCraft: run?.shiftHistory?.at(-1) || null,
            updatedAt: Date.now(),
            ...extra
        });
    }

    _setLedger(ledger) {
        const state = this.state.crafting || (this.state.crafting = {});
        state.materialLedger = ledger;
        state.ledgerUpdatedAt = ledger?.updatedAt || Date.now();
    }

    _bounded(value, min, max, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
    }

    _inventorySignature() {
        const items = this.service('inventory')?.getItems?.() || this.state.inventory.items || [];
        return items
            .map(item => `${item.slot ?? ''}:${item.type ?? item.name}:${item.count ?? 0}`)
            .sort()
            .join('|');
    }

    async destroy() {
        await this.stop();
        await super.destroy();
        return Result.SUCCESS;
    }
}

module.exports = CraftingService;
module.exports.DEFAULT_RECIPES = DEFAULT_RECIPES;
