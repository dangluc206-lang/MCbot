'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const States = require('../core/constants/States');

/**
 * ============================================================================
 * CollectorService
 * ============================================================================
 *
 * Quản lý trạng thái thu thập item.
 *
 * Trách nhiệm:
 * - Theo dõi quá trình collect.
 * - Cập nhật Runtime Collector.
 * - Phát Event khi thu thập.
 *
 * Không:
 * - Quyết định mục tiêu farm.
 * - Điều khiển Mode Collector.
 * - Tự di chuyển.
 *
 * ============================================================================
 */
class CollectorService extends BaseService {

    constructor(ctx) {
        super(ctx);

        this.name = 'CollectorService';

        this.events = ctx.getManager('events');

        this.inventory =
            ctx.getService('inventory');

        this.movement =
            ctx.getService('movement');

        this.running = false;
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
     * Bind Event.
     */
    bindEvents() {

        if (!this.events) {
            return;
        }


        this.bind(
            this.events,
            Events.Inventory.FULL,
            () => {

                this.state.collector.state =
                    States.Collector.INVENTORY_FULL;


                this.emit(
                    Events.Collector.INVENTORY_FULL
                );

            }
        );

        if (this.bot) {
            this.bind(this.bot, 'playerCollect', (collector, item) => {
                if (collector !== this.bot.entity) {
                    return;
                }

                this.collect(item);
            });
        }

    }


    /**
     * Start Collector runtime.
     *
     * @returns {String}
     */
    start() {

        if (this.running) {

            return Result.MODE_ALREADY_RUNNING;

        }


        this.running = true;
        this.state.collector.paused = false;
        this.state.collector.running = true;

        this.state.collector.state =
            States.Collector.COLLECTING;


        this.emit(
            Events.Collector.START
        );


        return Result.SUCCESS;

    }


    /**
     * Stop Collector runtime.
     *
     * @returns {String}
     */
    stop() {

        if (!this.running) {

            return Result.MODE_NOT_RUNNING;

        }


        this.running = false;
        this.state.collector.paused = false;
        this.state.collector.running = false;

        this.state.collector.state =
            States.Collector.STOPPED;


        this.emit(
            Events.Collector.STOP
        );


        return Result.SUCCESS;

    }


    /**
     * Pause.
     *
     * @returns {String}
     */
    pause() {

        if (!this.running) {

            return Result.MODE_NOT_RUNNING;

        }


        this.state.collector.paused = true;

        this.state.collector.state =
            States.Collector.PAUSED;


        this.emit(
            Events.Collector.PAUSE
        );


        return Result.SUCCESS;

    }


    /**
     * Resume.
     *
     * @returns {String}
     */
    resume() {

        if (!this.running) {

            return Result.MODE_NOT_RUNNING;

        }


        this.state.collector.paused = false;

        this.state.collector.state =
            States.Collector.COLLECTING;


        this.emit(
            Events.Collector.RESUME
        );


        return Result.SUCCESS;

    }


    /**
     * Ghi nhận item đã collect.
     *
     * @param {Object} item
     *
     * @returns {String}
     */
    collect(item) {

        if (!item) {

            return Result.ITEM_NOT_FOUND;

        }


        this.state.collector.collected++;


        this.state.collector.lastCollectAt =
            Date.now();


        this.state.metrics.collectedItems++;


        this.emit(
            Events.Collector.ITEM_COLLECTED,
            item
        );


        return Result.SUCCESS;

    }


    /**
     * Tick kiểm tra trạng thái.
     *
     * @returns {String}
     */
    tick() {

        if (!this.running) {

            return Result.NO_ACTION;

        }


        if (this.state.collector.paused) {

            return Result.NO_ACTION;

        }


        if (
            this.inventory &&
            this.inventory.isFull()
        ) {

            this.state.collector.state =
                States.Collector.INVENTORY_FULL;


            return Result.INVENTORY_FULL;

        }


        return Result.SUCCESS;

    }


    /**
     * Trạng thái.
     *
     * @returns {Object}
     */
    status() {

        return this.state.collector;

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


module.exports = CollectorService;
