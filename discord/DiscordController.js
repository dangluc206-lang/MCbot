'use strict';

const { Client, Events: DiscordEvents, GatewayIntentBits } = require('discord.js');
const Result = require('../core/constants/Result');
const DiscordCommandRegistry = require('./DiscordCommandRegistry');
const DiscordInteractionRouter = require('./DiscordInteractionRouter');
const DiscordPermissionManager = require('./DiscordPermissionManager');
const Cooldown = require('./middleware/Cooldown');

const pingCommand = require('./commands/system/ping.command');
const helpCommand = require('./commands/system/help.command');
const statusCommand = require('./commands/system/status.command');
const startCommand = require('./commands/system/start.command');
const stopCommand = require('./commands/system/stop.command');
const restartCommand = require('./commands/system/restart.command');
const shutdownCommand = require('./commands/system/shutdown.command');
const panelCommand = require('./commands/system/panel.command');
const modeCommand = require('./commands/mode/mode.command');
const chatCommand = require('./commands/minecraft/chat.command');
const minecraftCommand = require('./commands/minecraft/command.command');
const guiProbeCommand = require('./commands/minecraft/gui-probe.command');
const personalVaultAuditCommand = require('./commands/minecraft/pv-audit.command');
const positionCommand = require('./commands/minecraft/position.command');
const healthCommand = require('./commands/minecraft/health.command');
const playersCommand = require('./commands/minecraft/players.command');
const reconnectCommand = require('./commands/minecraft/reconnect.command');
const gotoCommand = require('./commands/movement/goto.command');
const followCommand = require('./commands/movement/follow.command');
const lookCommand = require('./commands/movement/look.command');
const jumpCommand = require('./commands/movement/jump.command');
const movementStopCommand = require('./commands/movement/movement-stop.command');
const inventoryCommand = require('./commands/inventory/inventory.command');
const useCommand = require('./commands/inventory/use.command');
const equipCommand = require('./commands/inventory/equip.command');
const swapCommand = require('./commands/inventory/swap.command');
const dropCommand = require('./commands/inventory/drop.command');
const logsCommand = require('./commands/logs/logs.command');
const errorsCommand = require('./commands/logs/errors.command');
const warningsCommand = require('./commands/logs/warnings.command');
const configCommand = require('./commands/admin/config.command');
const viewCommand = require('./commands/view/view.command');
const viewerCommand = require('./commands/view/viewer.command');
const dashboardButton = require('./components/buttons/dashboard.button');
const shutdownButtons = require('./components/buttons/shutdown.button');
const movementStopButton = require('./components/buttons/movement-stop.button');
const controlPanel = require('./components/buttons/control-panel.button');
const InventorySessionManager = require('./InventorySessionManager');
const ConfirmationManager = require('./ConfirmationManager');
const DiscordNotificationService = require('./notifications/DiscordNotificationService');
const ControlPanelManager = require('./ControlPanelManager');
const { ConfigPanelManager } = require('./ConfigPanelManager');
const configHandlers = require('./components/buttons/config-panel.handlers');

/** Discord-facing controller; Minecraft behavior stays behind Context services/managers. */
class DiscordController {
    constructor(ctx, options = {}) {
        if (!ctx) throw new Error('DiscordController requires Context.');
        this.ctx = ctx;
        this.client = null;
        this.started = false;
        this.registry = new DiscordCommandRegistry();
        this.inventorySessions = new InventorySessionManager();
        this.confirmations = new ConfirmationManager();
        this.permissions = new DiscordPermissionManager(ctx.config?.discord || {});
        this.cooldown = new Cooldown();
        this.createClient = options.createClient || (() => new Client({ intents: [GatewayIntentBits.Guilds] }));
        this.readyTimeoutMs = Math.min(Math.max(
            Number(options.readyTimeoutMs ?? ctx.config?.discord?.readyTimeoutMs) || 15000,
            1000
        ), 120000);
        this.router = new DiscordInteractionRouter({
            getContext: () => this.ctx,
            registry: this.registry,
            permissions: this.permissions,
            cooldown: this.cooldown
        });
        this.boundInteraction = interaction => {
            this.router.handle(interaction).catch(error => {
                this.ctx.errorHandler?.handle(error, { phase: 'discord.interaction-event' });
            });
        };
        this.boundClientError = error => this.ctx.errorHandler?.handle(error, { phase: 'discord.client' });
        this.cancelReadyWait = null;
        this.notifications = null;
        this.controlPanel = null;
        this.configPanel = null;
        this.loadContracts();
    }

