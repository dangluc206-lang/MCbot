'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('swap').setDescription('Đổi vị trí hai slot inventory.').addIntegerOption(option => option.setName('from').setDescription('Slot nguồn.').setRequired(true).setMinValue(0).setMaxValue(53)).addIntegerOption(option => option.setName('to').setDescription('Slot đích.').setRequired(true).setMinValue(0).setMaxValue(53)),
    group: 'Inventory', permission: Permission.ADMIN, cooldown: 3, minecraftRequired: true,
    async execute(ctx, interaction) { return DiscordResponse.send(interaction, { content: `Đổi slot: ${await ctx.getService('inventory').swap(interaction.options.getInteger('from', true), interaction.options.getInteger('to', true))}`, ephemeral: true }); }
};
