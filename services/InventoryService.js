'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const { itemLabels } = require('../utils/ItemLabels');

/**
 * ============================================================================
 * InventoryService
 * ============================================================================
 *
 * Quản lý Inventory Runtime.
 *
 * Trách nhiệm:
 * - Đồng bộ inventory từ Mineflayer.
 * - Theo dõi item.
 * - Kiểm tra đầy/trống.
 * - Cung cấp API đọc inventory.
 *
 * Không:
 * - Tự bán item.
 * - Tự mở GUI.
 * - Điều phối Mode.
 *
 * ============================================================================
 */
class InventoryService extends BaseService {

    constructor(ctx) {
        super(ctx);

        this.name = 'InventoryService';

        this.events = ctx.getManager('events');
    }


    /**
     * Initialize.
     *
     * @returns {Promise<String>}
     */
    async initialize() {

        await super.initialize();

        return Result.SUCCESS;

    }


    /**
     * Bind Mineflayer Inventory Event.
     */
    bindEvents() {

        if (!this.bot) {
            return;
        }


        this.bot.on('windowUpdate', () => {

            this.sync();

        });


        this.bot.on('heldItemChanged', () => {

            this.sync();

        });


        this.bot.on('spawn', () => {

            this.sync();

        });

    }


    /**
     * Đồng bộ inventory.
     *
     * @param {{emit?: Boolean}} [options]
     * @returns {String}
     */
    sync(options = {}) {

        if (!this.bot?.inventory) {
            return Result.FAILED;
        }


        const items = this.snapshotItems();


        this.state.inventory.items =
            items.map(item => {
                const labels = itemLabels(item);
                return {
                name: item.name,
                displayName: labels[0] || item.displayName || item.name,
                labels,
                type: item.type,
                count: item.count,
                slot: item.slot,
                durabilityUsed: item.durabilityUsed ?? null,
                maxDurability: item.maxDurability ?? null
                };
            });


        this.state.inventory.emptySlots =
            this.countEmptySlots();


        this.state.inventory.full =
            this.state.inventory.emptySlots <= 0;


        // Crafting sometimes needs to poll Mineflayer's inventory because a
        // custom server recipe changed it without emitting windowUpdate.  The
        // state must still refresh, but broadcasting an inventory event for
        // every acknowledgement poll would flood listeners and Discord.
        if (options.emit !== false) {
            this.emit(
                Events.Inventory.UPDATE,
                this.state.inventory
            );


            if (this.state.inventory.full) {

                this.emit(
                    Events.Inventory.FULL
                );

            }


            if (this.state.inventory.items.length === 0) {

                this.emit(
                    Events.Inventory.EMPTY
                );

            }
        }


        return Result.SUCCESS;

    }


    /**
     * Đếm slot trống.
     *
     * @returns {Number}
     */
    countEmptySlots() {

        if (!this.bot?.inventory?.slots) {
            return 0;
        }


        // Array#filter skips sparse slots. Mineflayer normally supplies a
        // dense array, but treating holes as empty keeps both hotbar and test
        // snapshots accurate.
        // Mineflayer uses 9..35 for the main bag and 36..44 for the hotbar.
        // Armour, crafting-grid, cursor, and off-hand slots must not make the
        // craft safety gate believe it has more than 36 usable slots.
        const slots = this.bot.inventory.slots;
        let emptySlots = 0;
        for (let slot = 9; slot <= 44 && slot < slots.length; slot += 1) {
            if (!slots[slot]) emptySlots += 1;
        }
        return emptySlots;

    }


    /**
     * Lấy toàn bộ item.
     *
     * @returns {Array}
     */
    getItems() {

        return this.state.inventory.items;

    }


    /**
     * Tìm item theo tên.
     *
     * @param {String} name
     * @returns {Array}
     */
    find(name) {

        return this.state.inventory.items
            .filter(item => item.name === name);

    }


    /**
     * Đếm số lượng item.
     *
     * @param {String} name
     * @returns {Number}
     */
    count(name) {

        return this.find(name)
            .reduce(
                (total, item) => total + item.count,
                0
            );

    }


