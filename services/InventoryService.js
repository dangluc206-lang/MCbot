'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');

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

        this.bindEvents();

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
     * @returns {String}
     */
    sync() {

        if (!this.bot?.inventory) {
            return Result.FAILED;
        }


        const items =
            this.bot.inventory.items();


        this.state.inventory.items =
            items.map(item => ({
                name: item.name,
                type: item.type,
                count: item.count,
                slot: item.slot
            }));


        this.state.inventory.emptySlots =
            this.countEmptySlots();


        this.state.inventory.full =
            this.state.inventory.emptySlots <= 0;


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


        return this.bot.inventory.slots
            .filter(slot => !slot)
            .length;

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