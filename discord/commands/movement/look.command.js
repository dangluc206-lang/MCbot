'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('look').setDescription('Nhìn về tọa độ.').addNumberOption(option => option.setName('x').setDescription('X').setRequired(true)).addNumberOption(option => option.setName('y').setDescription('Y').setRequired(true)).addNumberOption(option => option.setName('z').setDescription('Z').setRequired(true)),
    group: 'Movement', permission: Permission.ADMIN, cooldown: 2, minecraftRequired: true,
    async execute(ctx, interaction) {
        const position = { x: interaction.options.getNumber('x', true), y: interaction.options.getNumber('y', true), z: interaction.options.getNumber('z', true) };
        const result = await ctx.getService('movement').lookAt(position);
        return DiscordResponse.send(interaction, { content: result === 'SUCCESS' ? 'Đã đổi hướng nhìn.' : `Không thể đổi hướng nhìn: ${result}`, ephemeral: true });
    }
};
