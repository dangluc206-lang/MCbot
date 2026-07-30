'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');

const DEFAULT_COMMAND_AFTER_GUI_CLOSE_DELAY_MS = 6000;

/**
 * High-level Minecraft chat/command gateway for controllers and modes.
 *
 * Server commands are serialised here. A Minecraft GUI close reserves the
 * command channel for a configurable period, preventing MinerUA from silently
 * ignoring a following `/nung`, `/kho`, `/pv`, `/ks`, or similar command.
 */
class ChatService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'ChatService';
        this.events = ctx.getManager('events');
        this.commandQueue = Promise.resolve();
        this.nextCommandAt = 0;
    }

    async initialize() {
        await super.initialize();
        // Bind to Mineflayer once, rather than the framework GUI event, which
        // is emitted by both GUIService and GUIListener in this project.
        this.bind(this.bot, 'windowClose', () => this._noteGuiClosed());
        this._syncState();
        return Result.SUCCESS;
    }

    /** Sends ordinary chat. A leading slash is treated as a queued command. */
    async send(message) {
        const text = String(message || '').trim();
        if (!text || text.length > 256) return Result.FAILED;
        return text.startsWith('/')
            ? this.sendCommand(text)
            : this._enqueue(text, false);
    }

    /**
     * Sends a Minecraft command only after the current GUI has closed and its
     * six-second post-close cooldown has expired.
     *
     * @param {String} command
     * @returns {Promise<String>}
     */
    async sendCommand(command, options = {}) {
        const text = String(command || '').trim();
        if (!text || text.length > 256) return Result.FAILED;
        return this._enqueue(text.startsWith('/') ? text : `/${text}`, true, options);
    }

    /** Milliseconds until a new slash command can be sent. */
    commandCooldownRemainingMs() {
        return Math.max(0, this.nextCommandAt - Date.now());
    }

    _enqueue(text, isCommand, options = {}) {
        const operation = async () => {
            if (!this.state.bot.connected) return Result.NOT_CONNECTED;
            if (isCommand) {
                const ready = await this._waitUntilCommandReady(text);
                if (ready !== Result.SUCCESS) return ready;
            }
            if (!this.state.bot.connected) return Result.NOT_CONNECTED;

            if (typeof options.beforeSend === 'function') {
                try {
                    options.beforeSend();
                } catch (error) {
                    this.error(`Không thể chuẩn bị ${text}: ${error.message}`);
                    return Result.FAILED;
                }
            }

            this.bot.chat(text);
            if (isCommand) {
                this.state.chat.lastCommandAt = Date.now();
                this.state.chat.lastCommand = text;
                this._syncState();
            }
            return Result.SUCCESS;
        };

        const queued = this.commandQueue.then(operation, operation);
        // Keep the queue healthy after an error while preserving the actual
        // result for the caller which owns the workflow.
        this.commandQueue = queued.catch(() => Result.FAILED);
        return queued;
    }

    async _waitUntilCommandReady(command) {
        const waitMs = this.commandCooldownRemainingMs();
        if (waitMs > 0) {
            this.info(`Chờ ${Math.ceil(waitMs)} ms sau khi GUI đóng trước ${this._commandName(command)}.`);
            await this._sleep(waitMs);
        }
        return Result.SUCCESS;
    }

    _commandName(command) {
        const name = String(command || '').trim().split(/\s+/, 1)[0];
        return name || '/command';
    }

    _noteGuiClosed() {
        const closedAt = Date.now();
        this.nextCommandAt = Math.max(
            this.nextCommandAt,
            closedAt + this._commandAfterGuiCloseDelayMs()
        );
        this.state.chat.lastGuiClosedAt = closedAt;
        this._syncState();
    }

    _commandAfterGuiCloseDelayMs() {
        const value = Number(this.config.minecraft?.commandAfterGuiCloseDelayMs);
        return Number.isFinite(value)
            ? Math.min(Math.max(Math.floor(value), 0), 60000)
            : DEFAULT_COMMAND_AFTER_GUI_CLOSE_DELAY_MS;
    }

    async _sleep(milliseconds) {
        const scheduler = this.manager('scheduler');
        if (scheduler?.sleep) return scheduler.sleep(milliseconds);
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    _syncState() {
        this.state.chat = {
            lastCommandAt: null,
            lastCommand: null,
            lastGuiClosedAt: null,
            nextCommandAt: null,
            ...(this.state.chat || {}),
            nextCommandAt: this.nextCommandAt || null
        };
    }

    async destroy() {
        this.commandQueue = Promise.resolve();
        this.nextCommandAt = 0;
        await super.destroy();
        return Result.SUCCESS;
    }
}

module.exports = ChatService;
