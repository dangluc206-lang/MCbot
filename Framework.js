'use strict';

const Context = require('./core/context/Context');
const Runtime = require('./core/runtime/Runtime');
const Engine = require('./core/engine/Engine');
const ErrorHandler = require('./core/errors/ErrorHandler');
const Result = require('./core/constants/Result');

const registerManagers = require('./bootstrap/registerManagers');
const registerServices = require('./bootstrap/registerServices');
const registerListeners = require('./bootstrap/registerListeners');
const registerModes = require('./bootstrap/registerModes');

class Framework {
    constructor(bot, config = {}) {
        this.bot = bot;
        this.config = config;
        this.ctx = null;
        this.runtime = null;
        this.engine = null;
        this.started = false;
        this.stopped = false;

        this.createContext();
    }

    createContext() {
        this.ctx = new Context();
        this.runtime = new Runtime();

        this.ctx
            .setBot(this.bot)
            .setConfig(this.config)
            .setRuntime(this.runtime);
    }

    async start() {
        if (this.started) {
            return Result.NO_ACTION;
        }

        if (this.stopped) {
            this.createContext();
            this.stopped = false;
        }

        try {
            registerManagers(this.ctx);

            for (const manager of Object.values(this.ctx.managers)) {
                await manager.initialize();
            }

            this.ctx.setErrorHandler(new ErrorHandler(this.ctx));

            registerServices(this.ctx);

            for (const service of Object.values(this.ctx.services)) {
                await service.initialize();
            }

            await registerListeners(this.ctx);
            registerModes(this.ctx);

            this.runtime.state.startedAt = Date.now();
            this.engine = new Engine(this.ctx);

            const result = await this.engine.start();
            this.started = result === Result.SUCCESS;

            return result;
        }
        catch (error) {
            this.ctx.errorHandler?.handle(error, { phase: 'framework.start' });
            await this.stop();
            return Result.FAILED;
        }
    }

    async stop() {
        if (!this.started) {
            return Result.NO_ACTION;
        }

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
        this.engine = null;
        this.started = false;
        this.stopped = true;

        return Result.SUCCESS;
    }
}

module.exports = Framework;
