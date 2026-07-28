'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const CustomId = require('../../constants/DiscordCustomId');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder().setName('goto').setDescription('Di chuyển bot tới tọa độ.').addNumberOption(option => option.setName('x').setDescription('X').setRequired(true)).addNumberOption(option => option.setName('y').setDescription('Y').setRequired(true)).addNumberOption(option => option.setName('z').setDescription('Z').setRequired(true)).addNumberOption(option => option.setName('radius').setDescription('Khoảng cách chấp nhận.').setMinValue(0).setMaxValue(16)),
    group: 'Movement', permission: Permission.ADMIN, cooldown: 5, minecraftRequired: true, defer: true,
    async execute(ctx, interaction) {
        const position = ['x', 'y', 'z'].reduce((value, key) => ({ ...value, [key]: interaction.options.getNumber(key, true) }), {});
        if (!Object.values(position).every(value => Number.isFinite(value) && Math.abs(value) <= 30000000)) {
            return DiscordResponse.error(interaction, 'Tọa độ không hợp lệ.', true);
        }
        const result = await ctx.getService('movement').goto(position, interaction.options.getNumber('radius') ?? 1, 90000);
        const success = result === 'SUCCESS';
        return DiscordResponse.send(interaction, {
            content: success ? `Đã tới ${position.x}, ${position.y}, ${position.z}.` : `Không thể tới đích: ${result}.`,
            components: success ? [] : [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(CustomId.MOVEMENT_STOP).setLabel('Dừng di chuyển').setStyle(ButtonStyle.Danger))]
        });
    }
};
