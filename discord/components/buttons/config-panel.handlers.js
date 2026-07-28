'use strict';

const {
    ActionRowBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const Permission = require('../../constants/DiscordPermission');
const CustomId = require('../../constants/DiscordCustomId');
const { payload } = require('../../ConfigPanelManager');

async function set(ctx, path, value) {
    return ctx.getService('configuration').set(path, value);
}

function coordinatesModal() {
    const modal = new ModalBuilder().setCustomId(CustomId.CONFIG_COORDS_MODAL).setTitle('Tọa độ Fishing');
    for (const [id, label] of [['slot', 'AFK slot (11, 13, 15)'], ['x', 'X'], ['y', 'Y'], ['z', 'Z']]) {
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true)
        ));
    }
    return modal;
}

function editModal() {
    return new ModalBuilder()
        .setCustomId(CustomId.CONFIG_EDIT_MODAL)
        .setTitle('Sửa gameplay config')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('path')
                    .setLabel('Path, ví dụ storage.guiCheckIntervalMs')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('value')
                    .setLabel('Giá trị JSON, ví dụ 30000 hoặc ["DIAMOND"]')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000)
            )
        );
}

function syncRuntimeConfig(ctx, path, value) {
    if (path === 'storage.selectedOres') {
        ctx.getService('storage').setSelectedOres(value);
    }
}

module.exports = {
    selects: [
        [CustomId.CONFIG_SKYBLOCK, { permission: Permission.ADMIN, async execute(ctx, interaction) { const result = await set(ctx, 'skyblock.serverSlot', Number(interaction.values[0])); return interaction.update(payload(ctx, `SkyBlock slot: ${result}`)); } }],
        [CustomId.CONFIG_DUNGEON, { permission: Permission.ADMIN, async execute(ctx, interaction) { const result = await set(ctx, 'dungeon.entrySlot', Number(interaction.values[0])); return interaction.update(payload(ctx, `Dungeon slot: ${result}`)); } }],
        [CustomId.CONFIG_FISHING, { permission: Permission.ADMIN, async execute(ctx, interaction) { const result = await set(ctx, 'fishing.afkSlots', interaction.values.map(Number)); return interaction.update(payload(ctx, `Fishing slots: ${result}`)); } }],
        [CustomId.CONFIG_ORES, { permission: Permission.ADMIN, async execute(ctx, interaction) { const values = interaction.values; const result = await set(ctx, 'storage.selectedOres', values); if (result === 'SUCCESS') syncRuntimeConfig(ctx, 'storage.selectedOres', values); return interaction.update(payload(ctx, `Ore bán: ${result}`)); } }]
    ],
    buttons: [
        [CustomId.CONFIG_COORDS, { permission: Permission.ADMIN, async execute(ctx, interaction) { return interaction.showModal(coordinatesModal()); } }],
        [CustomId.CONFIG_EDIT, { permission: Permission.ADMIN, async execute(ctx, interaction) { return interaction.showModal(editModal()); } }],
        [CustomId.CONFIG_REFRESH, { permission: Permission.VIEWER, async execute(ctx, interaction) { return interaction.update(payload(ctx, 'Đã làm mới cấu hình.')); } }]
    ],
    modals: [
        [CustomId.CONFIG_COORDS_MODAL, { permission: Permission.ADMIN, async execute(ctx, interaction) {
            const slot = interaction.fields.getTextInputValue('slot');
            const vector = ['x', 'y', 'z'].map(key => Number(interaction.fields.getTextInputValue(key)));
            if (!['11', '13', '15'].includes(slot) || !vector.every(Number.isFinite)) {
                return interaction.reply({ content: 'Tọa độ không hợp lệ.', flags: 64 });
            }
            const targets = { ...(ctx.config.fishing.slotTargets || {}), [slot]: vector };
            const result = await set(ctx, 'fishing.slotTargets', targets);
            return interaction.reply({ content: `Đã lưu slot ${slot}: ${result}`, flags: 64 });
        }}],
        [CustomId.CONFIG_EDIT_MODAL, { permission: Permission.ADMIN, async execute(ctx, interaction) {
            const path = interaction.fields.getTextInputValue('path').trim();
            const input = interaction.fields.getTextInputValue('value').trim();
            let value;
            try {
                value = JSON.parse(input);
            } catch (error) {
                return interaction.reply({ content: 'Giá trị phải là JSON hợp lệ, ví dụ `30000`, `true`, `"/d"` hoặc `["DIAMOND"]`.', flags: 64 });
            }

            const result = await set(ctx, path, value);
            if (result === 'SUCCESS') syncRuntimeConfig(ctx, path, value);
            return interaction.reply({ content: `Lưu ${path}: ${result}`, flags: 64 });
        }}]
    ]
};
