'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('movement-stop').setDescription('Dừng di chuyển hiện tại.'),
    group: 'Movement', permission: Permission.MODERATOR, cooldown: 2, minecraftRequired: true,
    async execute(ctx, interaction) {
        return DiscordResponse.send(interaction, { content: `Dừng di chuyển: ${ctx.getService('movement').stop()}`, ephemeral: true });
    }
};
