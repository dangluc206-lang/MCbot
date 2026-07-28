'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const CustomId = require('./constants/DiscordCustomId');

const ORES = ['coal_ore', 'iron_ore', 'copper_ore', 'gold_ore', 'redstone_ore', 'lapis_ore', 'diamond_ore', 'emerald_ore', 'coal_block', 'iron_block', 'copper_block', 'gold_block', 'redstone_block', 'lapis_block', 'diamond_block', 'emerald_block'];
const SLOTS = ['11', '12', '13', '14', '15', '16', '19', '21'];

function payload(ctx, notice = 'Thay đổi được lưu vào config.json.') {
    const config = ctx.config;
    const selected = config.storage.selectedOres || [];
    return { content: notice, embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('Bot Configuration').setDescription(`SkyBlock: slot ${config.skyblock.serverSlot}\nDungeon: slot ${config.dungeon.entrySlot}\nFishing slots: ${(config.fishing.afkSlots || []).join(', ')}\nOre: ${selected.join(', ') || 'chưa chọn'}`)], components: [
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(CustomId.CONFIG_SKYBLOCK).setPlaceholder('SkyBlock server slot').addOptions(SLOTS.map(slot => ({ label: `Slot ${slot}`, value: slot, default: Number(slot) === config.skyblock.serverSlot })))),
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(CustomId.CONFIG_DUNGEON).setPlaceholder('Dungeon entry slot').addOptions(SLOTS.map(slot => ({ label: `Slot ${slot}`, value: slot, default: Number(slot) === config.dungeon.entrySlot })))),
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(CustomId.CONFIG_FISHING).setPlaceholder('Fishing AFK slots').setMinValues(1).setMaxValues(3).addOptions(['11', '13', '15'].map(slot => ({ label: `Slot ${slot}`, value: slot, default: (config.fishing.afkSlots || []).includes(Number(slot)) })))),
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(CustomId.CONFIG_ORES).setPlaceholder('Ore/block được bán').setMinValues(0).setMaxValues(ORES.length).addOptions(ORES.map(ore => ({ label: ore.replace(/_/g, ' '), value: ore, default: selected.includes(ore) })))),
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(CustomId.CONFIG_COORDS).setLabel('Sửa tọa độ Fishing').setStyle(ButtonStyle.Primary))
    ] };
}

class ConfigPanelManager {
    constructor(ctx, client) { this.ctx = ctx; this.client = client; this.message = null; }
    async start() {
        const channelId = this.ctx.config.discord.configChannelId;
        if (!channelId) return;
        const channel = await this.client.channels.fetch(channelId);
        if (!channel?.isTextBased?.()) throw new Error('Discord config channel is not text based.');
        this.message = await channel.send(payload(this.ctx, 'Bảng cấu hình — chỉ Owner/Admin được chỉnh.'));
    }
    updateContext(ctx) { this.ctx = ctx; }
    stop() { this.message = null; }
}

module.exports = { ConfigPanelManager, payload, ORES };
