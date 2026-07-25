'use strict';

const States = require('../constants/States');
const Result = require('../constants/Result');

/**
 * ============================================================================
 * BaseMode
 * ============================================================================
 *
 * Base class của toàn bộ Mode.
 *
 * Quy tắc:
 * - Mode chứa Workflow.
 * - Không thao tác Mineflayer trực tiếp nếu đã có Service.
 * - Không import Mode khác.
 * - Chỉ sử dụng Service thông qua Context.
 *
 * ============================================================================
 */
class BaseMode {

    /**
     * @param {Context} ctx
     */
    constructor(ctx) {
        if (!ctx) {
            throw new Error('BaseMode requires Context.');
        }

        this.ctx = ctx;
        this.bot = ctx.bot;
        this.runtime = ctx.runtime;
        this.state = ctx.runtime.state;
        this.config = ctx.config;
        this.logger = ctx.logger;

        /**
         * Tên Mode.
         * Class con nên override.
         *
         * @type {String}
         */
        this.name = this.constructor.name;

        /**
         * Trạng thái Mode.
         *
         * @type {String}
         */
        this.modeState = States.Mode.IDLE;

        /**
         * Đang chạy.
         *
         * @type {Boolean}
         */
        this.running = false;

        /**
         * Đang pause.
         *
         * @type {Boolean}
         */
        this.paused = false;
        this.needRequested = false;
        this.recoveryReason = null;

        /**
         * Thời điểm start.
         *
         * @type {Date|null}
         */
        this.startedAt = null;
    }

    /**
     * Bắt đầu Mode.
     *
     * Class con có thể override nhưng nên gọi super.start().
     *
     * @returns {Promise<String>}
     */
    async start() {
        if (this.running) {
            return Result.MODE_ALREADY_RUNNING;
        }

        this.running = true;
        this.paused = false;
        this.startedAt = new Date();

        this.modeState = States.Mode.RUNNING;

        this.state.mode.current = this.name;
        this.state.mode.state = this.modeState;

        this.info('Started.');

        return Result.SUCCESS;
    }

    /**
     * Dừng Mode.
     *
     * @returns {Promise<String>}
     */
    async stop() {
        if (!this.running) {
            return Result.MODE_NOT_RUNNING;
        }

        this.running = false;
        this.paused = false;

        this.modeState = States.Mode.STOPPED;

        this.state.mode.state = this.modeState;

        this.info('Stopped.');

        return Result.SUCCESS;
    }

    /**
     * Pause Mode.
     *
     * @returns {Promise<String>}
     */
    async pause() {
        if (!this.running) {
            return Result.MODE_NOT_RUNNING;
        }

        this.paused = true;
        this.modeState = States.Mode.PAUSED;

        this.state.mode.state = this.modeState;

        this.info('Paused.');

        return Result.SUCCESS;
    }

    /**
     * Resume Mode.
     *
     * @returns {Promise<String>}
     */
    async resume() {
        if (!this.running) {
            return Result.MODE_NOT_RUNNING;
        }

        this.paused = false;
        this.modeState = States.Mode.RUNNING;

        this.state.mode.state = this.modeState;

        this.info('Resumed.');

        return Result.SUCCESS;
    }

    /**
     * Engine gọi liên tục.
     *
     * Mode con override.
     *
     * @returns {Promise<String>}
     */
    async tick() {
        return Result.SUCCESS;
    }

    /**
     * Recovery entry point.
     *
     * Mỗi Mode phải tự định nghĩa.
     *
     * @returns {Promise<String>}
     */
    async recover() {
        return Result.SUCCESS;
    }

    /**
     * Có đang chạy không.
     *
     * @returns {Boolean}
     */
    isRunning() {
        return this.running;
    }

    /**
     * Có đang pause không.
     *
     * @returns {Boolean}
     */
    isPaused() {
        return this.paused;
    }

    /**
     * Lấy Manager.
     *
     * @protected
     */
    manager(name) {
        return this.ctx.getManager(name);
    }

    /**
     * Lấy Service.
     *
     * @protected
     */
    service(name) {
        return this.ctx.getService(name);
    }

    /**
     * Debug log.
     *
     * @protected
     */
    debug(...args) {
        if (this.logger?.debug) {
            this.logger.debug(`[${this.name}]`, ...args);
        }
    }

    /**
     * Info log.
     *
     * @protected
     */
    info(...args) {
        if (this.logger?.info) {
            this.logger.info(`[${this.name}]`, ...args);
        }
    }

    /**
     * Success log.
     *
     * @protected
     */
    success(...args) {
        if (this.logger?.success) {
            this.logger.success(`[${this.name}]`, ...args);
        }
    }

    /**
     * Warning log.
     *
     * @protected
     */
    warn(...args) {
        if (this.logger?.warn) {
            this.logger.warn(`[${this.name}]`, ...args);
        }
    }

    /**
     * Error log.
     *
     * @protected
     */
    error(...args) {
        if (this.logger?.error) {
            this.logger.error(`[${this.name}]`, ...args);
        }
    }
    requestRecovery(reason) {
        this.needRecovery = true;
        this.recoveryReason = reason;
    }

    clearRecovery() {
        this.needRecovery = false;
        this.recoveryReason = null;
    }
    
    isRecoveryRequired() {
        return this.needRecovery;
    }
}

module.exports = BaseMode;