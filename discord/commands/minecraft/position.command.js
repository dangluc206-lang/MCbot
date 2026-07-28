'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const Colors = require('../../constants/DiscordColors');
const formatPosition = require('../../utils/formatPosition');

module.exports = {
    data: new SlashCommandBuilder().setName('position').setDescription('Xem tọa độ Minecraft hiện tại.'),
    group: 'Minecraft', permission: Permission.VIEWER, cooldown: 2, minecraftRequired: true,
    async execute(ctx, interaction) {
        const player = ctx.getService('player');
        return DiscordResponse.send(interaction, { embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle('Vị trí').setDescription(formatPosition(player.getPosition())).addFields({ name: 'Dimension', value: player.dimension() || 'Không rõ' })] });
    }
};
