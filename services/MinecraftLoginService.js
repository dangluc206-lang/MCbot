'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const TimeoutError = require('../core/errors/TimeoutError');

/** Owns server authentication for one Minecraft connection. */
class MinecraftLoginService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'MinecraftLoginService';
        this.loginTask = null;
        this.attempted = false;
        this.generation = 0;
    }

    async initialize() {
        await super.initialize();
        this.bind(this.bot, 'login', () => this.resetConnection());
        this.bind(this.bot, 'spawn', () => this.start().catch(error => this.error(error)));
        this.bind(this.bot, 'message', message => this.detectMessage(message?.toString?.() || ''));
        this.bind(this.bot, 'messagestr', message => this.detectMessage(message));
        this.bind(this.bot, 'actionBar', message => this.detectMessage(message?.toString?.() || ''));
        for (const event of ['end', 'kicked', 'error']) this.bind(this.bot, event, () => this.invalidateConnection());
        return Result.SUCCESS;
    }

    settings() {
        const minecraft = this.config.minecraft || {};
        const legacy = this.config.skyblock || {};
        return {
            password: minecraft.loginPassword ?? legacy.loginPassword,
            afterSpawnDelayMs: minecraft.loginAfterSpawnDelayMs ?? legacy.afterSpawnDelayMs ?? 1000,
            afterLoginDelayMs: minecraft.loginAfterLoginDelayMs ?? legacy.afterLoginDelayMs ?? 1000,
            timeoutMs: minecraft.loginTimeoutMs ?? legacy.loginTimeoutMs ?? 15000,
            successPatterns: minecraft.loginSuccessPatterns ?? legacy.loginSuccessPatterns ?? [
                'logged in', 'login successful', 'đăng nhập thành công', 'đã đăng nhập'
            ]
        };
    }

    resetConnection() {
        this.generation += 1;
        this.loginTask = null;
        this.attempted = false;
        this.setAuthenticated(false);
    }

    invalidateConnection() {
        this.generation += 1;
        this.loginTask = null;
        this.setAuthenticated(false);
    }

    isAuthenticated() {
        return this.state.connection.authenticated === true || this.state.skyblock?.loggedIn === true;
    }

    setAuthenticated(value) {
        this.state.connection.authenticated = value;
        if (this.state.skyblock) this.state.skyblock.loggedIn = value;
        if (value) {
            this.state.connection.lastAuthenticatedAt = Date.now();
            if (this.state.skyblock) this.state.skyblock.lastLogin = this.state.connection.lastAuthenticatedAt;
        }
    }

    detectMessage(message) {
        if (!message || this.isAuthenticated()) return;
        const patterns = this.settings().successPatterns;
        if (!Array.isArray(patterns)) return;
        const lower = message.toLowerCase();
        if (patterns.some(pattern => typeof pattern === 'string' && lower.includes(pattern.toLowerCase()))) {
            this.setAuthenticated(true);
            this.emit(Events.Connection.AUTHENTICATED);
        }
    }

    async start() {
        if (!this.state.bot.connected) return Result.NOT_CONNECTED;
        if (this.isAuthenticated()) return Result.ALREADY_DONE;
        if (this.loginTask) return this.loginTask;
        if (this.attempted) return Result.NOT_LOGGED_IN;

        const generation = this.generation;
        const settings = this.settings();
        this.attempted = true;
        this.loginTask = (async () => {
            if (!settings.password) {
                if (!this.isCurrentConnection(generation)) return Result.DISCONNECTED;
                this.setAuthenticated(true);
                this.emit(Events.Connection.AUTHENTICATED);
                return Result.SUCCESS;
            }

            await this.delay(settings.afterSpawnDelayMs);
            if (!this.isCurrentConnection(generation)) return Result.DISCONNECTED;
            const sent = await this.service('chat').sendCommand(`/login ${settings.password}`);
            if (sent !== Result.SUCCESS) return sent;
            await this.delay(settings.afterLoginDelayMs);
            return this.isCurrentConnection(generation) ? Result.SUCCESS : Result.DISCONNECTED;
        })().catch(error => {
            if (!this.state.bot.connected) return Result.DISCONNECTED;
            this.error(`Minecraft login failed: ${error.message}`);
            return Result.FAILED;
        });
        return this.loginTask;
    }

    isCurrentConnection(generation) {
        return this.state.bot.connected === true && this.generation === generation;
    }

    async waitForAuthentication(timeout = this.settings().timeoutMs) {
        if (this.isAuthenticated()) return Result.SUCCESS;
        return this.createAuthenticationWaiter(timeout).promise;
    }

    createAuthenticationWaiter(timeout) {
        let cleanup = () => {};
        const promise = new Promise((resolve, reject) => {
            const authenticated = () => { cleanup(); resolve(Result.SUCCESS); };
            const disconnected = reason => { cleanup(); reject(new Error(`Minecraft connection ended before login${reason ? `: ${String(reason)}` : '.'}`)); };
            const timer = setTimeout(() => { cleanup(); reject(new TimeoutError('login confirmation', timeout)); }, timeout);
            cleanup = () => {
                clearTimeout(timer);
                const events = this.manager('events');
                events.off(Events.Connection.AUTHENTICATED, authenticated);
                for (const event of [Events.Connection.ENDED, Events.Connection.KICKED, Events.Connection.ERROR]) events.off(event, disconnected);
            };
            const events = this.manager('events');
            events.on(Events.Connection.AUTHENTICATED, authenticated);
            for (const event of [Events.Connection.ENDED, Events.Connection.KICKED, Events.Connection.ERROR]) events.on(event, disconnected);
        });
        return { promise, cancel: cleanup };
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, Number.isFinite(Number(ms)) ? Math.max(0, Number(ms)) : 0));
    }
}

module.exports = MinecraftLoginService;
