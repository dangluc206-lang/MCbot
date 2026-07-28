'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const Colors = require('../../constants/DiscordColors');
const formatDuration = require('../../utils/formatDuration');

function resultText(result) {
    const texts = {
        SUCCESS: 'Thành công.',
        MODE_ALREADY_RUNNING: 'Mode này đang chạy.',
        MODE_NOT_RUNNING: 'Không có mode đang chạy.',
        FAILED: 'Mode không tồn tại hoặc không thể khởi động.',
        NOT_CONNECTED: 'Minecraft bot chưa kết nối.',
        NOT_IN_SKYBLOCK: 'Bot chưa vào SkyBlock.'
    };
    return texts[result] || `Kết quả: ${result}`;
}

function modeDetails(manager) {
    return manager.names().map(name => {
        const mode = manager.get(name);
        const running = mode?.isRunning?.() ? 'đang chạy' : 'dừng';
        const paused = mode?.isPaused?.() ? ', tạm dừng' : '';
        const runtime = mode?.startedAt ? `, ${formatDuration(Date.now() - mode.startedAt.getTime())}` : '';
        return `• **${name}** — ${running}${paused}${runtime}`;
    }).join('\n') || 'Chưa đăng ký mode.';
}

module.exports = {
    data: new SlashCommandBuilder().setName('mode').setDescription('Điều khiển mode automation.')
        .addSubcommand(sub => sub.setName('list').setDescription('Liệt kê mode đã đăng ký.'))
        .addSubcommand(sub => sub.setName('start').setDescription('Khởi động mode.').addStringOption(option => option.setName('name').setDescription('Tên mode.').setRequired(true).setAutocomplete(true)))
        .addSubcommand(sub => sub.setName('stop').setDescription('Dừng mode hiện tại.'))
        .addSubcommand(sub => sub.setName('pause').setDescription('Tạm dừng mode hiện tại.'))
        .addSubcommand(sub => sub.setName('resume').setDescription('Tiếp tục mode hiện tại.'))
        .addSubcommand(sub => sub.setName('status').setDescription('Xem mode hiện tại.')),
    group: 'Mode',
    permission: Permission.VIEWER,
    cooldown: 3,
    autocomplete(ctx, interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const names = ctx.getManager('mode').names().filter(name => name.includes(focused)).slice(0, 25);
        return interaction.respond(names.map(name => ({ name, value: name })));
    },
    async execute(ctx, interaction) {
        const manager = ctx.getManager('mode');
        const subcommand = interaction.options.getSubcommand();
        const required = { start: Permission.ADMIN, stop: Permission.ADMIN, pause: Permission.MODERATOR, resume: Permission.MODERATOR };
        if (required[subcommand] && !ctx.discordController.permissions.can(interaction, required[subcommand])) {
            return DiscordResponse.error(interaction, 'Bạn không có quyền cho thao tác mode này.', true);
        }
        if (['start', 'stop', 'pause', 'resume'].includes(subcommand) && !ctx.runtime.state.bot.connected) {
            return DiscordResponse.error(interaction, 'Minecraft bot chưa sẵn sàng.', true);
        }
        if (subcommand === 'list') {
            return DiscordResponse.send(interaction, { embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle('Các mode').setDescription(modeDetails(manager))] });
        }
        if (subcommand === 'status') {
            const current = manager.current();
            const description = current ? `**${current.name}**\nState: ${current.modeState}\nPaused: ${current.isPaused()}\nRuntime: ${current.startedAt ? formatDuration(Date.now() - current.startedAt.getTime()) : '—'}` : 'Không có mode đang chạy.';
            return DiscordResponse.send(interaction, { embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle('Trạng thái mode').setDescription(description)] });
        }
        await interaction.deferReply();
        const result = subcommand === 'start'
            ? await manager.start(interaction.options.getString('name', true))
            : await manager[subcommand]();
        return DiscordResponse.send(interaction, { embeds: [new EmbedBuilder().setColor(result === 'SUCCESS' ? Colors.SUCCESS : Colors.WARNING).setTitle('Mode').setDescription(resultText(result))] });
    }
};
