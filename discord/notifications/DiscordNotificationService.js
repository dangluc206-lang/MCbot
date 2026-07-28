'use strict';

const { EmbedBuilder } = require('discord.js');
const Events = require('../../core/constants/Events');
const Colors = require('../constants/DiscordColors');
const truncate = require('../utils/truncate');

/** Sends deduplicated framework events to a configured Discord notification channel. */
class DiscordNotificationService {
    constructor(ctx, client) {
        this.ctx = ctx;
        this.client = client;
        this.channelId = process.env.DISCORD_NOTIFICATION_CHANNEL_ID || ctx.config.discord?.notificationChannelId || '';
        this.errorChannelId = process.env.DISCORD_ERROR_CHANNEL_ID || ctx.config.discord?.errorChannelId || '';
        this.bindings = [];
        this.recent = new Map();
        this.channel = null;
        this.errorChannel = null;
    }

    async start() {
        if (!this.channelId) return;
        this.channel = await this.client.channels.fetch(this.channelId);
        if (!this.channel?.isTextBased?.()) throw new Error('Discord notification channel is not text based.');
        if (this.errorChannelId) {
            this.errorChannel = await this.client.channels.fetch(this.errorChannelId);
            if (!this.errorChannel?.isTextBased?.()) throw new Error('Discord error channel is not text based.');
        }
        const events = this.ctx.getManager('events');
        const bind = (event, title, color, text) => {
            const handler = (...args) => this.notify(event, title, color, text(...args));
            events.on(event, handler);
            this.bindings.push({ event, handler });
        };
        bind(Events.Connection.READY, 'Minecraft sẵn sàng', Colors.SUCCESS, () => 'Bot đã spawn và sẵn sàng.');
        bind(Events.Connection.ENDED, 'Minecraft mất kết nối', Colors.WARNING, reason => `Kết nối đóng: ${String(reason || 'không rõ')}`);
        bind(Events.Connection.KICKED, 'Minecraft bị kick', Colors.ERROR, reason => `Lý do: ${String(reason || 'không rõ')}`);
        bind(Events.Connection.ERROR, 'Lỗi kết nối', Colors.ERROR, error => String(error?.message || error));
        bind(Events.Player.DEATH, 'Bot đã chết', Colors.ERROR, () => 'Mineflayer báo bot đã chết.');
        bind(Events.Inventory.FULL, 'Inventory đầy', Colors.WARNING, () => 'Inventory bot đã đầy.');
        bind(Events.Movement.FAILED, 'Di chuyển thất bại', Colors.WARNING, () => 'Pathfinder không tìm được đường.');
        bind(Events.Engine.ERROR, 'Lỗi framework', Colors.ERROR, error => String(error?.message || error));
        bind(Events.Mode.START, 'Mode bắt đầu', Colors.SUCCESS, name => `Mode ${name} đã bắt đầu.`);
        bind(Events.Mode.STOP, 'Mode dừng', Colors.WARNING, name => `Mode ${name} đã dừng.`);
        bind(Events.Mode.PAUSE, 'Mode tạm dừng', Colors.WARNING, name => `Mode ${name} đã tạm dừng.`);
        bind(Events.Mode.RESUME, 'Mode tiếp tục', Colors.SUCCESS, name => `Mode ${name} tiếp tục.`);
    }

    async notify(key, title, color, description) {
        const now = Date.now();
        if (now - (this.recent.get(key) || 0) < 30000) return;
        this.recent.set(key, now);
        try {
            const destination = color === Colors.ERROR && this.errorChannel ? this.errorChannel : this.channel;
            await destination?.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(truncate(description, 3500)).setTimestamp()] });
        }
        catch (error) {
            this.ctx.errorHandler?.handle(error, { phase: 'discord.notification', key });
        }
    }

    stop() {
        const events = this.ctx.getManager('events');
        for (const binding of this.bindings) events.off(binding.event, binding.handler);
        this.bindings.length = 0;
        this.recent.clear();
    }
}

module.exports = DiscordNotificationService;
