'use strict';

const { SlashCommandBuilder } = require('discord.js');
const Permission = require('../../constants/DiscordPermission');
const { replyDashboard } = require('../../components/buttons/dashboard.button');

module.exports = {
    data: new SlashCommandBuilder().setName('status').setDescription('Hiển thị dashboard của Minecraft bot.'),
    permission: Permission.VIEWER,
    cooldown: 3,
    async execute(ctx, interaction) { return replyDashboard(ctx, interaction); }
};
