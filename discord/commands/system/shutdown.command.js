'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const CustomId = require('../../constants/DiscordCustomId');

module.exports = {
    data: new SlashCommandBuilder().setName('shutdown').setDescription('Tắt bot an toàn.'),
    group: 'Admin', permission: Permission.OWNER, cooldown: 15,
    async execute(ctx, interaction) {
        return DiscordResponse.send(interaction, { content: 'Xác nhận tắt toàn bộ hệ thống?', ephemeral: true, components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(CustomId.SHUTDOWN_CONFIRM).setLabel('Xác nhận tắt').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(CustomId.SHUTDOWN_CANCEL).setLabel('Hủy').setStyle(ButtonStyle.Secondary)
        )] });
    }
};
