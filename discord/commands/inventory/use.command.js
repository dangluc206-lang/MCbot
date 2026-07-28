'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('use').setDescription('Dùng item ở slot inventory.').addIntegerOption(option => option.setName('slot').setDescription('Slot Mineflayer.').setRequired(true).setMinValue(0).setMaxValue(53)),
    group: 'Inventory', permission: Permission.ADMIN, cooldown: 3, minecraftRequired: true,
    async execute(ctx, interaction) { return DiscordResponse.send(interaction, { content: `Dùng item: ${await ctx.getService('inventory').use(interaction.options.getInteger('slot', true))}`, ephemeral: true }); }
};
