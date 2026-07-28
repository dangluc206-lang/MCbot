'use strict';

const { Client, Events: DiscordEvents, GatewayIntentBits } = require('discord.js');
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
    constructor(ctx) {
        if (!ctx) throw new Error('DiscordController requires Context.');
        this.ctx = ctx;
        this.client = null;
        this.started = false;
        this.registry = new DiscordCommandRegistry();
        this.inventorySessions = new InventorySessionManager();
        this.confirmations = new ConfirmationManager();
        this.permissions = new DiscordPermissionManager(ctx.config.discord || {});
        this.cooldown = new Cooldown();
        this.router = new DiscordInteractionRouter({
            getContext: () => this.ctx,
            registry: this.registry,
            permissions: this.permissions,
            cooldown: this.cooldown
        });
        this.boundInteraction = interaction => this.router.handle(interaction);
        this.notifications = null;
        this.controlPanel = null;
        this.configPanel = null;
        this.loadContracts();
    }

    loadContracts() {
        [pingCommand, helpCommand, statusCommand, panelCommand, startCommand, stopCommand, restartCommand, shutdownCommand, modeCommand, chatCommand, minecraftCommand, positionCommand, healthCommand, playersCommand, reconnectCommand, gotoCommand, followCommand, lookCommand, jumpCommand, movementStopCommand, inventoryCommand, useCommand, equipCommand, swapCommand, dropCommand, logsCommand, errorsCommand, warningsCommand, configCommand, viewCommand, viewerCommand].forEach(command => this.registry.register(command));
        for (const [customId, handler] of dashboardButton.handlers) this.registry.registerButton(customId, handler);
        for (const [customId, handler] of dashboardButton.selects) this.registry.registerSelect(customId, handler);
        for (const [customId, handler] of shutdownButtons) this.registry.registerButton(customId, handler);
        this.registry.registerButton(...movementStopButton);
        for (const [customId, handler] of configHandlers.buttons) this.registry.registerButton(customId, handler);
        for (const [customId, handler] of configHandlers.modals) this.registry.registerModal(customId, handler);
        for (const [customId, handler] of configHandlers.selects) this.registry.registerSelect(customId, handler);
        for (const [customId, handler] of controlPanel.handlers) this.registry.registerButton(customId, handler);
        this.registry.registerSelect(...controlPanel.select);
        this.registry.registerButtonMatcher(id => /^inventory:(prev|next|refresh|close):[a-z0-9]+$/.test(id), inventoryCommand.componentHandler);
        this.registry.registerButtonMatcher(id => /^confirm:(drop|cancel):[a-z0-9]+$/.test(id), dropCommand.componentHandler);
    }

    async updateContext(ctx) {
        if (!ctx) throw new Error('DiscordController requires a valid Context.');
        this.notifications?.stop();
        this.ctx = ctx;
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
        if (this.started) return;
        const token = this.ctx.config.discord?.token;
        if (!token) throw new Error('Discord token is required when Discord is enabled.');
        this.ctx.discordController = this;
        this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
        this.client.mcbotController = this;
        const ready = new Promise(resolve => this.client.once(DiscordEvents.ClientReady, client => {
            this.ctx.logger?.success(`[DiscordController] Online as ${client.user.tag}.`);
            resolve();
        }));
        this.client.on(DiscordEvents.InteractionCreate, this.boundInteraction);
        this.client.on(DiscordEvents.Error, error => this.ctx.errorHandler?.handle(error, { phase: 'discord.client' }));
        await this.client.login(token);
        await ready;
        this.notifications = new DiscordNotificationService(this.ctx, this.client);
        await this.notifications.start();
        this.controlPanel = new ControlPanelManager(this.ctx, this.client);
        await this.controlPanel.start();
        this.configPanel = new ConfigPanelManager(this.ctx, this.client);
        await this.configPanel.start();
        this.started = true;
    }

    async stop() {
        if (!this.started) return;
        this.client?.removeListener(DiscordEvents.InteractionCreate, this.boundInteraction);
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
        this.started = false;
    }
}

module.exports = DiscordController;
