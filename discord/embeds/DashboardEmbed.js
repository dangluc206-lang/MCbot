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
    const storageProbe = state.storage?.lastGuiProbe;
    const storageNumbers = storageGui?.detail?.storage || {};
    const storageStatus = storageGui?.updatedAt
        ? Number.isFinite(storageNumbers.free)
            ? `Còn trống: **${storageNumbers.free.toLocaleString('vi-VN')}**\nCập nhật: <t:${Math.floor(storageGui.updatedAt / 1000)}:R>`
            : `Chưa đọc được “Còn trống”.\nCập nhật: <t:${Math.floor(storageGui.updatedAt / 1000)}:R>`
        : storageProbe?.updatedAt
            ? `Chưa đọc được /kho (${storageProbe.status}).\nLần thử: <t:${Math.floor(storageProbe.updatedAt / 1000)}:R>`
            : 'Chưa mở /kho trong phiên kết nối này.';
    const personalVault = state.personalVault || {};
    const vaultItems = Array.isArray(personalVault.items) ? personalVault.items : [];
    const vaultItemCount = vaultItems.reduce((total, item) => total + (Number(item.count) || 0), 0);
    const personalVaultStatus = personalVault.updatedAt
        ? [
            `Đã đọc: ${vaultItems.length} stack • ${vaultItemCount.toLocaleString('vi-VN')} item`,
            `Cập nhật: <t:${Math.floor(personalVault.updatedAt / 1000)}:R>`
        ].join('\n')
        : 'Chưa đọc /pv 2 trong phiên kết nối này.';
    const lastError = state.engine.lastError?.message || 'Không có';
    const uptime = state.startedAt ? formatDuration(Date.now() - state.startedAt) : '—';
    const crafting = state.crafting || {};
    const craftingStatus = crafting.totalActions > 0
        ? `Chế tạo: ${crafting.status} (${crafting.completedActions || 0}/${crafting.totalActions})${crafting.targetName ? `\nMục tiêu: ${crafting.targetName} x${crafting.targetCount}` : ''}`
        : 'Chế tạo: chưa có kế hoạch';
    const missingMaterials = (crafting.materials || []).filter(material => !material.enough);
    const craftingStorageStatus = crafting.materials?.length
        ? missingMaterials.length === 0
            ? 'Kho SHK: đủ nguyên liệu'
            : `Kho SHK: thiếu ${truncate(missingMaterials.map(material => material.item).join(', '), 150)}`
        : 'Kho SHK: chưa kiểm tra';

    const coreLedger = (crafting.materialLedger?.entries || [])
        .filter(item => [30, 31, 32, 33].includes(Number(item.slot)))
        .map(item => `${item.name}: ${Number(item.total || 0).toLocaleString('vi-VN')}`)
        .join('\n');
    const nextCraftAt = Number(crafting.nextTargetAttemptAt);
    const nextCraft = Number.isFinite(nextCraftAt) && nextCraftAt > Date.now()
        ? `<t:${Math.floor(nextCraftAt / 1000)}:R>`
        : 'Sẵn sàng kiểm tra';
    const storageThreshold = Number(ctx.config.storage?.autoSellFreeThreshold ?? 150000);
    const storageAutomation = Number.isFinite(storageThreshold)
        ? `Bán khi còn ≤ ${storageThreshold.toLocaleString('vi-VN')} chỗ`
        : 'Ngưỡng bán chưa hợp lệ';

    return new EmbedBuilder()
        .setColor(state.bot.connected ? Colors.SUCCESS : Colors.ERROR)
        .setTitle('Minecraft Bot Dashboard')
        .addFields(
            { name: 'Kết nối', value: `**${state.bot.connected ? 'Online' : 'Offline'}**\n${minecraft.username || '—'} @ ${minecraft.host || '—'}\nVersion: ${minecraft.version || 'auto'}`, inline: true },
            { name: 'Người chơi', value: `HP: ${state.player.health ?? '?'}/20\nFood: ${state.player.food ?? '?'}/20\nLevel: ${state.player.level ?? 0}\n${formatPosition(state.player.position)}`, inline: true },
            { name: 'Tự động hóa', value: `Mode: ${state.mode.current || 'Không có'}\nState: ${state.mode.state}\nSkyBlock: ${state.skyblock.joined ? 'Đã vào' : 'Chưa vào'}\nNhặt được: ${state.collector?.collected || 0}\nInventory: ${usedSlots}/36\n${craftingStatus}\n${craftingStorageStatus}`, inline: true },
            { name: 'Kho NPC', value: storageStatus, inline: true },
            { name: 'Kho cá nhân (/pv 2)', value: truncate(personalVaultStatus, 1024), inline: true },
            { name: 'Hệ thống', value: `Engine: ${state.engine.state}\nUptime: ${uptime}\nReconnect: ${state.metrics.reconnects || 0}\nRAM: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`, inline: true },
            { name: 'Lỗi gần nhất', value: truncate(lastError, 512), inline: false }
        )
        .addFields({
            name: 'Ledger SHK',
            value: truncate(`${coreLedger || 'Chưa đọc vật liệu SHK.'}\nLượt SHK tiếp: ${nextCraft}\n${storageAutomation}`, 1024),
            inline: true
        })
        .setFooter({ text: `Process uptime: ${formatDuration(process.uptime() * 1000)}` })
        .setTimestamp();
};
