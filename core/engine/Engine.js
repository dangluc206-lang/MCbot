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

        this.logger = ctx.logger;

        this.modeManager = ctx.getManager('mode');

        this.watchdogManager = ctx.getManager('watchdog');
        
        this.recoveryManager = ctx.getManager('recovery');
        
        this.scheduler = ctx.getManager('scheduler');
        
        this.running = false;

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

        if (this.running) {
            return Result.ENGINE_ALREADY_RUNNING;
        }

        this.running = true;

        this.runtime.engine.running = true;
        this.runtime.state.engine.state = States.Engine.RUNNING;

        this.logger.success('Engine started.');

        while (this.running) {

            try {

                this.runtime.engine.tick++;

                await this.modeManager.tick();

                await this.watchdogManager.tick();

                await this.recoveryManager.tick();

            }
            catch (error) {

                this.runtime.engine.lastError = error;

                this.logger.error(error);

            }

            await this.scheduler.sleep(
                this.tickInterval
            );

        }

        return Result.SUCCESS;

    }

    /**
     * Dừng Engine.
     *
     * @returns {Promise<String>}
     */
    async stop() {

        this.running = false;

        this.runtime.engine.running = false;

        this.runtime.state.engine.state = States.Engine.STOPPED;

        this.scheduler.cancel('engine:tick');

        this.logger.warn('Engine stopped.');

        return Result.SUCCESS;

    }

    /**
     * Trạng thái Engine.
     *
     * @returns {Boolean}
     */
    isRunning() {
        return this.running;
    }

}

module.exports = Engine;