'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Permission = require('../../constants/DiscordPermission');
const CustomId = require('../../constants/DiscordCustomId');
const dashboardEmbed = require('../../embeds/DashboardEmbed');

function panelPayload(ctx, notice = 'Chọn thao tác để điều khiển Minecraft bot.') {
    return {
        content: notice,
        embeds: [dashboardEmbed(ctx)],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(CustomId.PANEL_REFRESH).setLabel('Làm mới').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(CustomId.PANEL_CONNECT).setLabel('Kết nối MC').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(CustomId.PANEL_JOIN_12).setLabel('Join SkyBlock').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(CustomId.PANEL_ISLAND).setLabel('Về đảo').setStyle(ButtonStyle.Secondary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(CustomId.PANEL_COLLECTOR).setLabel('Nhặt + SHK').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(CustomId.PANEL_DUNGEON).setLabel('Dungeon').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(CustomId.PANEL_FISHING).setLabel('Câu cá').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(CustomId.PANEL_STOP).setLabel('Dừng mode').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(CustomId.PANEL_PAUSE).setLabel('Tạm dừng').setStyle(ButtonStyle.Secondary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(CustomId.PANEL_RESUME).setLabel('Tiếp tục mode').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(CustomId.PANEL_STORAGE_SELL).setLabel('Bán kho NPC').setStyle(ButtonStyle.Danger)
            )
        ]
    };
}

function updatePanel(ctx, interaction, notice) {
    const payload = panelPayload(ctx, notice);
    return interaction.deferred ? interaction.editReply(payload) : interaction.update(payload);
}

function modeAction(mode) {
    return {
        permission: Permission.ADMIN, cooldown: 3, minecraftRequired: true, defer: true,
        async execute(ctx, interaction) {
            const result = await ctx.getManager('mode').start(mode);
            return updatePanel(ctx, interaction, `${mode}: ${result}`);
        }
    };
}

module.exports = {
    panelPayload,
    handlers: [
        [CustomId.PANEL_REFRESH, { permission: Permission.VIEWER, cooldown: 2, async execute(ctx, interaction) { return interaction.update(panelPayload(ctx, 'Đã cập nhật trạng thái.')); } }],
        [CustomId.PANEL_CONNECT, { permission: Permission.ADMIN, cooldown: 10, defer: true, async execute(ctx, interaction) { const result = await ctx.getService('lifecycle').connect({ force: true, source: 'discord-control-panel' }); return updatePanel(ctx, interaction, `Kết nối Minecraft ưu tiên: ${result}`); } }],
        [CustomId.PANEL_JOIN_12, { permission: Permission.ADMIN, cooldown: 5, minecraftRequired: true, defer: true, async execute(ctx, interaction) { const result = await ctx.getService('skyblock').startJoin('discord-panel'); return updatePanel(ctx, interaction, `Vào SkyBlock: ${result}`); } }],
        [CustomId.PANEL_ISLAND, { permission: Permission.ADMIN, cooldown: 5, minecraftRequired: true, defer: true, async execute(ctx, interaction) { const result = await ctx.getService('skyblock').goToIsland(); return updatePanel(ctx, interaction, `Về đảo: ${result}`); } }],
        [CustomId.PANEL_COLLECTOR, modeAction('collector')],
        [CustomId.PANEL_DUNGEON, modeAction('dungeon')],
        [CustomId.PANEL_FISHING, modeAction('fishing')],
        [CustomId.PANEL_SUPER_ALLOY, modeAction('super-alloy')],
        [CustomId.PANEL_STORAGE_SELL, { permission: Permission.ADMIN, cooldown: 5, minecraftRequired: true, defer: true, async execute(ctx, interaction) { const result = await ctx.getService('storage').sellStorage(); return updatePanel(ctx, interaction, `Bán kho NPC: ${result}`); } }],
        [CustomId.PANEL_STOP, { permission: Permission.ADMIN, cooldown: 3, minecraftRequired: true, defer: true, async execute(ctx, interaction) { const result = await ctx.getManager('mode').stop(); return updatePanel(ctx, interaction, `Dừng mode: ${result}`); } }],
        [CustomId.PANEL_PAUSE, { permission: Permission.MODERATOR, cooldown: 3, minecraftRequired: true, defer: true, async execute(ctx, interaction) { const result = await ctx.getManager('mode').pause(); return updatePanel(ctx, interaction, `Tạm dừng mode: ${result}`); } }],
        [CustomId.PANEL_RESUME, { permission: Permission.MODERATOR, cooldown: 3, minecraftRequired: true, defer: true, async execute(ctx, interaction) { const result = await ctx.getManager('mode').resume(); return updatePanel(ctx, interaction, `Tiếp tục mode: ${result}`); } }]
    ],
    select: []
};
