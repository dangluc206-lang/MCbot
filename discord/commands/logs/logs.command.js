'use strict';

const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const Colors = require('../../constants/DiscordColors');
const truncate = require('../../utils/truncate');

module.exports = {
    data: new SlashCommandBuilder().setName('logs').setDescription('Xem log gần nhất.').addIntegerOption(option => option.setName('limit').setDescription('1-30 dòng.').setMinValue(1).setMaxValue(30)),
    group: 'Logs', permission: Permission.MODERATOR, cooldown: 10,
    async execute(ctx, interaction) {
        const entries = ctx.logger.recent(null, interaction.options.getInteger('limit') || 15);
        const text = entries.length ? entries.map(entry => `\`${entry.level}\` ${truncate(entry.message, 160)}`).join('\n') : 'Chưa có log trong bộ đệm.';
        return DiscordResponse.send(interaction, { embeds: [new EmbedBuilder().setColor(Colors.MUTED).setTitle('Log gần nhất').setDescription(truncate(text, 4000))], ephemeral: true });
    }
};
