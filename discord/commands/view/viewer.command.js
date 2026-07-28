'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('viewer').setDescription('Lấy URL góc nhìn live của bot.'),
    group: 'View', permission: Permission.VIEWER, cooldown: 5,
    async execute(ctx, interaction) {
        const url = ctx.getService('view').viewerUrl();
        return DiscordResponse.send(interaction, { content: url ? `Viewer: ${url}` : 'Viewer chưa có URL HTTPS công khai được cấu hình.', ephemeral: true });
    }
};
