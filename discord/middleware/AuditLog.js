'use strict';

const SENSITIVE = /(token|password|secret|cookie|session|command|message|text|value|script)/i;
const DANGEROUS_ACTION = /(shutdown|drop|command|restart|reload|storage:sell)/i;

module.exports = function auditLog(ctx, interaction, command, startedAt, result) {
    const options = interaction.options?.data || [];
    const argumentsText = options.map(option => `${option.name}=${SENSITIVE.test(option.name) ? '[redacted]' : String(option.value)}`).join(', ');
    const message = `[Discord] user=${interaction.user?.tag || interaction.user?.id} id=${interaction.user?.id} guild=${interaction.guildId || 'DM'} action=${command} args=${argumentsText} result=${result} durationMs=${Date.now() - startedAt}`;
    const logger = ctx.logger;
    if (DANGEROUS_ACTION.test(command)) logger?.warn(message);
    else logger?.info(message);
};
