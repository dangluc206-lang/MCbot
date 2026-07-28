'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('equip').setDescription('Trang bị item từ slot inventory.').addIntegerOption(option => option.setName('slot').setDescription('Slot Mineflayer.').setRequired(true).setMinValue(0).setMaxValue(53)).addStringOption(option => option.setName('destination').setDescription('Vị trí trang bị.').setRequired(true).addChoices({ name: 'hand', value: 'hand' }, { name: 'off-hand', value: 'off-hand' }, { name: 'head', value: 'head' }, { name: 'torso', value: 'torso' }, { name: 'legs', value: 'legs' }, { name: 'feet', value: 'feet' })),
    group: 'Inventory', permission: Permission.ADMIN, cooldown: 3, minecraftRequired: true,
    async execute(ctx, interaction) { return DiscordResponse.send(interaction, { content: `Trang bị: ${await ctx.getService('inventory').equip(interaction.options.getInteger('slot', true), interaction.options.getString('destination', true))}`, ephemeral: true }); }
};
