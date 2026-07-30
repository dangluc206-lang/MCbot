'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const Colors = require('./constants/DiscordColors');
const truncate = require('./utils/truncate');

/** Safely acknowledges an interaction exactly once. */
class DiscordResponse {
    static resolveEphemeral(interaction, requested) {
        if (typeof requested === 'boolean') return requested;
        return Boolean(interaction.client?.mcbotController?.ctx.config.discord?.defaultEphemeral);
    }

    static async defer(interaction, ephemeral) {
        if (interaction.deferred || interaction.replied) return;
        const options = this.resolveEphemeral(interaction, ephemeral)
            ? { flags: MessageFlags.Ephemeral }
            : {};
        return interaction.deferReply(options);
    }

    static async send(interaction, payload) {
        const { ephemeral: requestedEphemeral, ...rest } = payload;
        const normalized = this.resolveEphemeral(interaction, requestedEphemeral)
            ? { ...rest, flags: (rest.flags || 0) | MessageFlags.Ephemeral }
            : rest;
        if (interaction.deferred) {
            // Ephemeral visibility is immutable after deferReply(). Discord
            // rejects flags on editReply(), so do not forward them.
            const { flags, ...editable } = normalized;
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
