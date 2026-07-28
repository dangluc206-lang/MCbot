'use strict';

const Permission = require('../../constants/DiscordPermission');
const CustomId = require('../../constants/DiscordCustomId');

module.exports = [
    [CustomId.SHUTDOWN_CANCEL, { permission: Permission.OWNER, async execute(ctx, interaction) { return interaction.update({ content: 'Đã hủy tắt bot.', components: [] }); } }],
    [CustomId.SHUTDOWN_CONFIRM, { permission: Permission.OWNER, async execute(ctx, interaction) { await interaction.update({ content: 'Đang tắt hệ thống an toàn…', components: [] }); return ctx.getService('lifecycle').shutdown(); } }]
];
