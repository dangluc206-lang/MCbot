'use strict';

/**
 * ============================================================================
 * Context
 * ============================================================================
 *
 * Dependency Injection Container.
 *
 * Quy tắc:
 * - Không chứa nghiệp vụ.
 * - Không import Service/Manager cụ thể.
 * - Chỉ quản lý dependency.
 * - Chỉ có duy nhất một Context trong toàn bộ Framework.
 *
 * ============================================================================
 */

class Context {

    constructor() {
        /**
         * Mineflayer Bot
         * @type {*}
         */
        this.bot = null;

        /**
         * Framework Config
         * @type {Object|null}
         */
        this.config = null;

        /**
         * Runtime
         * @type {Object|null}
         */
        this.runtime = null;

        /**
         * LoggerManager
         * @type {*}
         */
        this.logger = null;

        /**
         * ==========================
         * Managers
         * ==========================
         */
        this.managers = Object.create(null);

        /**
         * ==========================
         * Services
         * ==========================
         */
        this.services = Object.create(null);

        /**
         * ==========================
         * Modes
         * ==========================
         */
        this.modes = Object.create(null);

        /**
         * ==========================
         * Watchdogs
         * ==========================
         */
        this.watchdogs = Object.create(null);
    }

    /**
     * Đăng ký Bot.
     *
     * @param {*} bot
     * @returns {Context}
     */
    setBot(bot) {
        this.bot = bot;
        return this;
    }

    /**
     * Đăng ký Config.
     *
     * @param {Object} config
     * @returns {Context}
     */
    setConfig(config) {
        this.config = config;
        return this;
    }

    /**
     * Đăng ký Runtime.
     *
     * @param {*} runtime
     * @returns {Context}
     */
    setRuntime(runtime) {
        this.runtime = runtime;
        return this;
    }

    /**
     * Đăng ký Logger.
     *
     * @param {*} logger
     * @returns {Context}
     */
    setLogger(logger) {
        this.logger = logger;
        return this;
    }

    /**
     * Đăng ký Manager.
     *
     * @param {String} name
     * @param {*} manager
     * @returns {Context}
     */
    registerManager(name, manager) {
        this.managers[name] = manager;
        return this;
    }

    /**
     * Lấy Manager.
     *
     * @param {String} name
     * @returns {*}
     */
    getManager(name) {
        return this.managers[name] || null;
    }

    /**
     * Đăng ký Service.
     *
     * @param {String} name
     * @param {*} service
     * @returns {Context}
     */
    registerService(name, service) {
        this.services[name] = service;

        /**
         * Shortcut
         *
         * ctx.movement
         * ctx.storage
         * ctx.player
         */
        this[name] = service;

        return this;
    }

    /**
     * Lấy Service.
     *
     * @param {String} name
     * @returns {*}
     */
    getService(name) {
        return this.services[name] || null;
    }

    /**
     * Đăng ký Mode.
     *
     * @param {String} name
     * @param {*} mode
     * @returns {Context}
     */
    registerMode(name, mode) {
        this.modes[name] = mode;
        return this;
    }

    /**
     * Lấy Mode.
     *
     * @param {String} name
     * @returns {*}
     */
    getMode(name) {
        return this.modes[name] || null;
    }

    /**
     * Đăng ký Watchdog.
     *
     * @param {String} name
     * @param {*} watchdog
     * @returns {Context}
     */
    registerWatchdog(name, watchdog) {
        this.watchdogs[name] = watchdog;
        return this;
    }

    /**
     * Lấy Watchdog.
     *
     * @param {String} name
     * @returns {*}
     */
    getWatchdog(name) {
        return this.watchdogs[name] || null;
    }

    /**
     * Kiểm tra Service tồn tại.
     *
     * @param {String} name
     * @returns {Boolean}
     */
    hasService(name) {
        return Object.prototype.hasOwnProperty.call(this.services, name);
    }

    /**
     * Kiểm tra Manager tồn tại.
     *
     * @param {String} name
     * @returns {Boolean}
     */
    hasManager(name) {
        return Object.prototype.hasOwnProperty.call(this.managers, name);
    }

    /**
     * Kiểm tra Mode tồn tại.
     *
     * @param {String} name
     * @returns {Boolean}
     */
    hasMode(name) {
        return Object.prototype.hasOwnProperty.call(this.modes, name);
    }

    /**
     * Kiểm tra Watchdog tồn tại.
     *
     * @param {String} name
     * @returns {Boolean}
     */
    hasWatchdog(name) {
        return Object.prototype.hasOwnProperty.call(this.watchdogs, name);
    }
}

module.exports = Context;