'use strict';

const BaseManager = require('../base/BaseManager');
const Result = require('../constants/Result');

/**
 * ============================================================================
 * RecoveryManager
 * ============================================================================
 *
 * Điều phối toàn bộ quá trình Recovery của Framework.
 *
 * Trách nhiệm:
 * - Theo dõi Runtime.
 * - Phát hiện trạng thái cần Recovery.
 * - Điều phối Service / Mode thực hiện Recovery.
 *
 * Không chứa nghiệp vụ.
 *
 * ============================================================================
 */
class RecoveryManager extends BaseManager {

    constructor(ctx) {
        super(ctx);

        this.name = 'RecoveryManager';

        /**
         * Đang thực hiện Recovery.
         *
         * @private
         * @type {Boolean}
         */
        this.recovering = false;
    }

    async initialize() {
        await super.initialize();

        this.state.recovery.running = false;
        this.state.recovery.reason = null;
        this.state.recovery.lastRecovery = null;

        return Result.SUCCESS;
    }

    async destroy() {
        this.recovering = false;

        await super.destroy();

        return Result.SUCCESS;
    }

    /**
     * Tick.
     *
     * Được Engine gọi định kỳ.
     *
     * @returns {Promise<String>}
     */
    async tick() {
        if (this.recovering) {
            return Result.NO_ACTION;
        }

        const recovery = this.state.recovery;

        if (!recovery.required) {
            return Result.NO_ACTION;
        }

        return this.recover();
    }

    /**
     * Thực hiện Recovery.
     *
     * @returns {Promise<String>}
     */
    async recover() {

        if (this.recovering) {
            return Result.BUSY;
        }

        this.recovering = true;

        this.state.recovery.running = true;

        try {

            const modeManager = this.manager('mode');

            if (modeManager) {
                await this.ctx.skyblock.ensureJoined();
                await modeManager.recover();
            }

            this.state.recovery.required = false;
            this.state.recovery.reason = null;
            this.state.recovery.lastRecovery = Date.now();

            return Result.SUCCESS;

        }
        catch (error) {

            this.error(error);

            return Result.FAILED;

        }
        finally {

            this.state.recovery.running = false;
            this.recovering = false;

        }

    }

    /**
     * Yêu cầu Recovery.
     *
     * @param {String} reason
     */
    request(reason) {

        this.state.recovery.required = true;
        this.state.recovery.reason = reason;

    }

    /**
     * Hủy Recovery.
     */
    clear() {

        this.state.recovery.required = false;
        this.state.recovery.reason = null;

    }

    /**
     * Đang Recovery.
     *
     * @returns {Boolean}
     */
    isRecovering() {
        return this.recovering;
    }

}

module.exports = RecoveryManager;