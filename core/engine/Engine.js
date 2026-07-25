'use strict';

const Result = require('../constants/Result');
const States = require('../constants/States');

/**
 * ============================================================================
 * Engine
 * ============================================================================
 *
 * Main Loop của Framework.
 *
 * Trách nhiệm:
 * - Chạy Tick Loop.
 * - Điều phối Manager.
 * - Cập nhật Runtime.
 * - Bắt lỗi.
 *
 * Không chứa nghiệp vụ.
 *
 * ============================================================================
 */
class Engine {

    constructor(ctx) {

        this.ctx = ctx;

        this.runtime = ctx.runtime;

        this.state = this.runtime.state;

        this._loop = null;

        this.logger = ctx.logger;

        this.modeManager = ctx.getManager('mode');

        this.watchdogManager = ctx.getManager('watchdog');
        
        this.recoveryManager = ctx.getManager('recovery');
        
        this.scheduler = ctx.getManager('scheduler');
        

        /**
         * Tick interval (ms).
         * Có thể đưa vào Config sau này.
         */
        this.tickInterval = 50;

    }

    /**
     * Khởi động Engine.
     *
     * @returns {Promise<String>}
     */
    async start() {

        if (this.state.engine.running) {
            return Result.NO_ACTION;
        }

        this.state.engine.running = true;

        this.logger.success('Engine started.');

        this._loop = this.run();

        return Result.SUCCESS;

    }

    async run() {

        while (this.state.engine.running) {

            try {

                await this.tick();

            } catch (error) {

                this.logger.error(error);

            }

            await this.scheduler.sleep(
                this.tickInterval
            );

        }

    }
    /**
     * Thực hiện một Engine Tick.
     *
     * @returns {Promise<String>}
     */
    async tick() {

        this.state.engine.tick++;

        if (this.watchdogManager?.tick) {
            await this.watchdogManager.tick();
        }

        if (this.recoveryManager?.tick) {
            await this.recoveryManager.tick();
        }

        if (this.modeManager?.tick) {
            await this.modeManager.tick();
        }

        return Result.SUCCESS;

    }

    /**
     * Dừng Engine.
     *
     * @returns {Promise<String>}
     */
    async stop() {

        this.state.engine.running = false;

        this.state.engine.state = States.Engine.STOPPED;

        this.scheduler.cancel('engine:tick');
        if (this._loop) {
            await this._loop;
        }

        this.logger.warn('Engine stopped.');

        return Result.SUCCESS;

    }

    /**
     * Trạng thái Engine.
     *
     * @returns {Boolean}
     */
    isRunning() {
        return this.state.engine.running;
    }

}

module.exports = Engine;