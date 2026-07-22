'use strict';

const BaseManager = require('../base/BaseManager');
const Result = require('../constants/Result');

/**
 * ============================================================================
 * SchedulerManager
 * ============================================================================
 *
 * Quản lý toàn bộ Timer của Framework.
 *
 * Không dùng setTimeout / setInterval trực tiếp bên ngoài Manager này.
 *
 * ============================================================================
 */
class SchedulerManager extends BaseManager {

    constructor(ctx) {
        super(ctx);

        this.name = 'SchedulerManager';

        /**
         * @private
         * @type {Map<string, Object>}
         */
        this.tasks = new Map();
    }

    async initialize() {
        await super.initialize();
        return Result.SUCCESS;
    }

    async destroy() {
        this.clearAll();

        await super.destroy();

        return Result.SUCCESS;
    }

    /**
     * Thực thi một lần sau delay.
     *
     * @param {String} id
     * @param {Function} callback
     * @param {Number} delay
     * @returns {String}
     */
    timeout(id, callback, delay) {
        this.cancel(id);

        const handle = setTimeout(async () => {
            this.tasks.delete(id);

            try {
                await callback();
            }
            catch (error) {
                this.error(error);
            }

        }, delay);

        this.tasks.set(id, {
            type: 'timeout',
            handle,
            createdAt: Date.now()
        });

        return id;
    }

    /**
     * Thực thi lặp.
     *
     * @param {String} id
     * @param {Function} callback
     * @param {Number} interval
     * @returns {String}
     */
    interval(id, callback, interval) {
        this.cancel(id);

        const handle = setInterval(async () => {
            try {
                await callback();
            }
            catch (error) {
                this.error(error);
            }

        }, interval);

        this.tasks.set(id, {
            type: 'interval',
            handle,
            createdAt: Date.now()
        });

        return id;
    }

    /**
     * Delay Promise.
     *
     * @param {Number} ms
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }

    /**
     * Hủy task.
     *
     * @param {String} id
     * @returns {Boolean}
     */
    cancel(id) {
        const task = this.tasks.get(id);

        if (!task) {
            return false;
        }

        if (task.type === 'timeout') {
            clearTimeout(task.handle);
        }
        else {
            clearInterval(task.handle);
        }

        this.tasks.delete(id);

        return true;
    }

    /**
     * Kiểm tra task.
     *
     * @param {String} id
     * @returns {Boolean}
     */
    has(id) {
        return this.tasks.has(id);
    }

    /**
     * Lấy task.
     *
     * @param {String} id
     * @returns {Object|null}
     */
    get(id) {
        return this.tasks.get(id) || null;
    }

    /**
     * Hủy toàn bộ timer.
     */
    clearAll() {
        for (const id of this.tasks.keys()) {
            this.cancel(id);
        }
    }

    /**
     * Danh sách task.
     *
     * @returns {String[]}
     */
    keys() {
        return [...this.tasks.keys()];
    }

    /**
     * Số lượng task.
     *
     * @returns {Number}
     */
    size() {
        return this.tasks.size;
    }
}

module.exports = SchedulerManager;