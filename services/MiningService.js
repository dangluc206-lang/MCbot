'use strict';

const BaseService = require('../base/BaseService');
const Result = require('../constants/Result');
const Events = require('../constants/Events');
const States = require('../constants/States');

/**
 * ============================================================================
 * MiningService
 * ============================================================================
 *
 * Quản lý thao tác Mining.
 *
 * Trách nhiệm:
 * - Theo dõi trạng thái mining.
 * - Equip/Unequip tool.
 * - Điều khiển đào block cơ bản.
 * - Đồng bộ Mining Runtime.
 *
 * Không:
 * - Quyết định khu vực mine.
 * - Chọn quặng.
 * - Điều khiển Mode Mining.
 *
 * ============================================================================
 */
class MiningService extends BaseService {

    constructor(ctx) {
        super(ctx);

        this.name = 'MiningService';

        this.events = ctx.getManager('events');

        this.mining = false;

        this.currentBlock = null;
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
     * Bind Mineflayer events.
     */
    bindEvents() {

        if (!this.bot) {
            return;
        }


        this.bot.on('diggingCompleted', block => {

            this.currentBlock = null;


            this.state.mining.state =
                States.Mining.IDLE;


            this.emit(
                Events.Mining.ORE_CHANGE,
                block
            );

        });

    }


    /**
     * Equip tool.
     *
     * @param {*} item
     *
     * @returns {Promise<String>}
     */
    async equip(item) {

        if (!this.bot) {

            return Result.FAILED;

        }


        try {

            if (item) {

                await this.bot.equip(
                    item,
                    'hand'
                );

                this.state.mining.holding =
                    item.name;

            }


            this.emit(
                Events.Mining.EQUIP,
                item
            );


            return Result.SUCCESS;

        }
        catch (error) {

            this.error(error);

            return Result.FAILED;

        }

    }


    /**
     * Unequip tool.
     *
     * @returns {Promise<String>}
     */
    async unequip() {

        if (!this.bot) {

            return Result.FAILED;

        }


        try {

            this.state.mining.holding = null;


            this.emit(
                Events.Mining.UNEQUIP
            );


            return Result.SUCCESS;

        }
        catch (error) {

            this.error(error);

            return Result.FAILED;

        }

    }


    /**
     * Bắt đầu đào block.
     *
     * @param {*} block
     *
     * @returns {Promise<String>}
     */
    async dig(block) {

        if (!this.bot) {

            return Result.FAILED;

        }


        if (!block) {

            return Result.ITEM_NOT_FOUND;

        }


        try {

            this.currentBlock = block;

            this.mining = true;


            this.state.mining.state =
                States.Mining.MINING;


            await this.bot.dig(
                block
            );


            return Result.SUCCESS;

        }
        catch (error) {

            this.error(error);

            return Result.FAILED;

        }

    }


    /**
     * Dừng mining.
     *
     * @returns {String}
     */
    stop() {

        this.mining = false;

        this.currentBlock = null;


        this.state.mining.state =
            States.Mining.STOPPED;


        this.emit(
            Events.Mining.STOP
        );


        return Result.SUCCESS;

    }


    /**
     * Kiểm tra đang đào.
     *
     * @returns {Boolean}
     */
    isMining() {

        return this.mining;

    }


    /**
     * Lấy block hiện tại.
     *
     * @returns {*}
     */
    getCurrentBlock() {

        return this.currentBlock;

    }


    /**
     * Emit Event.
     */
    emit(event, ...args) {

        if (this.events?.emit) {

            this.events.emit(
                event,
                ...args
            );

        }

    }


    /**
     * Destroy.
     *
     * @returns {Promise<String>}
     */
    async destroy() {

        this.stop();

        await super.destroy();

        return Result.SUCCESS;

    }

}


module.exports = MiningService;