'use strict';

const Result = require('../constants/Result');

/**
 * ============================================================================
 * BaseListener
 * ============================================================================
 *
 * Base class của toàn bộ Listener.
 *
 * Quy tắc:
 * - Không xử lý nghiệp vụ.
 * - Không gọi Mode.
 * - Không gọi Workflow.
 * - Chỉ cập nhật Runtime hoặc emit Event.
 * ============================================================================
 */
class BaseListener {

    /**
     * @param {Context} ctx
     */
    constructor(ctx) {
        if (!ctx) {
            throw new Error('BaseListener requires Context.');
        }

        /**
         * Dependency Injection Container.
         *
         * @protected
         */
        this.ctx = ctx;

        /**
         * Mineflayer Bot.
         *
         * @protected
         */
        this.bot = ctx.bot;

        /**
         * Runtime Wrapper.
         *
         * @protected
         */
        this.runtime = ctx.runtime;

        /**
         * Runtime State Shortcut.
         *
         * @protected
         */
        this.state = ctx.runtime.state;

        /**
         * Config.
         *
         * @protected
         */
        this.config = ctx.config;

        /**
         * Logger.
         *
         * @protected
         */
        this.logger = ctx.logger;

        /**
         * EventManager.
         *
         * @protected
         */
        this.events = ctx.getManager('events');

        /**
         * Listener Name.
         *
         * @type {String}
         */
        this.name = this.constructor.name;

        /**
         * Đã đăng ký hay chưa.
         *
         * @type {Boolean}
         */
        this.registered = false;

        /**
         * Danh sách listener đã bind.
         *
         * Dùng để unregister an toàn.
         *
         * @private
         * @type {Array}
         */
        this._bindings = [];
    }

    /**
     * Đăng ký listener.
     *
     * Class con override.
     *
     * @returns {Promise<String>}
     */
    async register() {
        this.registered = true;
        return Result.SUCCESS;
    }

    /**
     * Hủy đăng ký listener.
     *
     * Tự động remove tất cả event đã bind.
     *
     * @returns {Promise<String>}
     */
    async unregister() {
        for (const binding of this._bindings) {
            binding.emitter.removeListener(binding.event, binding.handler);
        }

        this._bindings.length = 0;
        this.registered = false;

        return Result.SUCCESS;
    }

    /**
     * Bind event và tự lưu để unregister.
     *
     * @protected
     *
     * @param {EventEmitter} emitter
     * @param {String} event
     * @param {Function} handler
     */
    bind(emitter, event, handler) {
        emitter.on(event, handler);

        this._bindings.push({
            emitter,
            event,
            handler
        });
    }

    /**
     * Emit Framework Event.
     *
     * @protected
     *
     * @param {String} event
     * @param {...*} args
     */
    emit(event, ...args) {
        if (this.events && typeof this.events.emit === 'function') {
            this.events.emit(event, ...args);
        }
    }

    /**
     * Lấy Service.
     *
     * Chỉ dùng khi thực sự cần đọc dữ liệu.
     * Không dùng để xử lý workflow.
     *
     * @protected
     */
    service(name) {
        return this.ctx.getService(name);
    }

    /**
     * Debug Log.
     *
     * @protected
     */
    debug(...args) {
        if (this.logger?.debug) {
            this.logger.debug(`[${this.name}]`, ...args);
        }
    }

    /**
     * Info Log.
     *
     * @protected
     */
    info(...args) {
        if (this.logger?.info) {
            this.logger.info(`[${this.name}]`, ...args);
        }
    }

    /**
     * Success Log.
     *
     * @protected
     */
    success(...args) {
        if (this.logger?.success) {
            this.logger.success(`[${this.name}]`, ...args);
        }
    }

    /**
     * Warning Log.
     *
     * @protected
     */
    warn(...args) {
        if (this.logger?.warn) {
            this.logger.warn(`[${this.name}]`, ...args);
        }
    }

    /**
     * Error Log.
     *
     * @protected
     */
    error(...args) {
        if (this.logger?.error) {
            this.logger.error(`[${this.name}]`, ...args);
        }
    }
}

module.exports = BaseListener;