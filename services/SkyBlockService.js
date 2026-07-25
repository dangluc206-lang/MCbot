'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const TimeoutError = require('../core/errors/TimeoutError');

/**
 * ============================================================================
 * SkyBlockService
 * ============================================================================
 *
 * Quản lý trạng thái SkyBlock.
 *
 * Trách nhiệm:
 * - Theo dõi login Hypixel.
 * - Kiểm tra đã vào SkyBlock chưa.
 * - Gửi lệnh join.
 * - Đồng bộ Runtime SkyBlock.
 *
 * Không:
 * - Chứa workflow Mode.
 * - Tự Recovery.
 * - Điều khiển Engine.
 *
 * ============================================================================
 */
class SkyBlockService extends BaseService {

    constructor(ctx) {
        super(ctx);

        this.name = 'SkyBlockService';

        this.events = ctx.getManager('events');

        this.scheduler = ctx.getManager('scheduler');

        this.loginTimeout = 15000;
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
     * Bind Bot Events.
     */
    bindEvents() {

        if (!this.bot) {
            return;
        }


        this.bot.on('login', () => {

            this.state.skyblock.loggedIn = true;

            this.state.skyblock.lastLogin =
                Date.now();


            this.emit(
                Events.SkyBlock.LOGIN
            );

        });


        this.bot.on('message', message => {

            const text =
                message.toString();


            this.detectSkyBlock(text);

        });

    }


    /**
     * Detect SkyBlock message.
     *
     * @param {String} message
     */
    detectSkyBlock(message) {

        if (!message) {
            return;
        }


        const lower =
            message.toLowerCase();


        /**
         * Hypixel SkyBlock join message.
         */
        if (
            lower.includes('skyblock')
        ) {

            if (!this.state.skyblock.joined) {

                this.state.skyblock.joined = true;


                this.emit(
                    Events.SkyBlock.JOINED
                );

            }

        }

    }


    /**
     * Kiểm tra đã login.
     *
     * @returns {Boolean}
     */
    isLoggedIn() {

        return this.state.skyblock.loggedIn;

    }


    /**
     * Kiểm tra đang trong SkyBlock.
     *
     * @returns {Boolean}
     */
    isJoined() {

        return this.state.skyblock.joined;

    }


    /**
     * Join SkyBlock.
     *
     * @returns {Promise<String>}
     */
    async join() {

        if (!this.bot) {
            return Result.FAILED;
        }


        if (this.isJoined()) {

            return Result.ALREADY_DONE;

        }


        try {

            this.emit(
                Events.SkyBlock.JOIN
            );


            this.bot.chat(
                '/skyblock'
            );


            return Result.SUCCESS;

        }
        catch (error) {

            this.error(error);

            return Result.FAILED;

        }

    }


    /**
     * Đảm bảo Bot đã vào SkyBlock.
     *
     * Dùng bởi RecoveryManager.
     *
     * @returns {Promise<String>}
     */
    async ensureJoined() {

        if (this.isJoined()) {

            return Result.ALREADY_DONE;

        }


        if (!this.isLoggedIn()) {

            return Result.NOT_LOGGED_IN;

        }


        return this.join();

    }


    /**
     * Chờ SkyBlock join.
     *
     * @param {Number} timeout
     *
     * @returns {Promise<String>}
     */
    async waitJoined(timeout = this.loginTimeout) {

        if (this.isJoined()) {

            return Result.SUCCESS;

        }


        return new Promise((resolve, reject) => {

            const handler = () => {

                clearTimeout(timer);

                resolve(
                    Result.SUCCESS
                );

            };


            this.events.once(
                Events.SkyBlock.JOINED,
                handler
            );


            const timer = setTimeout(() => {

                this.events.off(
                    Events.SkyBlock.JOINED,
                    handler
                );


                reject(
                    new TimeoutError(
                        'SkyBlock join',
                        timeout
                    )
                );


            }, timeout);

        });

    }


    /**
     * Rời SkyBlock.
     *
     * @returns {String}
     */
    leave() {

        this.state.skyblock.joined = false;


        this.emit(
            Events.SkyBlock.LEAVE
        );


        return Result.SUCCESS;

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
     */
    async destroy() {

        await super.destroy();

        return Result.SUCCESS;

    }

}


module.exports = SkyBlockService;