'use strict';

const BaseService = require('../base/BaseService');
const Result = require('../constants/Result');
const Events = require('../constants/Events');
const States = require('../constants/States');

/**
 * ============================================================================
 * StorageService
 * ============================================================================
 *
 * Quản lý thao tác Storage / Sell.
 *
 * Trách nhiệm:
 * - Quản lý trạng thái bán.
 * - Chuẩn bị inventory cho workflow bán.
 * - Gọi command bán.
 * - Đồng bộ Storage Runtime.
 *
 * Không:
 * - Điều khiển Collector.
 * - Quyết định khi nào bán.
 * - Điều khiển Mode.
 *
 * ============================================================================
 */
class StorageService extends BaseService {

    constructor(ctx) {
        super(ctx);

        this.name = 'StorageService';

        this.events = ctx.getManager('events');

        this.inventory =
            ctx.getService('inventory');

        this.gui =
            ctx.getService('gui');

        this.movement =
            ctx.getService('movement');
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
     * Kiểm tra đang bán.
     *
     * @returns {Boolean}
     */
    isSelling() {

        return this.state.storage.selling;

    }


    /**
     * Bắt đầu bán inventory.
     *
     * @returns {Promise<String>}
     */
    async sellInventory() {

        if (!this.bot) {
            return Result.FAILED;
        }


        if (this.isSelling()) {

            return Result.BUSY;

        }


        this.state.storage.selling = true;


        this.emit(
            Events.Storage.SELL_INVENTORY
        );


        try {

            this.bot.chat(
                this.state.storage.sellCommand
            );


            this.state.storage.lastSell =
                Date.now();


            this.state.metrics.sells++;


            return Result.SUCCESS;

        }
        catch (error) {

            this.error(error);

            return Result.FAILED;

        }
        finally {

            this.state.storage.selling = false;

        }

    }


    /**
     * Bán storage.
     *
     * Hiện tại chỉ là API nền.
     *
     * Workflow GUI sẽ bổ sung sau.
     *
     * @returns {Promise<String>}
     */
    async sellStorage() {

        if (!this.bot) {

            return Result.FAILED;

        }


        this.emit(
            Events.Storage.SELL_STORAGE
        );


        return Result.SUCCESS;

    }
    async sellAll() {

        await this.sellInventory();

        await this.sellStorage();

        return Result.SUCCESS;

    }

    /**
     * Kiểm tra có item cần bán.
     *
     * @returns {Boolean}
     */
    hasItems() {

        if (!this.inventory) {

            return false;

        }


        return !this.inventory.isEmpty();

    }


    /**
     * Đặt danh sách ore cần bán.
     *
     * @param {Array} ores
     *
     * @returns {String}
     */
    setSelectedOres(ores = []) {

        this.state.storage.selectedOres =
            ores;


        return Result.SUCCESS;

    }


    /**
     * Lấy danh sách ore.
     *
     * @returns {Array}
     */
    getSelectedOres() {

        return this.state.storage.selectedOres;

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

        await super.destroy();

        return Result.SUCCESS;

    }

}


module.exports = StorageService;