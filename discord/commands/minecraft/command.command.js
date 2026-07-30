'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('command').setDescription('Gửi command Minecraft.').addStringOption(option => option.setName('command').setDescription('Command Minecraft.').setRequired(true).setMaxLength(256)),
    group: 'Minecraft', permission: Permission.ADMIN, cooldown: 5, minecraftRequired: true,
    async execute(ctx, interaction) {
        const result = await ctx.getService('chat').sendCommand(interaction.options.getString('command', true));
        return DiscordResponse.send(interaction, { content: result === 'SUCCESS' ? 'Đã gửi command Minecraft.' : `Không gửi được: ${result}`, ephemeral: true });
    }
};
