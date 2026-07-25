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

        this._loop = null;

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

        if (this.state.engine.running) {
            return Result.NO_ACTION;
        }

        this.state.engine.running = true;

        this.success('Engine started.');

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
     * Dừng Engine.
     *
     * @returns {Promise<String>}
     */
    async stop() {

        this.running = false;

        this.runtime.state.engine.running = false;

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