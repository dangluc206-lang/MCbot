'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const truncate = require('../../utils/truncate');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gui-probe')
        .setDescription('Rà GUI theo script: /ks > l12 > r5.')
        .addStringOption(option => option
            .setName('script')
            .setDescription('Ví dụ: /ks > l12 > r5 > inspect')
            .setRequired(true)
            .setMaxLength(256)),
    group: 'Minecraft',
    permission: Permission.ADMIN,
    cooldown: 5,
    minecraftRequired: true,
    defer: true,
    async execute(ctx, interaction) {
        const output = await ctx.getService('guiProbe').run(interaction.options.getString('script', true));
        const steps = output.snapshots.map(snapshot => `${snapshot.label}: ${snapshot.title || 'đã đóng'}`).join(' → ');
        return DiscordResponse.send(interaction, {
            content: output.result === 'SUCCESS'
                ? truncate(`${output.message}\nCác bước: ${steps}`, 1900)
                : truncate(`Không thể rà GUI: ${output.message}`, 1900),
            ephemeral: true
        });
    }
};