    /**
     * Kiểm tra có item.
     *
     * @param {String} name
     * @param {Number} amount
     *
     * @returns {Boolean}
     */
    has(name, amount = 1) {

        return this.count(name) >= amount;

    }


    /**
     * Inventory đầy.
     *
     * @returns {Boolean}
     */
    isFull() {

        return this.state.inventory.full;

    }


    /**
     * Inventory trống.
     *
     * @returns {Boolean}
     */
    isEmpty() {

        return this.state.inventory.items.length === 0;

    }


    /**
     * Lấy item đang cầm.
     *
     * @returns {*}
     */
    heldItem() {

        if (!this.bot?.heldItem) {
            return null;
        }


        return {
            name: this.bot.heldItem.name,
            count: this.bot.heldItem.count
        };

    }


    /**
     * Returns every player-carried item exactly once. Mineflayer normally
     * includes the hotbar in inventory.items(), but some server-driven window
     * updates only expose it through inventory.slots.  Crafting must see both
     * sources immediately after a /pv transfer.
     *
     * @returns {Array}
     */
    snapshotItems() {

        if (!this.bot?.inventory) return [];

        const bySlot = new Map();
        const withoutSlot = [];
        const add = (item, fallbackSlot = null) => {
            if (!item) return;
            const slot = Number.isInteger(item.slot) ? item.slot : fallbackSlot;
            const normalized = Number.isInteger(slot) ? { ...item, slot } : item;
            if (Number.isInteger(slot)) {
                bySlot.set(slot, normalized);
            } else {
                withoutSlot.push(normalized);
            }
        };

        for (const item of this.bot.inventory.items?.() || []) add(item);

        // Vanilla player inventory uses 9-35 for the main bag and 36-44 for
        // the taskbar/hotbar. Do not include armour, crafting-grid, cursor,
        // or the off-hand slot in material totals.
        const slots = this.bot.inventory.slots || [];
        for (let slot = 9; slot <= 44 && slot < slots.length; slot += 1) {
            add(slots[slot], slot);
        }

        return [...bySlot.values(), ...withoutSlot];

    }

    itemAt(slot) {
        if (!Number.isInteger(slot) || slot < 0) return null;
        return this.bot?.inventory?.slots?.[slot] || null;
    }

    async use(slot) {
        const item = this.itemAt(slot);
        if (!item || !this.bot?.activateItem) return Result.ITEM_NOT_FOUND;
        await this.bot.equip(item, 'hand');
        this.bot.activateItem();
        return Result.SUCCESS;
    }

    async equip(slot, destination) {
        const valid = new Set(['hand', 'off-hand', 'head', 'torso', 'legs', 'feet']);
        const item = this.itemAt(slot);
        if (!valid.has(destination) || !item || !this.bot?.equip) return Result.ITEM_NOT_FOUND;
        await this.bot.equip(item, destination);
        return Result.SUCCESS;
    }

    async drop(slot, amount = 1) {
        const item = this.itemAt(slot);
        const count = Number(amount);
        if (!item || !Number.isInteger(count) || count < 1 || count > item.count || !this.bot?.toss) return Result.ITEM_NOT_FOUND;
        await this.bot.toss(item.type, item.metadata ?? null, count);
        return Result.SUCCESS;
    }

    async swap(from, to) {
        if (!this.itemAt(from) || !Number.isInteger(to) || to < 0 || !this.bot?.clickWindow) return Result.ITEM_NOT_FOUND;
        await this.bot.clickWindow(from, 0, 0);
        await this.bot.clickWindow(to, 0, 0);
        await this.bot.clickWindow(from, 0, 0);
        return Result.SUCCESS;
    }


    /**
     * Emit Framework Event.
     */
    emit(event, ...args) {

        if (this.events?.emit) {
            this.events.emit(event, ...args);
        }

    }


    /**
     * Destroy.
     *
     * @returns {Promise<String>}
     */
    async destroy() {

        await super.destroy();

        return Result.SUCCESS;

    }

}


module.exports = InventoryService;
