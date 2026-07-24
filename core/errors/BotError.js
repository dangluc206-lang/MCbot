'use strict';

/**
 * ============================================================================
 * BotError
 * ============================================================================
 *
 * Base Error của toàn bộ Framework.
 *
 * Tất cả Error tùy chỉnh phải kế thừa từ class này.
 *
 * ============================================================================
 */
class BotError extends Error {

    /**
     * @param {String} message
     * @param {Object} [options]
     * @param {String} [options.code]
     * @param {Boolean} [options.recoverable]
     * @param {*} [options.cause]
     * @param {Object} [options.data]
     */
    constructor(message, options = {}) {
        super(message);

        Error.captureStackTrace?.(this, this.constructor);

        /**
         * Tên Error.
         *
         * @type {String}
         */
        this.name = this.constructor.name;

        /**
         * Mã lỗi.
         *
         * Ví dụ:
         * CONNECTION_TIMEOUT
         * GUI_TIMEOUT
         * PLAYER_DEAD
         *
         * @type {String}
         */
        this.code = options.code || 'UNKNOWN_ERROR';

        /**
         * Có thể Recovery hay không.
         *
         * @type {Boolean}
         */
        this.recoverable = options.recoverable ?? false;

        /**
         * Error gốc.
         *
         * @type {*}
         */
        this.cause = options.cause || null;

        /**
         * Dữ liệu bổ sung.
         *
         * @type {Object}
         */
        this.data = options.data || {};

        /**
         * Thời điểm phát sinh.
         *
         * @type {Date}
         */
        this.timestamp = new Date();
    }

    /**
     * Chuyển Error thành Object.
     *
     * @returns {Object}
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            recoverable: this.recoverable,
            data: this.data,
            timestamp: this.timestamp,
            stack: 
            process.env.NODE_ENV === 'development'
                ? this.stack
                : undefined
        };
    }

    /**
     * Chuỗi mô tả Error.
     *
     * @returns {String}
     */
    toString() {
        return `[${this.code}] ${this.message}`;
    }
}

module.exports = BotError;