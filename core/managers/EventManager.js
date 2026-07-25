'use strict';

const { EventEmitter } = require('events');

const BaseManager = require('../base/BaseManager');
const Result = require('../constants/Result');

/**
 * ============================================================================
 * EventManager
 * ============================================================================
 *
 * Event Bus nội bộ của Framework.
 *
 * Quy tắc:
 * - Không xử lý nghiệp vụ.
 * - Không biết Mineflayer.
 * - Không biết Discord.
 * - Chỉ publish / subscribe Framework Events.
 *
 * ============================================================================
 */
class EventManager extends BaseManager {

    /**
     * @param {Context} ctx
     */
    constructor(ctx) {
        super(ctx);

        this.name = 'EventManager';

        /**
         * Internal Event Bus.
         *
         * @private
         * @type {EventEmitter}
         */
        this._bus = new EventEmitter();

        /**
         * Cho phép nhiều listener mà không bị warning.
         * Có thể chỉnh qua config nếu muốn.
         */
        this._bus.setMaxListeners(100);
    }

    /**
     * Khởi tạo.
     *
     * @returns {Promise<String>}
     */
    async initialize() {
        await super.initialize();
        return Result.SUCCESS;
    }

    /**
     * Giải phóng tài nguyên.
     *
     * @returns {Promise<String>}
     */
    async destroy() {
        this._bus.removeAllListeners();
        await super.destroy();

        return Result.SUCCESS;
    }

    /**
     * Đăng ký listener.
     *
     * @param {String} event
     * @param {Function} listener
     * @returns {EventManager}
     */
    on(event, listener) {
        this._bus.on(event, listener);
        return this;
    }

    /**
     * Đăng ký listener chạy một lần.
     *
     * @param {String} event
     * @param {Function} listener
     * @returns {EventManager}
     */
    once(event, listener) {
        this._bus.once(event, listener);
        return this;
    }

    /**
     * Hủy listener.
     *
     * @param {String} event
     * @param {Function} listener
     * @returns {EventManager}
     */
    off(event, listener) {
        this._bus.off(event, listener);
        return this;
    }

    /**
     * Alias của off().
     *
     * @param {String} event
     * @param {Function} listener
     * @returns {EventManager}
     */
    removeListener(event, listener) {
        this._bus.removeListener(event, listener);
        return this;
    }

    /**
     * Phát Event.
     *
     * @param {String} event
     * @param {...*} args
     * @returns {Boolean}
     */
    emit(event, ...args) {
        this.debug('Emit:', event);
        return this._bus.emit(event, ...args);
    }

    /**
     * Đếm listener.
     *
     * @param {String} event
     * @returns {Number}
     */
    listenerCount(event) {
        return this._bus.listenerCount(event);
    }

    /**
     * Danh sách event đã đăng ký.
     *
     * @returns {Array<String|Symbol>}
     */
    eventNames() {
        return this._bus.eventNames();
    }

    /**
     * Xóa toàn bộ listener của một event.
     *
     * @param {String} event
     * @returns {EventManager}
     */
    removeAllListeners(event) {
        this._bus.removeAllListeners(event);
        return this;
    }

    /**
     * Chờ một event xảy ra.
     *
     * @param {String} event
     * @param {Number} timeout
     * @returns {Promise<Array>}
     */
    waitFor(event, timeout = 10000) {
        return new Promise((resolve, reject) => {
            let timer;

            const handler = (...args) => {
                clearTimeout(timer);
                resolve(args);
            };

            this._bus.once(event, handler);

            timer = setTimeout(() => {
                this._bus.removeListener(event, handler);
                
                const TimeoutError =
                require('../errors/TimeoutError');

                reject(
                    new TimeoutError(
                        Event,
                        timeout
                    )
                );
            }, timeout);
        });
    }
}

module.exports = EventManager;