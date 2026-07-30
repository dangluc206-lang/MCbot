'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { StringSelectMenuBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const CustomId = require('../../constants/DiscordCustomId');
const dashboardEmbed = require('../../embeds/DashboardEmbed');

function dashboardComponents() {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(CustomId.DASHBOARD_REFRESH).setLabel('Làm mới').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CustomId.MODE_START).setLabel('Chạy mode').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(CustomId.MODE_STOP).setLabel('Dừng mode').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(CustomId.MODE_PAUSE).setLabel('Tạm dừng').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CustomId.MODE_RESUME).setLabel('Tiếp tục').setStyle(ButtonStyle.Primary)
    )];
}

function replyDashboard(ctx, interaction) {
    return DiscordResponse.send(interaction, { embeds: [dashboardEmbed(ctx)], components: dashboardComponents() });
}

module.exports = {
    dashboardComponents,
    replyDashboard,
    handlers: [
        [CustomId.DASHBOARD_REFRESH, { permission: Permission.VIEWER, cooldown: 2, async execute(ctx, interaction) { return interaction.update({ embeds: [dashboardEmbed(ctx)], components: dashboardComponents() }); } }],
        [CustomId.MODE_START, { permission: Permission.ADMIN, cooldown: 3, minecraftRequired: true, async execute(ctx, interaction) {
            const modes = ctx.getManager('mode').names();
            return DiscordResponse.send(interaction, { content: 'Chọn mode cần chạy:', ephemeral: true, components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('mode:choose').setPlaceholder('Chọn mode').addOptions(modes.map(name => ({ label: name, value: name }))))] });
        } }],
        [CustomId.MODE_STOP, { permission: Permission.ADMIN, cooldown: 3, minecraftRequired: true, defer: true, async execute(ctx, interaction) { await ctx.getManager('mode').stop(); return interaction.editReply({ embeds: [dashboardEmbed(ctx)], components: dashboardComponents() }); } }],
        [CustomId.MODE_PAUSE, { permission: Permission.MODERATOR, cooldown: 3, minecraftRequired: true, defer: true, async execute(ctx, interaction) { await ctx.getManager('mode').pause(); return interaction.editReply({ embeds: [dashboardEmbed(ctx)], components: dashboardComponents() }); } }],
        [CustomId.MODE_RESUME, { permission: Permission.MODERATOR, cooldown: 3, minecraftRequired: true, defer: true, async execute(ctx, interaction) { await ctx.getManager('mode').resume(); return interaction.editReply({ embeds: [dashboardEmbed(ctx)], components: dashboardComponents() }); } }]
    ],
    selects: [
        ['mode:choose', { permission: Permission.ADMIN, cooldown: 3, minecraftRequired: true, async execute(ctx, interaction) {
            await interaction.deferUpdate();
            const result = await ctx.getManager('mode').start(interaction.values[0]);
            return interaction.editReply({ content: `Khởi động mode: ${result}`, components: [] });
        } }]
    ]
};
