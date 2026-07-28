'use strict';

const { SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const { panelPayload } = require('../../components/buttons/control-panel.button');

module.exports = {
    data: new SlashCommandBuilder().setName('panel').setDescription('Mở bảng điều khiển Minecraft bot.'),
    group: 'Hệ thống', permission: Permission.VIEWER, cooldown: 5,
    async execute(ctx, interaction) {
        return DiscordResponse.send(interaction, panelPayload(ctx));
    }
};
