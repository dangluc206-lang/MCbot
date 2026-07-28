'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const Colors = require('../../constants/DiscordColors');

module.exports = {
    data: new SlashCommandBuilder().setName('help').setDescription('Xem các lệnh bạn được phép sử dụng.'),
    permission: Permission.VIEWER,
    cooldown: 3,
    async execute(ctx, interaction) {
        const controller = ctx.discordController;
        const commands = controller.registry.commands.values();
        const allowed = [...commands].filter(command => controller.permissions.can(interaction, command.permission || Permission.VIEWER));
        const byGroup = allowed.reduce((groups, command) => {
            const group = command.group || 'Hệ thống';
            groups[group] ||= [];
            groups[group].push(`/${command.data.name}`);
            return groups;
        }, {});
        const embed = new EmbedBuilder().setColor(Colors.INFO).setTitle('Discord Controller — Trợ giúp')
            .setDescription('Các lệnh hiển thị bên dưới đã được lọc theo quyền của bạn.')
            .addFields(Object.entries(byGroup).map(([name, commandsForGroup]) => ({ name, value: commandsForGroup.join(', ') })));
        return DiscordResponse.send(interaction, { embeds: [embed], ephemeral: true });
    }
};
