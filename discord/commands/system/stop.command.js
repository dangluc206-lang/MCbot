'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('stop').setDescription('Dừng Engine an toàn.'),
    group: 'Hệ thống', permission: Permission.ADMIN, cooldown: 10,
    async execute(ctx, interaction) {
        const result = await ctx.engine.stop();
        return DiscordResponse.send(interaction, { content: `Engine: ${result}`, ephemeral: true });
    }
};
