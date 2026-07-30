'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('chat').setDescription('Gửi chat vào Minecraft.').addStringOption(option => option.setName('message').setDescription('Nội dung tối đa 256 ký tự.').setRequired(true).setMaxLength(256)),
    group: 'Minecraft', permission: Permission.ADMIN, cooldown: 3, minecraftRequired: true,
    async execute(ctx, interaction) {
        const result = await ctx.getService('chat').send(interaction.options.getString('message', true));
        return DiscordResponse.send(interaction, { content: result === 'SUCCESS' ? 'Đã gửi chat tới Minecraft.' : `Không gửi được: ${result}`, ephemeral: true });
    }
};