    loadContracts() {
        [pingCommand, helpCommand, statusCommand, panelCommand, startCommand, stopCommand, restartCommand, shutdownCommand, modeCommand, chatCommand, minecraftCommand, guiProbeCommand, personalVaultAuditCommand, positionCommand, healthCommand, playersCommand, reconnectCommand, gotoCommand, followCommand, lookCommand, jumpCommand, movementStopCommand, inventoryCommand, useCommand, equipCommand, swapCommand, dropCommand, logsCommand, errorsCommand, warningsCommand, configCommand, viewCommand, viewerCommand].forEach(command => this.registry.register(command));
        for (const [customId, handler] of dashboardButton.handlers) this.registry.registerButton(customId, handler);
        for (const [customId, handler] of dashboardButton.selects) this.registry.registerSelect(customId, handler);
        for (const [customId, handler] of shutdownButtons) this.registry.registerButton(customId, handler);
        this.registry.registerButton(...movementStopButton);
        for (const [customId, handler] of configHandlers.buttons) this.registry.registerButton(customId, handler);
        for (const [customId, handler] of configHandlers.modals) this.registry.registerModal(customId, handler);
        for (const [customId, handler] of configHandlers.selects) this.registry.registerSelect(customId, handler);
        for (const [customId, handler] of controlPanel.handlers) this.registry.registerButton(customId, handler);
        for (const [customId, handler] of controlPanel.select) this.registry.registerSelect(customId, handler);
        this.registry.registerButtonMatcher(id => /^inventory:(prev|next|refresh|close):[a-z0-9]+$/.test(id), inventoryCommand.componentHandler);
        this.registry.registerButtonMatcher(id => /^confirm:(drop|cancel):[a-z0-9]+$/.test(id), dropCommand.componentHandler);
    }

    async updateContext(ctx) {
        if (!ctx) throw new Error('DiscordController requires a valid Context.');
        this.notifications?.stop();
        if (this.ctx.discordController === this) this.ctx.discordController = null;
        this.ctx = ctx;
        this.permissions = new DiscordPermissionManager(ctx.config?.discord || {});
        ctx.discordController = this;
        this.controlPanel?.updateContext(ctx);
        this.configPanel?.updateContext(ctx);
        if (this.started) {
            this.notifications = new DiscordNotificationService(ctx, this.client);
            await this.notifications.start();
        }
    }

    isStarted() {
        return this.started;
    }

    async start() {
        if (this.started) return Result.NO_ACTION;
        if (this.ctx.config?.discord?.enabled === false) return Result.NO_ACTION;
        const token = this.ctx.config?.discord?.token;
        if (!token) throw new Error('Discord token is required when Discord is enabled.');
        try {
            this.ctx.discordController = this;
            this.client = this.createClient();
            if (!this.client) throw new Error('Discord client factory did not return a client.');
            this.client.mcbotController = this;
            this.client.on(DiscordEvents.InteractionCreate, this.boundInteraction);
            this.client.on(DiscordEvents.Error, this.boundClientError);

            const ready = this._waitUntilReady();
            ready.catch(() => {});
            await this.client.login(token);
            await ready;

            this.notifications = new DiscordNotificationService(this.ctx, this.client);
            await this.notifications.start();
            this.controlPanel = new ControlPanelManager(this.ctx, this.client);
            await this.controlPanel.start();
            this.configPanel = new ConfigPanelManager(this.ctx, this.client);
            await this.configPanel.start();
            this.started = true;
            return Result.SUCCESS;
        } catch (error) {
            await this.stop();
            throw error;
        }
    }

    async stop() {
        const hadResources = this.started || this.client || this.notifications || this.controlPanel || this.configPanel;
        if (!hadResources) return Result.NO_ACTION;
        this.cancelReadyWait?.();
        this.cancelReadyWait = null;
        this.client?.removeListener(DiscordEvents.InteractionCreate, this.boundInteraction);
        this.client?.removeListener(DiscordEvents.Error, this.boundClientError);
        this.cooldown.clear();
        this.inventorySessions.clear();
        this.confirmations.clear();
        this.notifications?.stop();
        this.notifications = null;
        this.controlPanel?.stop();
        this.controlPanel = null;
        this.configPanel?.stop();
        this.configPanel = null;
        this.client?.destroy();
        if (this.client) this.client.mcbotController = null;
        this.client = null;
        if (this.ctx.discordController === this) this.ctx.discordController = null;
        this.started = false;
        return Result.SUCCESS;
    }

    /**
     * Waits for the current Discord client with an explicit timeout and cleans
     * temporary listeners regardless of ready, error, or shutdown.
     *
     * @returns {Promise<*>}
     * @private
     */
    _waitUntilReady() {
        const client = this.client;
        return new Promise((resolve, reject) => {
            let timer;
            const cleanup = () => {
                clearTimeout(timer);
                client.off?.(DiscordEvents.ClientReady, onReady);
                client.off?.(DiscordEvents.Error, onError);
                this.cancelReadyWait = null;
            };
            const finish = (callback, value) => {
                cleanup();
                callback(value);
            };
            const onReady = readyClient => {
                this.ctx.logger?.success?.(`[DiscordController] Online as ${readyClient.user?.tag || 'unknown user'}.`);
                finish(resolve, readyClient);
            };
            const onError = error => finish(reject, error);

            client.once(DiscordEvents.ClientReady, onReady);
            client.once(DiscordEvents.Error, onError);
            timer = setTimeout(() => {
                finish(reject, new Error(`Discord client did not become ready within ${this.readyTimeoutMs} ms.`));
            }, this.readyTimeoutMs);
            this.cancelReadyWait = () => {
                finish(reject, new Error('Discord controller stopped before the client became ready.'));
            };
        });
    }
}

module.exports = DiscordController;
