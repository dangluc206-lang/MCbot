'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('follow').setDescription('Theo một người chơi.').addStringOption(option => option.setName('player').setDescription('Tên người chơi.').setRequired(true).setMaxLength(32)).addNumberOption(option => option.setName('distance').setDescription('Khoảng cách.').setMinValue(1).setMaxValue(16)),
    group: 'Movement', permission: Permission.ADMIN, cooldown: 5, minecraftRequired: true,
    async execute(ctx, interaction) {
        const result = await ctx.getService('movement').follow(interaction.options.getString('player', true), interaction.options.getNumber('distance') ?? 2);
        return DiscordResponse.send(interaction, { content: result === 'SUCCESS' ? 'Đã bắt đầu theo người chơi.' : `Không thể theo người chơi: ${result}`, ephemeral: true });
    }
};
