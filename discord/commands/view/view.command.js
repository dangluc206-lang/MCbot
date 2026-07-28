'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('view').setDescription('Chụp ảnh góc nhìn bot nếu viewer hỗ trợ.'),
    group: 'View', permission: Permission.VIEWER, cooldown: 15, minecraftRequired: true, defer: true,
    async execute(ctx, interaction) {
        const capture = await ctx.getService('view').capture();
        return DiscordResponse.send(interaction, { content: capture.result === 'SUCCESS' ? 'Đã chụp ảnh.' : capture.reason });
    }
};
