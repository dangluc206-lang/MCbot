'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('reconnect').setDescription('Yêu cầu kết nối lại Minecraft.'),
    group: 'Minecraft', permission: Permission.ADMIN, cooldown: 15,
    async execute(ctx, interaction) {
        const result = await ctx.getService('lifecycle').connect();
        return DiscordResponse.send(interaction, { content: `Kết nối Minecraft: ${result}`, ephemeral: true });
    }
};
