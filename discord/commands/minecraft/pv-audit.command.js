'use strict';

const { AttachmentBuilder, SlashCommandBuilder } = require('discord.js');
const DiscordResponse = require('../../DiscordResponse');
const Permission = require('../../constants/DiscordPermission');
const truncate = require('../../utils/truncate');

function formatAuditFile(items = []) {
    const lines = [
        'Mineflayer /pv 2 audit',
        `Generated: ${new Date().toISOString()}`,
        `Stacks read: ${items.length}`,
        ''
    ];
    for (const item of items) {
        const mapping = item.recipeSlot === null
            ? 'UNKNOWN'
            : `slot ${item.recipeSlot} (${item.recipeName})`;
        lines.push(
            `#${item.vaultSlot} | ${item.carrier || 'unknown'} x${item.count}`,
            `display: ${item.displayName || '(empty)'}`,
            `map: ${mapping}`,
            `labels: ${(item.labels || []).map(label => truncate(String(label), 320)).join(' || ') || '(none)'}`,
            ''
        );
    }
    return lines.join('\n');
}

/** Reads `/pv 2` and reports the recipe mapping without moving any item. */
module.exports = {
    data: new SlashCommandBuilder()
        .setName('pv-audit')
        .setDescription('Kiểm tra bot nhận diện item /pv 2 cho công thức SHK.'),
    group: 'Minecraft',
    permission: Permission.ADMIN,
    cooldown: 10,
    minecraftRequired: true,
    defer: true,

    async execute(ctx, interaction) {
        const audit = await ctx.getService('crafting').auditPersonalVault();
        const files = audit.result === 'SUCCESS'
            ? [new AttachmentBuilder(Buffer.from(formatAuditFile(audit.items), 'utf8'), { name: 'pv2-audit.txt' })]
            : [];
        return DiscordResponse.send(interaction, {
            content: audit.result === 'SUCCESS'
                ? `✅ ${audit.message}\nĐã đính kèm \`pv2-audit.txt\` chứa toàn bộ ${audit.items.length} stack.`
                : `❌ Không thể audit /pv 2: ${audit.message}`,
            files,
            ephemeral: true
        });
    }
};

module.exports.formatAuditFile = formatAuditFile;
