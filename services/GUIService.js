'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const TimeoutError = require('../core/errors/TimeoutError');

/**
 * ============================================================================
 * GUIService
 * ============================================================================
 *
 * Quản lý Minecraft GUI / Window.
 *
 * Trách nhiệm:
 * - Theo dõi GUI đang mở.
 * - Chờ GUI mở/đóng.
 * - Click slot.
 * - Đồng bộ GUI Runtime.
 *
 * Không:
 * - Biết Storage workflow.
 * - Biết Collector workflow.
 * - Tự điều phối Mode.
 *
 * ============================================================================
 */
class GUIService extends BaseService {

    constructor(ctx) {
        super(ctx);

        this.name = 'GUIService';

        this.events = ctx.getManager('events');

        this.scheduler = ctx.getManager('scheduler');

        /**
         * Window đang chờ.
         *
         * @private
         */
        this.waiting = null;
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
     * Bind Mineflayer GUI events.
     */
    bindEvents() {

        if (!this.bot) {
            return;
        }


        this.bot.on('windowOpen', window => {

            this.sync(window);


            this.emit(
                Events.GUI.OPEN,
                window
            );

        });


        this.bot.on('windowClose', () => {

            this.clear();


            this.emit(
                Events.GUI.CLOSE
            );

        });

    }


    /**
     * Đồng bộ GUI Runtime.
     *
     * @param {*} window
     *
     * @returns {String}
     */
    sync(window) {

        if (!window) {
            return Result.FAILED;
        }


        this.state.gui.opened = true;

        this.state.gui.window = window;


        this.state.gui.title =
            window.title || null;


        this.state.gui.slots =
            window.slots || [];


        this.emit(
            Events.GUI.UPDATE,
            this.state.gui
        );


        return Result.SUCCESS;

    }


    /**
     * Xóa GUI Runtime.
     *
     * @returns {String}
     */
    clear() {

        this.state.gui.opened = false;

        this.state.gui.title = null;

        this.state.gui.window = null;

        this.state.gui.slots = [];


        return Result.SUCCESS;

    }


    /**
     * Kiểm tra GUI mở.
     *
     * @returns {Boolean}
     */
    isOpen() {

        return this.state.gui.opened;

    }


    /**
     * Lấy title GUI.
     *
     * @returns {String|null}
     */
    title() {

        return this.state.gui.title;

    }


    /**
     * Lấy window.
     *
     * @returns {*}
     */
    window() {

        return this.state.gui.window;

    }


    /**
     * Chờ GUI mở.
     *
     * @param {Number} timeout
     *
     * @returns {Promise<*>}
     */
    async waitOpen(timeout = 10000) {

        if (this.isOpen()) {
            return this.window();
        }


        return new Promise((resolve, reject) => {

            let timer;


            const handler = window => {

                clearTimeout(timer);

                resolve(window);

            };


            this.events.once(
                Events.GUI.OPEN,
                handler
            );


            timer = setTimeout(() => {

                this.events.off(
                    Events.GUI.OPEN,
                    handler
                );


                reject(
                    new TimeoutError(
                        'GUI open',
                        timeout
                    )
                );


            }, timeout);


        });

    }


    /**
     * Đóng GUI.
     *
     * @returns {Promise<String>}
     */
    async close() {

        if (!this.bot) {
            return Result.FAILED;
        }


        if (!this.isOpen()) {
            return Result.ALREADY_DONE;
        }


        // Mineflayer requires the concrete window object; gọi không có đối số
        // sẽ làm nó truy cập `undefined.id`.
        this.bot.closeWindow(this.window());


        return Result.SUCCESS;

    }


    /**
     * Click slot GUI.
     *
     * @param {Number} slot
     *
     * @returns {Promise<String>}
     */
    async click(slot, mouseButton = 0, mode = 0) {

        const window = this.window();


        if (!window) {
            return Result.GUI_NOT_FOUND;
        }


        try {

            await this.bot.clickWindow(
                slot,
                mouseButton,
                mode
            );


            this.emit(
                Events.GUI.CLICK,
                slot
            );


            return Result.SUCCESS;

        }
        catch (error) {

            this.error(error);

            return Result.GUI_CLICK_FAILED;

        }

    }


    /**
     * Lấy item trong slot.
     *
     * @param {Number} slot
     *
     * @returns {*}
     */
    getSlot(slot) {

        if (!this.state.gui.slots) {
            return null;
        }


        return this.state.gui.slots[slot] || null;

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

        this.clear();

        await super.destroy();

        return Result.SUCCESS;

    }

}


module.exports = GUIService;
