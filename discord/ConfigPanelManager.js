'use strict';

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder
} = require('discord.js');
const CustomId = require('./constants/DiscordCustomId');

const DEFAULT_ORES = Object.freeze([
    'COAL_BLOCK', 'COAL', 'COBBLESTONE', 'DIAMOND', 'DIAMOND_BLOCK',
    'EMERALD', 'EMERALD_BLOCK', 'GOLD_BLOCK', 'GOLD_INGOT', 'IRON_BLOCK',
    'IRON_INGOT', 'LAPIS_LAZULI','LAPIS_BLOCK', 'RAW_GOLD', 'RAW_IRON', 'REDSTONE',
    'REDSTONE_BLOCK', 'STONE'
]);
const SKYBLOCK_SLOTS = Object.freeze(['12', '14']);
const DUNGEON_SLOTS = Object.freeze(['11', '12', '13', '14', '15', '16', '19', '21']);
const FISHING_SLOTS = Object.freeze(['11', '13', '15']);

function normalizeOre(value) {
    return String(value || '').trim().toUpperCase();
}

function option(label, value, selected) {
    return { label, value, default: selected };
}

/** Creates the single persistent, gameplay-only configuration panel. */
function payload(ctx, notice = 'Các thay đổi gameplay được lưu vào config.json.') {
    const config = ctx.config;
    const selected = (config.storage?.selectedOres || []).map(normalizeOre);
    const ores = [...new Set((config.storage?.oreOptions || DEFAULT_ORES).map(normalizeOre).filter(Boolean))].slice(0, 25);
    const storage = ctx.runtime.state.storage;
    const storageNumbers = storage.gui?.detail?.storage || {};
    const capacity = Number.isFinite(storageNumbers.free)
        ? `còn ${storageNumbers.free.toLocaleString('vi-VN')}/${Number.isFinite(storageNumbers.total) ? storageNumbers.total.toLocaleString('vi-VN') : '?'} `
        : 'chưa đọc tooltip slot 49';

    const embed = new EmbedBuilder()
        .setColor(0x95a5a6)
        .setTitle('Bot Configuration')
        .setDescription([
            `SkyBlock slot: ${config.skyblock?.serverSlot ?? '—'} | Dungeon slot: ${config.dungeon?.entrySlot ?? '—'}`,
            `Fishing slots: ${(config.fishing?.afkSlots || []).join(', ') || '—'}`,
            `SHK: slot ${config.crafting?.targetSlot ?? 33} | nung raw x${config.storage?.smelting?.passes ?? 2} (slot ${config.storage?.smelting?.menuSlot ?? 12}) | đổi khối/phôi (slot ${config.storage?.conversion?.menuSlot ?? 10}) | /ks slot ${config.crafting?.entrySlot ?? 16}`,
            `PV 2: ${config.crafting?.personalVault?.enabled === false ? 'tắt' : 'bật'} | cất SHK: ${config.crafting?.personalVault?.depositAfterCraft === false ? 'tắt' : 'bật'} | Craft click: ${config.crafting?.clickIntervalMs ?? 500} ms | retry: ${config.crafting?.clickAckMaxRetries ?? 2}`,
            `Nhặt: ${config.collector?.pickupPosition ? JSON.stringify(config.collector.pickupPosition) : 'mặc định'} | tạo SHK khi đủ nguyên liệu thô | SHK ${config.collector?.superAlloyEnabled === false ? 'tắt' : 'bật'}`,
            `Kho NPC: ${capacity} | Ore bán khi thiếu chỗ: ${selected.join(', ') || 'chưa chọn'}`,
            'Nút **Sửa config** nhận path gameplay và giá trị JSON; Discord/token/password luôn chỉ dùng .env.'
            ,`SHK cooldown: ${config.collector?.superAlloyIntervalMs ?? 3600000} ms | retry: ${config.collector?.superAlloyRetryIntervalMs ?? 120000} ms`,
            `Kho tự bán khi còn ≤ ${config.storage?.autoSellFreeThreshold ?? 150000} | Alias SHK: ${Object.keys(config.crafting?.materialAliases || {}).length} mục`,
            'Sửa trực tiếp bằng path: storage.autoSellFreeThreshold, collector.superAlloyIntervalMs, collector.superAlloyRetryIntervalMs, crafting.clickAckMaxRetries, crafting.clickAckRetryDelayMs, crafting.materialAliases.<slot>.'
        ].join('\n'));

    return {
        content: notice,
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(CustomId.CONFIG_SKYBLOCK)
                    .setPlaceholder('SkyBlock server slot')
                    .addOptions(SKYBLOCK_SLOTS.map(slot => option(`Slot ${slot}`, slot, Number(slot) === config.skyblock?.serverSlot))),
                new StringSelectMenuBuilder()
                    .setCustomId(CustomId.CONFIG_DUNGEON)
                    .setPlaceholder('Dungeon entry slot')
                    .addOptions(DUNGEON_SLOTS.map(slot => option(`Slot ${slot}`, slot, Number(slot) === config.dungeon?.entrySlot)))
            ),
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(CustomId.CONFIG_FISHING)
                    .setPlaceholder('Fishing AFK slots')
                    .setMinValues(1)
                    .setMaxValues(FISHING_SLOTS.length)
                    .addOptions(FISHING_SLOTS.map(slot => option(`Slot ${slot}`, slot, (config.fishing?.afkSlots || []).includes(Number(slot)))))
            ),
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(CustomId.CONFIG_ORES)
                    .setPlaceholder('Ore/block được bán khi kho đầy')
                    .setMinValues(0)
                    .setMaxValues(ores.length)
                    .addOptions(ores.map(ore => option(ore.replace(/_/g, ' '), ore, selected.includes(ore))))
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(CustomId.CONFIG_COORDS).setLabel('Sửa tọa độ Fishing').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(CustomId.CONFIG_EDIT).setLabel('Sửa config').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(CustomId.CONFIG_REFRESH).setLabel('Làm mới').setStyle(ButtonStyle.Secondary)
            )
        ]
    };
}

