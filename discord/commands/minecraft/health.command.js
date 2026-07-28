'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const Colors = require('../../constants/DiscordColors');

module.exports = {
    data: new SlashCommandBuilder().setName('health').setDescription('Xem máu, độ no và hiệu ứng.'),
    group: 'Minecraft', permission: Permission.VIEWER, cooldown: 2, minecraftRequired: true,
    async execute(ctx, interaction) {
        const player = ctx.getService('player');
        const effects = player.effects();
        return DiscordResponse.send(interaction, { embeds: [new EmbedBuilder().setColor(Colors.INFO).setTitle('Trạng thái người chơi').addFields(
            { name: 'Máu', value: `${player.health()}/20`, inline: true },
            { name: 'Độ no', value: `${player.food()}/20`, inline: true },
            { name: 'Oxygen', value: player.oxygen() == null ? 'Không rõ' : String(player.oxygen()), inline: true },
            { name: 'Hiệu ứng', value: effects.length ? effects.map(effect => `#${effect.id} x${effect.amplifier + 1}`).join(', ') : 'Không có', inline: false }
        )] });
    }
};
