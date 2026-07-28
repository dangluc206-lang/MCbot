'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const Colors = require('./constants/DiscordColors');
const truncate = require('./utils/truncate');

/** Safely acknowledges an interaction exactly once. */
class DiscordResponse {
    static async send(interaction, payload) {
        const defaultEphemeral = interaction.client?.mcbotController?.ctx.config.discord?.defaultEphemeral;
        const ephemeral = payload.ephemeral ?? defaultEphemeral;
        const { ephemeral: ignored, ...rest } = payload;
        const normalized = ephemeral ? { ...rest, flags: MessageFlags.Ephemeral } : rest;
        if (interaction.deferred) {
            const { ephemeral, ...editable } = normalized;
            return interaction.editReply(editable);
        }
        if (interaction.replied) return interaction.followUp(normalized);
        return interaction.reply(normalized);
    }

    static errorEmbed(message) {
        return new EmbedBuilder()
            .setColor(Colors.ERROR)
            .setTitle('Không thể thực hiện thao tác')
            .setDescription(truncate(message, 4000));
    }

    static async error(interaction, message, ephemeral = true) {
        return this.send(interaction, { embeds: [this.errorEmbed(message)], ephemeral });
    }
}

module.exports = DiscordResponse;
