'use strict';

const Result = require('../constants/Result');

/**
 * ============================================================================
 * BaseManager
 * ============================================================================
 *
 * Base class của toàn bộ Manager.
 *
 * Trách nhiệm:
 * - Quản lý hạ tầng Framework.
 * - Không chứa nghiệp vụ.
 * - Không thao tác trực tiếp Mineflayer nếu không cần thiết.
 *
 * ============================================================================
 */
class BaseManager {

    /**
     * @param {Context} ctx
     */
    constructor(ctx) {
        if (!ctx) {
            throw new Error('BaseManager requires Context.');
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
         * Framework Config.
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
         * Tên Manager.
         *
         * @type {String}
         */
        this.name = this.constructor.name;

        /**
         * Đã khởi tạo.
         *
         * @protected
         * @type {Boolean}
         */
        this.initialized = false;
    }

    /**
     * Lifecycle.
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
     * @returns {Promise<String>}
     */
    async destroy() {
        this.initialized = false;
        return Result.SUCCESS;
    }

    /**
     * Kiểm tra đã initialize.
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
     * @protected
     * @param {String} name
     * @returns {*}
     */
    mode(name) {
        return this.ctx.getMode(name);
    }

    /**
     * Ghi log Debug.
     *
     * @protected
     */
    debug(...args) {
        if (this.logger?.debug) {
            this.logger.debug(`[${this.name}]`, ...args);
        }
    }

    /**
     * Ghi log Info.
     *
     * @protected
     */
    info(...args) {
        if (this.logger?.info) {
            this.logger.info(`[${this.name}]`, ...args);
        }
    }

    /**
     * Ghi log Success.
     *
     * @protected
     */
    success(...args) {
        if (this.logger?.success) {
            this.logger.success(`[${this.name}]`, ...args);
        }
    }

    /**
     * Ghi log Warning.
     *
     * @protected
     */
    warn(...args) {
        if (this.logger?.warn) {
            this.logger.warn(`[${this.name}]`, ...args);
        }
    }

    /**
     * Ghi log Error.
     *
     * @protected
     */
    error(...args) {
        if (this.logger?.error) {
            this.logger.error(`[${this.name}]`, ...args);
        }
    }
}

module.exports = BaseManager;