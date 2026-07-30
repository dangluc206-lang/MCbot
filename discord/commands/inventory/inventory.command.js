'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const Colors = require('../../constants/DiscordColors');
const truncate = require('../../utils/truncate');

const PAGE_SIZE = 10;

function payload(sessionId, session) {
    const pages = Math.max(1, Math.ceil(session.items.length / PAGE_SIZE));
    session.page = Math.min(Math.max(session.page, 0), pages - 1);
    const items = session.items.slice(session.page * PAGE_SIZE, (session.page + 1) * PAGE_SIZE);
    const text = items.length ? items.map(item => {
        const durability = item.maxDurability ? ` | durability ${item.maxDurability - (item.durabilityUsed || 0)}/${item.maxDurability}` : '';
        return `\`${item.slot}\` ${truncate(item.displayName || item.name, 60)} ×${item.count}${durability}`;
    }).join('\n') : 'Inventory trống.';
    return {
        embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle('Inventory').setDescription(text).setFooter({ text: `Trang ${session.page + 1}/${pages}` })],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`inventory:prev:${sessionId}`).setLabel('Trước').setStyle(ButtonStyle.Secondary).setDisabled(session.page === 0),
            new ButtonBuilder().setCustomId(`inventory:next:${sessionId}`).setLabel('Sau').setStyle(ButtonStyle.Secondary).setDisabled(session.page >= pages - 1),
            new ButtonBuilder().setCustomId(`inventory:refresh:${sessionId}`).setLabel('Làm mới').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`inventory:close:${sessionId}`).setLabel('Đóng').setStyle(ButtonStyle.Danger)
        )]
    };
}

const componentHandler = {
    permission: Permission.VIEWER,
    cooldown: 1,
    async execute(ctx, interaction) {
        const [, action, sessionId] = interaction.customId.split(':');
        const session = ctx.discordController.inventorySessions.get(sessionId, interaction.user.id);
        if (!session) return DiscordResponse.error(interaction, 'Phiên inventory đã hết hạn hoặc không thuộc về bạn.', true);
        if (action === 'prev') session.page -= 1;
        if (action === 'next') session.page += 1;
        if (action === 'refresh') session.items = ctx.getService('inventory').getItems();
        if (action === 'close') {
            ctx.discordController.inventorySessions.remove(sessionId);
            return interaction.update({ content: 'Đã đóng inventory.', embeds: [], components: [] });
        }
        return interaction.update(payload(sessionId, session));
    }
};

module.exports = {
    data: new SlashCommandBuilder().setName('inventory').setDescription('Xem inventory có phân trang.'),
    group: 'Inventory', permission: Permission.VIEWER, cooldown: 3, minecraftRequired: true,
    async execute(ctx, interaction) {
        const id = ctx.discordController.inventorySessions.create(interaction.user.id, ctx.getService('inventory').getItems());
        return DiscordResponse.send(interaction, payload(id, ctx.discordController.inventorySessions.get(id, interaction.user.id)));
    },
    componentHandler
};
