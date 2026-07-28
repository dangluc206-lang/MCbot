'use strict';

const { EmbedBuilder } = require('discord.js');
const Colors = require('../constants/DiscordColors');
const formatDuration = require('../utils/formatDuration');
const formatPosition = require('../utils/formatPosition');
const truncate = require('../utils/truncate');

/** Creates the live embed shown in the Discord control channel. */
module.exports = function createDashboardEmbed(ctx) {
    const state = ctx.runtime.state;
    const minecraft = ctx.config.minecraft || {};
    const inventory = ctx.getService('inventory');
    const usedSlots = Math.max(0, 36 - (inventory?.countEmptySlots?.() ?? state.inventory.emptySlots ?? 36));
    const storageGui = state.storage?.gui;
    const storageCapacity = storageGui?.totalSegments > 0
        ? `${storageGui.filledSegments}/${storageGui.totalSegments} (${Math.round(storageGui.filledSegments / storageGui.totalSegments * 100)}%)`
        : 'Chưa nhận diện';
    const storageStatus = storageGui?.updatedAt
        ? `Dung lượng: ${storageCapacity}\nTiêu đề: ${truncate(storageGui.title || 'Không có', 80)}\nÔ có item: ${storageGui.usedSlots}/${storageGui.totalSlots}\nCập nhật: <t:${Math.floor(storageGui.updatedAt / 1000)}:R>`
        : 'Chưa mở /kho trong phiên kết nối này.';
    const lastError = state.engine.lastError?.message || 'Không có';
    const uptime = state.startedAt ? formatDuration(Date.now() - state.startedAt) : '—';

    return new EmbedBuilder()
        .setColor(state.bot.connected ? Colors.SUCCESS : Colors.ERROR)
        .setTitle('Minecraft Bot Dashboard')
        .addFields(
            { name: 'Kết nối', value: `**${state.bot.connected ? 'Online' : 'Offline'}**\n${minecraft.username || '—'} @ ${minecraft.host || '—'}\nVersion: ${minecraft.version || 'auto'}`, inline: true },
            { name: 'Người chơi', value: `HP: ${state.player.health ?? '?'}/20\nFood: ${state.player.food ?? '?'}/20\nLevel: ${state.player.level ?? 0}\n${formatPosition(state.player.position)}`, inline: true },
            { name: 'Tự động hóa', value: `Mode: ${state.mode.current || 'Không có'}\nState: ${state.mode.state}\nSkyBlock: ${state.skyblock.joined ? 'Đã vào' : 'Chưa vào'}\nInventory: ${usedSlots}/36`, inline: true },
            { name: 'Kho NPC', value: storageStatus, inline: true },
            { name: 'Hệ thống', value: `Engine: ${state.engine.state}\nUptime: ${uptime}\nReconnect: ${state.metrics.reconnects || 0}\nRAM: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`, inline: true },
            { name: 'Lỗi gần nhất', value: truncate(lastError, 512), inline: false }
        )
        .setFooter({ text: `Process uptime: ${formatDuration(process.uptime() * 1000)}` })
        .setTimestamp();
};
