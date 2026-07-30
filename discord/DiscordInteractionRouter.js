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
        try {
            if (interaction.isAutocomplete?.()) return await this.handleAutocomplete(interaction);
            if (interaction.isChatInputCommand?.()) return await this.handleCommand(interaction);
            if (interaction.isButton?.()) return await this.handleComponent(interaction, 'buttons');
            if (interaction.isStringSelectMenu?.()) return await this.handleComponent(interaction, 'selects');
            if (interaction.isModalSubmit?.()) return await this.handleComponent(interaction, 'modals');
        } catch (error) {
            return this.handleInteractionError(interaction, error);
        }
    }

    /**
     * Discord discards an interaction after its acknowledgement deadline.
     * Treat 10062 as an expected race (for example, a stale panel button),
     * rather than forwarding it to the framework error logger as a fault.
     *
     * @private
     */
    async handleInteractionError(interaction, error) {
        const ctx = this.getContext();
        if (error?.code === 10062) {
            ctx.logger?.debug?.('[Discord] Interaction đã hết hạn trước khi phản hồi (10062).');
            return null;
        }

        ctx.errorHandler?.handle(error, {
            phase: 'discord.interaction-router',
            action: interaction?.commandName || interaction?.customId || 'unknown',
            userId: interaction?.user?.id
        });

        // If Discord has already accepted a response, a follow-up could
        // produce another API error. The framework log above is enough.
        if (interaction?.replied || interaction?.deferred) return null;
        try {
            return await DiscordResponse.error(interaction, 'Thao tác thất bại. Xem terminal để biết chi tiết.', true);
        } catch (responseError) {
            if (responseError?.code === 10062) return null;
            throw responseError;
        }
    }

    async handleAutocomplete(interaction) {
        const command = this.registry.command(interaction.commandName);
        if (!command?.autocomplete) return interaction.respond([]);
        if (!this.permissions.can(interaction, command.permission || Permission.VIEWER)) {
            return interaction.respond([]);
        }
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
        if (!handler) {
            return DiscordResponse.error(interaction, 'Thao tác này đã hết hạn hoặc không còn được hỗ trợ. Hãy mở lại panel.', true);
        }
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
            if (handler.defer && !interaction.deferred && !interaction.replied) {
                if ((interaction.isButton?.() || interaction.isStringSelectMenu?.()) && interaction.deferUpdate) {
                    await interaction.deferUpdate();
                } else {
                    await DiscordResponse.defer(interaction, handler.ephemeral);
                }
            }
            const result = await handler.execute(ctx, interaction);
            auditLog(ctx, interaction, auditName, startedAt, 'SUCCESS');
            return result;
        }
        catch (error) {
            if (error?.code === 10062) {
                ctx.logger?.warn('[Discord] Interaction expired before it could be acknowledged.');
                return;
            }
            ctx.errorHandler?.handle(error, { phase: 'discord.interaction', action: auditName, userId: interaction.user?.id });
            auditLog(ctx, interaction, auditName, startedAt, 'FAILED');
            return DiscordResponse.error(interaction, 'Thao tác thất bại. Xem terminal để biết chi tiết.', true);
        }
    }
}

module.exports = DiscordInteractionRouter;
