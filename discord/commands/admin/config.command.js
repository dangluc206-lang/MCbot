'use strict';

const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const Colors = require('../../constants/DiscordColors');

module.exports = {
    data: new SlashCommandBuilder().setName('config').setDescription('Xem cấu hình không nhạy cảm.'),
    group: 'Admin', permission: Permission.OWNER, cooldown: 10,
    async execute(ctx, interaction) {
        const minecraft = ctx.config.minecraft || {};
        const viewer = ctx.config.viewer || {};
        return DiscordResponse.send(interaction, { embeds: [new EmbedBuilder().setColor(Colors.MUTED).setTitle('Cấu hình công khai').addFields(
            { name: 'Minecraft', value: `Host: ${minecraft.host || '—'}\nPort: ${minecraft.port || 25565}\nVersion: ${minecraft.version || 'auto'}\nAuth: ${minecraft.auth || 'offline'}` },
            { name: 'Viewer', value: `Enabled: ${Boolean(viewer.enabled)}\nPublic URL: ${ctx.getService('view').viewerUrl() || 'Không cấu hình'}` },
            { name: 'Discord', value: `Notifications: ${Boolean(ctx.config.discord?.notificationChannelId)}\nPermission owner: đã cấu hình` }
        )], ephemeral: true });
    }
};
