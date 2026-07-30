'use strict';

const { panelPayload } = require('./components/buttons/control-panel.button');
const Events = require('../core/constants/Events');

const MIN_REFRESH_INTERVAL_MS = 1000;
const MAX_REFRESH_INTERVAL_MS = 60000;

/**
 * Prevent a malformed configuration from creating a tight Discord edit loop.
 * The panel is informational, so a one-minute cap is still sufficiently live
 * while avoiding accidental API-rate-limit pressure.
 *
 * @param {*} value configured interval
 * @returns {number}
 */
function normalizeRefreshInterval(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 5000;
    return Math.max(MIN_REFRESH_INTERVAL_MS, Math.min(MAX_REFRESH_INTERVAL_MS, Math.floor(parsed)));
}

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
        this.started = false;
        this.intervalMs = null;
    }

    async start() {
        if (this.started) return;

        const channelId = this.ctx.config.discord?.controlChannelId;
        if (!channelId) return;

        this.channel = await this.client.channels.fetch(channelId);
        if (!this.channel?.isTextBased?.()) {
            throw new Error('Discord control channel is not text based.');
        }

        await this._ensureMessage();

        this.intervalMs = normalizeRefreshInterval(this.ctx.config.discord?.liveStatusIntervalMs);
        this.timer = setInterval(() => {
            this.refresh().catch(error => this.ctx.errorHandler?.handle(error, { phase: 'discord.control-panel' }));
        }, this.intervalMs);
        this.timer.unref?.();

        this.onGuiOpen = () => {
            this.refresh().catch(error => this.ctx.errorHandler?.handle(error, { phase: 'discord.control-panel.gui' }));
        };
        this._bindGuiEvents();
        this.started = true;
    }

    async refresh() {
        if (!this.message || this.refreshing) return;

        this.refreshing = true;
        try {
            await this.message.edit(panelPayload(this.ctx, 'Bảng điều khiển chính — tự cập nhật.'));
        } catch (error) {
            if (![10008, 10003].includes(error?.code)) throw error;
            this.message = null;
            await this._ensureMessage();
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
        this.started = false;
        this.intervalMs = null;
        this.message = null;
        this.channel = null;
    }

    _bindGuiEvents() {
        if (!this.onGuiOpen) return;
        this.eventManager = this.ctx.getManager('events');
        this.eventManager?.on?.(Events.GUI.OPEN, this.onGuiOpen);
    }

    async _ensureMessage() {
        if (!this.channel) return null;
        const recent = await this.channel.messages.fetch({ limit: 25 });
        const messages = typeof recent?.find === 'function'
            ? recent
            : [...(recent?.values?.() || [])];
        this.message = messages.find(message => (
            message.author.id === this.client.user.id
            && message.embeds.some(embed => embed.title === 'Minecraft Bot Dashboard')
        )) || null;
        if (!this.message) {
            this.message = await this.channel.send(panelPayload(this.ctx, 'Bảng điều khiển chính.'));
        }
        return this.message;
    }
}

module.exports = ControlPanelManager;
module.exports.normalizeRefreshInterval = normalizeRefreshInterval;
