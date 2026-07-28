'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Permission = require('../../constants/DiscordPermission');
const CustomId = require('../../constants/DiscordCustomId');
const dashboardEmbed = require('../../embeds/DashboardEmbed');

function oreOptions(ctx) {
    const defaults = ['coal_ore', 'iron_ore', 'copper_ore', 'gold_ore', 'redstone_ore', 'lapis_ore', 'diamond_ore', 'emerald_ore', 'coal_block', 'iron_block', 'copper_block', 'gold_block', 'redstone_block', 'lapis_block', 'diamond_block', 'emerald_block'];
    return [...new Set(ctx.config.storage?.oreOptions || defaults)].slice(0, 25);
}

function panelPayload(ctx, notice = 'Chọn thao tác để điều khiển Minecraft bot.') {
    const selected = ctx.getService('storage').getSelectedOres();
    return {
        content: notice,
        embeds: [dashboardEmbed(ctx)],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(CustomId.PANEL_REFRESH).setLabel('Làm mới').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(CustomId.PANEL_CONNECT).setLabel('Kết nối MC').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(CustomId.PANEL_JOIN_12).setLabel('SkyBlock 12').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(CustomId.PANEL_JOIN_14).setLabel('SkyBlock 14').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(CustomId.PANEL_ISLAND).setLabel('Về đảo').setStyle(ButtonStyle.Secondary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(CustomId.PANEL_COLLECTOR).setLabel('Collector').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(CustomId.PANEL_DUNGEON).setLabel('Dungeon').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(CustomId.PANEL_FISHING).setLabel('Câu cá').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(CustomId.PANEL_STOP).setLabel('Dừng mode').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(CustomId.PANEL_PAUSE).setLabel('Tạm dừng').setStyle(ButtonStyle.Secondary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(CustomId.PANEL_RESUME).setLabel('Tiếp tục mode').setStyle(ButtonStyle.Primary)
            ),
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId(CustomId.PANEL_ORES).setPlaceholder('Chọn ore/block được phép bán').setMinValues(0).setMaxValues(oreOptions(ctx).length)
                    .addOptions(oreOptions(ctx).map(ore => ({ label: ore.replace(/_/g, ' '), value: ore, default: selected.includes(ore) })))
            )
        ]
    };
}

function modeAction(mode) {
    return {
        permission: Permission.ADMIN, cooldown: 3, minecraftRequired: true,
        async execute(ctx, interaction) {
            const result = await ctx.getManager('mode').start(mode);
            return interaction.update(panelPayload(ctx, `${mode}: ${result}`));
        }
    };
}

module.exports = {
    panelPayload,
    handlers: [
        [CustomId.PANEL_REFRESH, { permission: Permission.VIEWER, cooldown: 2, async execute(ctx, interaction) { return interaction.update(panelPayload(ctx, 'Đã cập nhật trạng thái.')); } }],
        [CustomId.PANEL_CONNECT, { permission: Permission.ADMIN, cooldown: 10, async execute(ctx, interaction) { const result = await ctx.getService('lifecycle').connect(); return interaction.update(panelPayload(ctx, `Kết nối Minecraft: ${result}`)); } }],
        [CustomId.PANEL_JOIN_12, { permission: Permission.ADMIN, cooldown: 5, minecraftRequired: true, async execute(ctx, interaction) { const result = await ctx.getService('skyblock').startJoin('discord-panel-12', { serverSlot: 12 }); return interaction.update(panelPayload(ctx, `Vào SkyBlock slot 12: ${result}`)); } }],
        [CustomId.PANEL_JOIN_14, { permission: Permission.ADMIN, cooldown: 5, minecraftRequired: true, async execute(ctx, interaction) { const result = await ctx.getService('skyblock').startJoin('discord-panel-14', { serverSlot: 14 }); return interaction.update(panelPayload(ctx, `Vào SkyBlock slot 14: ${result}`)); } }],
        [CustomId.PANEL_ISLAND, { permission: Permission.ADMIN, cooldown: 5, minecraftRequired: true, async execute(ctx, interaction) { const result = await ctx.getService('skyblock').goToIsland(); return interaction.update(panelPayload(ctx, `Về đảo: ${result}`)); } }],
        [CustomId.PANEL_COLLECTOR, modeAction('collector')],
        [CustomId.PANEL_DUNGEON, modeAction('dungeon')],
        [CustomId.PANEL_FISHING, modeAction('fishing')],
        [CustomId.PANEL_STOP, { permission: Permission.ADMIN, cooldown: 3, minecraftRequired: true, async execute(ctx, interaction) { const result = await ctx.getManager('mode').stop(); return interaction.update(panelPayload(ctx, `Dừng mode: ${result}`)); } }],
        [CustomId.PANEL_PAUSE, { permission: Permission.MODERATOR, cooldown: 3, minecraftRequired: true, async execute(ctx, interaction) { const result = await ctx.getManager('mode').pause(); return interaction.update(panelPayload(ctx, `Tạm dừng mode: ${result}`)); } }],
        [CustomId.PANEL_RESUME, { permission: Permission.MODERATOR, cooldown: 3, minecraftRequired: true, async execute(ctx, interaction) { const result = await ctx.getManager('mode').resume(); return interaction.update(panelPayload(ctx, `Tiếp tục mode: ${result}`)); } }]
    ],
    select: [CustomId.PANEL_ORES, {
        permission: Permission.ADMIN, cooldown: 3,
        async execute(ctx, interaction) {
            ctx.getService('storage').setSelectedOres(interaction.values);
            return interaction.update(panelPayload(ctx, `Đã chọn ${interaction.values.length} loại ore/block để bán.`));
        }
    }]
};
