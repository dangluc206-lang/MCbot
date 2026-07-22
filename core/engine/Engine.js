'use strict';

const Result = require('../constants/Result');

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

        this.modeManager = ctx.modeManager;

        this.watchdogManager = ctx.watchdogManager;

        this.recoveryManager = ctx.recoveryManager;

        this.scheduler = ctx.scheduler;

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
            return Result.ALREADY_RUNNING;
        }

        this.running = true;

        this.runtime.engine.running = true;

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

            await this.scheduler.delay(
                'engine:tick',
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