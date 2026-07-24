'use strict';

const BaseManager = require('../base/BaseManager');
const Result = require('../constants/Result');

/**
 * ============================================================================
 * ModeManager
 * ============================================================================
 *
 * Quản lý toàn bộ Mode của Framework.
 *
 * Trách nhiệm:
 * - Register Mode
 * - Start
 * - Stop
 * - Pause
 * - Resume
 * - Tick Current Mode
 * - Recovery Entry
 *
 * Không chứa nghiệp vụ.
 *
 * ============================================================================
 */
class ModeManager extends BaseManager {

    constructor(ctx) {
        super(ctx);

        this.name = 'ModeManager';

        /**
         * Danh sách Mode.
         *
         * @private
         * @type {Map<String, BaseMode>}
         */
        this.modes = new Map();

        /**
         * Mode hiện tại.
         *
         * @private
         * @type {BaseMode|null}
         */
        this.currentMode = null;

        /**
         * Mode trước đó.
         *
         * @private
         * @type {BaseMode|null}
         */
        this.previousMode = null;
    }

    async initialize() {
        await super.initialize();
        return Result.SUCCESS;
    }

    async destroy() {
        if (this.currentMode) {
            await this.currentMode.stop();
        }

        this.modes.clear();

        this.currentMode = null;
        this.previousMode = null;

        await super.destroy();

        return Result.SUCCESS;
    }

    /**
     * Đăng ký Mode.
     *
     * @param {String} name
     * @param {BaseMode} mode
     * @returns {ModeManager}
     */
    register(name, mode) {
        if (this.modes.has(name)) {
            throw new Error(
                `Mode "${name}" already registered.`
            );
        }
        
        this.modes.set(name, mode);
        this.ctx.registerMode(name, mode);

        this.info(`Registered mode: ${name}`);

        return this;
    }

    /**
     * Hủy đăng ký Mode.
     *
     * @param {String} name
     * @returns {Boolean}
     */
    unregister(name) {
        if (this.currentMode === this.modes.get(name)) {
            throw new Error(
                `Cannot unregister running mode "${name}".`
            );
        }

        return this.modes.delete(name);
    }

    /**
     * Khởi động Mode.
     *
     * @param {String} name
     * @returns {Promise<String>}
     */
    async start(name) {
        const mode = this.modes.get(name);

        if (!mode) {
            return Result.FAILED;
        }

        if (this.currentMode === mode) {
            return Result.MODE_ALREADY_RUNNING;
        }

        if (this.currentMode) {
            await this.stop();
        }

        this.previousMode = this.currentMode;
        this.currentMode = mode;

        this.state.mode.previous = this.previousMode
            ? this.previousMode.name
            : null;

        this.state.mode.current = mode.name;

        return mode.start();
    }

    /**
     * Dừng Mode hiện tại.
     *
     * @returns {Promise<String>}
     */
    async stop() {
        if (!this.currentMode) {
            return Result.MODE_NOT_RUNNING;
        }

        const result = await this.currentMode.stop();

        this.previousMode = this.currentMode;
        this.currentMode = null;

        this.state.mode.previous = this.previousMode.name;
        this.state.mode.current = null;

        return result;
    }

    /**
     * Pause Mode.
     *
     * @returns {Promise<String>}
     */
    async pause() {
        if (!this.currentMode) {
            return Result.MODE_NOT_RUNNING;
        }

        return this.currentMode.pause();
    }

    /**
     * Resume Mode.
     *
     * @returns {Promise<String>}
     */
    async resume() {
        if (!this.currentMode) {
            return Result.MODE_NOT_RUNNING;
        }

        return this.currentMode.resume();
    }

    /**
     * Tick Mode hiện tại.
     *
     * @returns {Promise<String>}
     */
    async tick() {
        if (!this.currentMode) {
            return Result.NO_ACTION;
        }

        if (!this.currentMode.isRunning()) {
            return Result.NO_ACTION;
        }

        if (this.currentMode.isPaused()) {
            return Result.NO_ACTION;
        }

        return this.currentMode.tick();
    }

    /**
     * Recovery entry.
     *
     * @returns {Promise<String>}
     */
    async recover() {
        if (!this.currentMode) {
            return Result.NO_ACTION;
        }

        return this.currentMode.recover();
    }

    /**
     * Lấy Mode.
     *
     * @param {String} name
     * @returns {*}
     */
    get(name) {
        return this.modes.get(name) || null;
    }

    /**
     * Mode hiện tại.
     *
     * @returns {*}
     */
    current() {
        return this.currentMode;
    }

    /**
     * Mode trước đó.
     *
     * @returns {*}
     */
    previous() {
        return this.previousMode;
    }

    /**
     * Kiểm tra tồn tại.
     *
     * @param {String} name
     * @returns {Boolean}
     */
    has(name) {
        return this.modes.has(name);
    }

    /**
     * Danh sách Mode.
     *
     * @returns {String[]}
     */
    names() {
        return [...this.modes.keys()];
    }

    /**
     * Số lượng Mode.
     *
     * @returns {Number}
     */
    size() {
        return this.modes.size;
    }
}

module.exports = ModeManager;