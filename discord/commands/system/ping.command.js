'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const Colors = require('../../constants/DiscordColors');

module.exports = {
    data: new SlashCommandBuilder().setName('ping').setDescription('Kiểm tra kết nối Discord và Minecraft.'),
    permission: Permission.VIEWER,
    cooldown: 3,
    async execute(ctx, interaction) {
        const startedAt = Date.now();
        const player = ctx.getService('player');
        const ping = player?.ping?.();
        return DiscordResponse.send(interaction, { embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle('Ping').addFields(
            { name: 'Discord API', value: `${interaction.client.ws.ping >= 0 ? interaction.client.ws.ping : '?'} ms`, inline: true },
            { name: 'Minecraft', value: ping == null ? 'Không có dữ liệu' : `${ping} ms`, inline: true },
            { name: 'Phản hồi', value: `${Date.now() - startedAt} ms`, inline: true },
            { name: 'Engine', value: ctx.runtime.state.engine.state, inline: true }
        )] });
    }
};
