'use strict';

const { panelPayload } = require('./components/buttons/control-panel.button');
const Events = require('../core/constants/Events');

/** Maintains one live control panel message in the configured Discord channel. */
class ControlPanelManager {
    constructor(ctx, client) {
        this.ctx = ctx;
        this.client = client;
        this.channel = null;
        this.message = null;
        this.timer = null;
        this.onGuiOpen = null;
        this.eventManager = null;
        this.refreshing = false;
    }

    async start() {
        const channelId = this.ctx.config.discord?.controlChannelId;
        if (!channelId) return;

        this.channel = await this.client.channels.fetch(channelId);
        if (!this.channel?.isTextBased?.()) {
            throw new Error('Discord control channel is not text based.');
        }

        const recent = await this.channel.messages.fetch({ limit: 25 });
        this.message = recent.find(message => (
            message.author.id === this.client.user.id
            && message.embeds.some(embed => embed.title === 'Minecraft Bot Dashboard')
        )) || null;
        if (!this.message) {
            this.message = await this.channel.send(panelPayload(this.ctx, 'Bảng điều khiển chính.'));
        }

        const interval = this.ctx.config.discord?.liveStatusIntervalMs ?? 5000;
        this.timer = setInterval(() => {
            this.refresh().catch(error => this.ctx.errorHandler?.handle(error, { phase: 'discord.control-panel' }));
        }, interval);
        this.timer.unref?.();

        this.onGuiOpen = () => {
            this.refresh().catch(error => this.ctx.errorHandler?.handle(error, { phase: 'discord.control-panel.gui' }));
        };
        this._bindGuiEvents();
    }

    async refresh() {
        if (!this.message || this.refreshing) return;

        this.refreshing = true;
        try {
            await this.message.edit(panelPayload(this.ctx, 'Bảng điều khiển chính — tự cập nhật.'));
        } catch (error) {
            if (error?.code !== 10062) throw error;
        } finally {
            this.refreshing = false;
        }
    }

    updateContext(ctx) {
        this.eventManager?.off?.(Events.GUI.OPEN, this.onGuiOpen);
        this.ctx = ctx;
        this._bindGuiEvents();
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
        this.eventManager?.off?.(Events.GUI.OPEN, this.onGuiOpen);
        this.timer = null;
        this.onGuiOpen = null;
        this.eventManager = null;
        this.refreshing = false;
        this.message = null;
        this.channel = null;
    }

    _bindGuiEvents() {
        if (!this.onGuiOpen) return;
        this.eventManager = this.ctx.getManager('events');
        this.eventManager?.on?.(Events.GUI.OPEN, this.onGuiOpen);
    }
}

module.exports = ControlPanelManager;
