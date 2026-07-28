'use strict';

const DiscordResponse = require('./DiscordResponse');
const Permission = require('./constants/DiscordPermission');
const auditLog = require('./middleware/AuditLog');

/** Routes Discord interactions through command contracts and shared safeguards. */
class DiscordInteractionRouter {
    constructor({ getContext, registry, permissions, cooldown }) {
        this.getContext = getContext;
        this.registry = registry;
        this.permissions = permissions;
        this.cooldown = cooldown;
    }

    async handle(interaction) {
        if (interaction.isAutocomplete?.()) return this.handleAutocomplete(interaction);
        if (interaction.isChatInputCommand?.()) return this.handleCommand(interaction);
        if (interaction.isButton?.()) return this.handleComponent(interaction, 'buttons');
        if (interaction.isStringSelectMenu?.()) return this.handleComponent(interaction, 'selects');
        if (interaction.isModalSubmit?.()) return this.handleComponent(interaction, 'modals');
    }

    async handleAutocomplete(interaction) {
        const command = this.registry.command(interaction.commandName);
        if (!command?.autocomplete) return interaction.respond([]);
        try {
            await command.autocomplete(this.getContext(), interaction);
        }
        catch (error) {
            this.getContext().errorHandler?.handle(error, { phase: 'discord.autocomplete', command: interaction.commandName });
            await interaction.respond([]);
        }
    }

    async handleCommand(interaction) {
        const command = this.registry.command(interaction.commandName);
        if (!command) return DiscordResponse.error(interaction, 'Lệnh này chưa được đăng ký.', true);
        return this.execute(interaction, command, interaction.commandName);
    }

    async handleComponent(interaction, type) {
        const handler = this.registry.component(type, interaction.customId);
        if (!handler) return;
        return this.execute(interaction, handler, interaction.customId);
    }

    async execute(interaction, handler, auditName) {
        const ctx = this.getContext();
        const startedAt = Date.now();
        const permission = handler.permission || Permission.VIEWER;
        if (!this.permissions.can(interaction, permission)) {
            return DiscordResponse.error(interaction, 'Bạn không có quyền thực hiện thao tác này.', true);
        }
        const cooldownMs = this.cooldown.check(interaction, auditName, handler.cooldown || 0);
        if (cooldownMs > 0) {
            return DiscordResponse.error(interaction, `Vui lòng chờ ${(cooldownMs / 1000).toFixed(1)} giây trước khi thử lại.`, true);
        }
        if (handler.minecraftRequired && !ctx.runtime.state.bot.connected) {
            return DiscordResponse.error(interaction, 'Minecraft bot chưa sẵn sàng.', true);
        }

        try {
            if (handler.defer) await interaction.deferReply({ ephemeral: Boolean(handler.ephemeral) });
            const result = await handler.execute(ctx, interaction);
            auditLog(ctx, interaction, auditName, startedAt, 'SUCCESS');
            return result;
        }
        catch (error) {
            ctx.errorHandler?.handle(error, { phase: 'discord.interaction', action: auditName, userId: interaction.user?.id });
            auditLog(ctx, interaction, auditName, startedAt, 'FAILED');
            return DiscordResponse.error(interaction, 'Thao tác thất bại. Xem terminal để biết chi tiết.', true);
        }
    }
}

module.exports = DiscordInteractionRouter;
