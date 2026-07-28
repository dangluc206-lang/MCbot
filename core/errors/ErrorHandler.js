'use strict';

const BotError = require('./BotError');
const Events = require('../constants/Events');

/**
 * ============================================================================
 * ErrorHandler
 * ============================================================================
 *
 * Trung tâm xử lý Exception của Framework.
 *
 * Trách nhiệm:
 * - Chuẩn hóa Error.
 * - Ghi log.
 * - Cập nhật Runtime.
 * - Emit Event.
 *
 * Không thực hiện:
 * - Recovery.
 * - Reconnect.
 * - Restart Mode.
 * - Retry.
 *
 * ============================================================================
 */
class ErrorHandler {

    /**
     * @param {Context} ctx
     */
    constructor(ctx) {
        if (!ctx) {
            throw new Error('ErrorHandler requires Context.');
        }

        this.ctx = ctx;
        this.logger = ctx.logger;
        this.runtime = ctx.runtime;
        this.state = ctx.runtime.state;
        this.events = ctx.getManager('events');
    }

    /**
     * Chuẩn hóa Error.
     *
     * @param {*} error
     * @returns {BotError}
     */
    normalize(error) {
        if (error instanceof BotError) {
            return error;
        }

        if (error instanceof Error) {
            return new BotError(error.message, {
                code: error.code || error.name || 'UNEXPECTED_ERROR',
                recoverable: false,
                cause: error
            });
        }

        return new BotError(String(error), {
            code: 'UNKNOWN_ERROR',
            recoverable: false,
            data: {
                value: error
            }
        });
    }

    /**
     * Xử lý Error.
     *
     * @param {*} error
     * @param {Object} [context]
     * @returns {BotError}
     */
    handle(error, context = {}) {
        const botError = this.normalize(error);

        // Cập nhật Runtime để phục vụ debug/metrics
        this.state.engine.lastError = {
            name: botError.name,
            message: botError.message,
            code: botError.code,
            recoverable: botError.recoverable,
            timestamp: botError.timestamp,
            context
        };

        // Ghi log
        if (this.logger?.error) {
            const message = `[${botError.code}] ${botError.message}`;
            if (this.ctx.config.logging?.includeStack) {
                this.logger.error(message, { context, stack: botError.stack });
            }
            else {
                this.logger.error(message);
            }
        }

        // Phát sự kiện nội bộ
        if (this.events?.emit) {
            this.events.emit(
                Events.Engine.ERROR,
                botError,
                context
            );
        }

        return botError;
    }
}

module.exports = ErrorHandler;
