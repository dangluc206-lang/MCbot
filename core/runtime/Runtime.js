'use strict';

const createRuntime = require('./RuntimeFactory');

/**
 * ============================================================================
 * Runtime
 * ============================================================================
 *
 * Wrapper quản lý Runtime của Framework.
 *
 * Runtime chỉ là State Store.
 * Không chứa nghiệp vụ.
 * Không chứa Event.
 * Không chứa Workflow.
 *
 * ============================================================================
 */
class Runtime {

    /**
     * Khởi tạo Runtime.
     */
    constructor() {
        /**
         * Runtime hiện tại.
         *
         * @private
         * @type {Object}
         */
        this._state = createRuntime();
    }

    /**
     * Trả về Runtime hiện tại.
     *
     * Lưu ý:
     * Không thay thế object này bằng object khác.
     * Chỉ cập nhật các field bên trong.
     *
     * @returns {Object}
     */
    get state() {
        return this._state;
    }

    /**
     * Reset toàn bộ Runtime.
     *
     * Dùng khi:
     * - Restart Framework
     * - Reload
     * - Test
     */
    reset() {
        this._state = createRuntime();
    }

    /**
     * Tạo Snapshot Runtime.
     *
     * Snapshot hoàn toàn độc lập với Runtime thật.
     *
     * Phục vụ:
     * - Debug
     * - Logging
     * - Metrics
     *
     * @returns {Object}
     */
    snapshot() {
        return JSON.parse(JSON.stringify(this._state));
    }

    /**
     * Xuất Runtime thành JSON.
     *
     * @returns {Object}
     */
    toJSON() {
        return this.snapshot();
    }
}

module.exports = Runtime;