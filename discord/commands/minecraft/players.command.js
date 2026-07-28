'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const Colors = require('../../constants/DiscordColors');

module.exports = {
    data: new SlashCommandBuilder().setName('players').setDescription('Xem người chơi gần bot.').addIntegerOption(option => option.setName('range').setDescription('Bán kính block, tối đa 256.').setMinValue(1).setMaxValue(256)),
    group: 'Minecraft', permission: Permission.VIEWER, cooldown: 3, minecraftRequired: true,
    async execute(ctx, interaction) {
        const players = ctx.getService('player').nearbyPlayers(interaction.options.getInteger('range') || 64);
        return DiscordResponse.send(interaction, { embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle('Người chơi gần').setDescription(players.length ? players.map(player => `• ${player.username} — ${player.distance.toFixed(1)} block`).join('\n') : 'Không có người chơi trong bán kính đã chọn.')] });
    }
};
