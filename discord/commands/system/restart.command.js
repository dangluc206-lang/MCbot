'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('restart').setDescription('Restart kết nối Minecraft an toàn.'),
    group: 'Hệ thống', permission: Permission.ADMIN, cooldown: 20, defer: true,
    async execute(ctx, interaction) {
        const result = await ctx.getService('lifecycle').restart();
        return DiscordResponse.send(interaction, { content: `Restart Minecraft: ${result}` });
    }
};
