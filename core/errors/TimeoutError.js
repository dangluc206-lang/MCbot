'use strict';

const BotError = require('./BotError');

/**
 * ============================================================================
 * TimeoutError
 * ============================================================================
 *
 * Lỗi phát sinh khi một thao tác vượt quá thời gian chờ.
 *
 * Đây là Recoverable Error.
 *
 * ============================================================================
 */
class TimeoutError extends BotError {

    /**
     * @param {String} operation
     * @param {Number} timeout
     * @param {Object} [data]
     */
    constructor(operation, timeout, data = {}) {
        super(
            `${operation} timed out after ${timeout} ms.`,
            {
                code: 'TIMEOUT',
                recoverable: true,
                data: {
                    operation,
                    timeout,
                    ...data
                }
            }
        );

        /**
         * Tên thao tác.
         *
         * @type {String}
         */
        this.operation = operation;

        /**
         * Timeout (ms).
         *
         * @type {Number}
         */
        this.timeout = timeout;
    }

    /**
     * Chuyển Error thành Object.
     *
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            operation: this.operation,
            timeout: this.timeout
        };
    }
}

module.exports = TimeoutError;