class ConfigPanelManager {
    constructor(ctx, client) {
        this.ctx = ctx;
        this.client = client;
        this.channel = null;
        this.message = null;
    }

    async start() {
        const channelId = this.ctx.config.discord?.configChannelId;
        if (!channelId) return;

        this.channel = await this.client.channels.fetch(channelId);
        if (!this.channel?.isTextBased?.()) throw new Error('Discord config channel is not text based.');

        await this._ensureMessage();
    }

    async refresh(notice = 'Cấu hình gameplay đã được cập nhật.') {
        if (!this.message) await this._ensureMessage();
        if (!this.message) return null;
        try {
            await this.message.edit(payload(this.ctx, notice));
        } catch (error) {
            if (![10008, 10003].includes(error?.code)) throw error;
            this.message = null;
            await this._ensureMessage();
        }
        return this.message;
    }

    async _ensureMessage() {
        if (!this.channel) return null;
        const recent = await this.channel.messages.fetch({ limit: 25 });
        const messages = typeof recent?.find === 'function'
            ? recent
            : [...(recent?.values?.() || [])];
        this.message = messages.find(message => (
            message.author.id === this.client.user.id
            && message.embeds.some(embed => embed.title === 'Bot Configuration')
        )) || null;
        if (!this.message) {
            this.message = await this.channel.send(payload(this.ctx, 'Bảng cấu hình gameplay — chỉ Owner/Admin được chỉnh.'));
        }
        return this.message;
    }

    updateContext(ctx) {
        this.ctx = ctx;
    }

    stop() {
        this.message = null;
        this.channel = null;
    }
}

module.exports = { ConfigPanelManager, payload, DEFAULT_ORES };
