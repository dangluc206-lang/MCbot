'use strict';

const Result = require('../constants/Result');

/**
 * ============================================================================
 * BaseService
 * ============================================================================
 *
 * Base class của toàn bộ Service.
 *
 * Quy tắc:
 * - Không chứa nghiệp vụ.
 * - Không import Service khác.
 * - Không thao tác trực tiếp với Mode.
 * - Không thao tác trực tiếp với Engine.
 *
 * ============================================================================
 */
class BaseService {

    /**
     * @param {Context} ctx
     */
    constructor(ctx) {
        if (!ctx) {
            throw new Error('BaseService requires Context.');
        }

        /**
         * Dependency Injection Container
         * @protected
         */
        this.ctx = ctx;

        /**
         * Mineflayer Bot
         * @protected
         */
        this.bot = ctx.bot;

        /**
         * Runtime Wrapper
         * @protected
         */
        this.runtime = ctx.runtime;

        /**
         * Runtime State Shortcut
         * @protected
         */
        this.state = ctx.runtime.state;

        /**
         * Config
         * @protected
         */
        this.config = ctx.config;

        /**
         * Logger
         * @protected
         */
        this.logger = ctx.logger;

        /**
         * Tên Service.
         * Class con nên override.
         *
         * @protected
         */
        this.name = this.constructor.name;

        /**
         * Đã khởi tạo hay chưa.
         *
         * @protected
         */
        this.initialized = false;
    }

    /**
     * Lifecycle.
     *
     * Khởi tạo tài nguyên của Service.
     *
     * @returns {Promise<String>}
     */
    async initialize() {
        this.initialized = true;
        return Result.SUCCESS;
    }

    /**
     * Lifecycle.
     *
     * Giải phóng tài nguyên.
     *
     * @returns {Promise<String>}
     */
    async destroy() {
        this.initialized = false;
        return Result.SUCCESS;
    }

    /**
     * Kiểm tra Service đã khởi tạo.
     *
     * @returns {Boolean}
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Lấy Manager.
     *
     * @protected
     * @param {String} name
     * @returns {*}
     */
    manager(name) {
        return this.ctx.getManager(name);
    }

    /**
     * Lấy Service.
     *
     * Chỉ dùng khi thật sự cần.
     * Không tạo circular dependency.
     *
     * @protected
     * @param {String} name
     * @returns {*}
     */
    service(name) {
        return this.ctx.getService(name);
    }

    /**
     * Lấy Mode.
     *
     * Chỉ dành cho trường hợp đặc biệt.
     * Không dùng để điều phối workflow.
     *
     * @protected
     * @param {String} name
     * @returns {*}
     */
    mode(name) {
        return this.ctx.getMode(name);
    }

    /**
     * Shortcut Runtime State.
     *
     * @protected
     * @returns {Object}
     */
    get runtimeState() {
        return this.state;
    }

    /**
     * Ghi log debug.
     *
     * @protected
     * @param {...*} args
     */
    debug(...args) {
        if (this.logger && typeof this.logger.debug === 'function') {
            this.logger.debug(`[${this.name}]`, ...args);
        }
    }

    /**
     * Ghi log info.
     *
     * @protected
     * @param {...*} args
     */
    info(...args) {
        if (this.logger && typeof this.logger.info === 'function') {
            this.logger.info(`[${this.name}]`, ...args);
        }
    }

    /**
     * Ghi log thành công.
     *
     * @protected
     * @param {...*} args
     */
    success(...args) {
        if (this.logger && typeof this.logger.success === 'function') {
            this.logger.success(`[${this.name}]`, ...args);
        }
    }

    /**
     * Ghi log cảnh báo.
     *
     * @protected
     * @param {...*} args
     */
    warn(...args) {
        if (this.logger && typeof this.logger.warn === 'function') {
            this.logger.warn(`[${this.name}]`, ...args);
        }
    }

    /**
     * Ghi log lỗi.
     *
     * @protected
     * @param {...*} args
     */
    error(...args) {
        if (this.logger && typeof this.logger.error === 'function') {
            this.logger.error(`[${this.name}]`, ...args);
        }
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

        const events = this.ctx.getManager('events');

        if (events && typeof events.emit === 'function') {
            events.emit(event, ...args);
        }
    }
}

module.exports = BaseService;