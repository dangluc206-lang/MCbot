'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');

module.exports = {
    data: new SlashCommandBuilder().setName('drop').setDescription('Drop item, yêu cầu xác nhận.').addIntegerOption(option => option.setName('slot').setDescription('Slot Mineflayer.').setRequired(true).setMinValue(0).setMaxValue(53)).addIntegerOption(option => option.setName('amount').setDescription('Số lượng.').setRequired(true).setMinValue(1).setMaxValue(2304)),
    group: 'Inventory', permission: Permission.OWNER, cooldown: 8, minecraftRequired: true,
    async execute(ctx, interaction) {
        const slot = interaction.options.getInteger('slot', true);
        const amount = interaction.options.getInteger('amount', true);
        const item = ctx.getService('inventory').itemAt(slot);
        if (!item || amount > item.count) return DiscordResponse.error(interaction, 'Slot hoặc số lượng item không hợp lệ.', true);
        const id = ctx.discordController.confirmations.create(interaction.user.id, { type: 'drop', slot, amount });
        return DiscordResponse.send(interaction, { content: `Xác nhận drop **${amount}× ${item.displayName || item.name}**?`, ephemeral: true, components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`confirm:drop:${id}`).setLabel('Xác nhận drop').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`confirm:cancel:${id}`).setLabel('Hủy').setStyle(ButtonStyle.Secondary)
        )] });
    },
    componentHandler: {
        permission: Permission.OWNER,
        cooldown: 2,
        minecraftRequired: true,
        defer: true,
        async execute(ctx, interaction) {
            const [, operation, id] = interaction.customId.split(':');
            const action = ctx.discordController.confirmations.take(id, interaction.user.id);
            if (!action) return DiscordResponse.error(interaction, 'Xác nhận đã hết hạn hoặc không thuộc về bạn.', true);
            if (operation === 'cancel') return interaction.editReply({ content: 'Đã hủy thao tác.', components: [] });
            const result = await ctx.getService('inventory').drop(action.slot, action.amount);
            return interaction.editReply({ content: `Drop item: ${result}`, components: [] });
        }
    }
};
