'use strict';

const Context = require('./core/context/Context');
const Runtime = require('./core/runtime/Runtime');
const Engine = require('./core/engine/Engine');

const registerManagers = require('./bootstrap/registerManagers');
const registerServices = require('./bootstrap/registerServices');
const registerListeners = require('./bootstrap/registerListeners');
const registerModes = require('./bootstrap/registerModes');

const Result = require('./core/constants/Result');

/**
 * ============================================================================
 * Framework
 * ============================================================================
 *
 * Entry của toàn bộ Framework.
 *
 * Trách nhiệm:
 * - Khởi tạo Context.
 * - Khởi tạo Runtime.
 * - Đăng ký Manager.
 * - Đăng ký Service.
 * - Đăng ký Listener.
 * - Đăng ký Mode.
 * - Điều phối Engine.
 *
 * ============================================================================
 */

class Framework {

    /**
     * @param {*} bot
     * @param {Object} config
     */
    constructor(bot, config = {}) {

        this.ctx = new Context();

        this.runtime = new Runtime();

        this.ctx
            .setBot(bot)
            .setConfig(config)
            .setRuntime(this.runtime);

        this.engine = null;

    }

    /**
     * Khởi động Framework.
     *
     * @returns {Promise<String>}
     */
    async start() {

        // Managers
        registerManagers(this.ctx);

        for (const manager of Object.values(this.ctx.managers)) {
            await manager.initialize();
        }

        // Services
        registerServices(this.ctx);

        for (const service of Object.values(this.ctx.services)) {
            await service.initialize();
        }

        // Listeners
        await registerListeners(this.ctx);

        // Modes
        registerModes(this.ctx);

        this.runtime.state.startedAt = Date.now();

        this.engine = new Engine(this.ctx);

        return this.engine.start();

    }

    /**
     * Dừng Framework.
     *
     * @returns {Promise<String>}
     */
    async stop() {

        if (this.engine) {
            await this.engine.stop();
        }

        if (Array.isArray(this.ctx.listeners)) {

            for (const listener of [...this.ctx.listeners].reverse()) {
                await listener.destroy();
            }

        }

        for (const service of Object.values(this.ctx.services).reverse()) {
            await service.destroy();
        }

        for (const manager of Object.values(this.ctx.managers).reverse()) {
            await manager.destroy();
        }
        this.runtime.reset();
        return Result.SUCCESS;



    }

}

module.exports = Framework;