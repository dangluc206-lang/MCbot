'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('jump').setDescription('Yêu cầu bot nhảy.'),
    group: 'Movement', permission: Permission.ADMIN, cooldown: 2, minecraftRequired: true,
    async execute(ctx, interaction) {
        const result = ctx.getService('movement').jump();
        return DiscordResponse.send(interaction, { content: `Nhảy: ${result}`, ephemeral: true });
    }
};
