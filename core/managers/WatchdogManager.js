'use strict';

const BaseManager = require('../base/BaseManager');
const Result = require('../constants/Result');

/**
 * ============================================================================
 * WatchdogManager
 * ============================================================================
 *
 * Giám sát trạng thái Framework.
 *
 * Không xử lý nghiệp vụ.
 * Không tự Recovery.
 * Chỉ phát hiện bất thường và yêu cầu Recovery.
 *
 * ============================================================================
 */
class WatchdogManager extends BaseManager {

    constructor(ctx) {
        super(ctx);

        this.name = 'WatchdogManager';
    }

    async initialize() {
        await super.initialize();

        this.state.watchdog.enabled = true;
        this.state.watchdog.lastTick = Date.now();

        return Result.SUCCESS;
    }

    async destroy() {
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

        if (!this.state.watchdog.enabled) {
            return Result.NO_ACTION;
        }

        this.state.watchdog.lastTick = Date.now();

        // Mất kết nối
        if (!this.state.bot.connected) {
            return this.state.connection.lastDisconnect
                ? Result.DISCONNECTED
                : Result.NO_ACTION;
        }

        // Chết
        if (this.state.player.dead) {

            this.manager('recovery').request('PLAYER_DEAD');

            return Result.SUCCESS;
        }

        // Mode báo cần Recovery
        const mode = this.manager('mode').current();

        if (mode && mode.isRecoveryRequired()) {

            this.manager('recovery').request(
                mode.recoveryReason
            );

            return Result.SUCCESS;

        }
    }

    /**
     * Bật Watchdog.
     */
    enable() {
        this.state.watchdog.enabled = true;
    }

    /**
     * Tắt Watchdog.
     */
    disable() {
        this.state.watchdog.enabled = false;
    }

    /**
     * Kiểm tra trạng thái.
     *
     * @returns {Boolean}
     */
    isEnabled() {
        return this.state.watchdog.enabled;
    }

}

module.exports = WatchdogManager;
