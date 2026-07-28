'use strict';

const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Permission = require('../../constants/DiscordPermission');
const CustomId = require('../../constants/DiscordCustomId');
const { payload } = require('../../ConfigPanelManager');

async function set(ctx, path, value) { return ctx.getService('configuration').set(path, value); }
module.exports = {
    selects: [
        [CustomId.CONFIG_SKYBLOCK, { permission: Permission.ADMIN, async execute(ctx, i) { const r = await set(ctx, 'skyblock.serverSlot', Number(i.values[0])); return i.update(payload(ctx, `SkyBlock slot: ${r}`)); } }],
        [CustomId.CONFIG_DUNGEON, { permission: Permission.ADMIN, async execute(ctx, i) { const r = await set(ctx, 'dungeon.entrySlot', Number(i.values[0])); return i.update(payload(ctx, `Dungeon slot: ${r}`)); } }],
        [CustomId.CONFIG_FISHING, { permission: Permission.ADMIN, async execute(ctx, i) { const r = await set(ctx, 'fishing.afkSlots', i.values.map(Number)); return i.update(payload(ctx, `Fishing slots: ${r}`)); } }],
        [CustomId.CONFIG_ORES, { permission: Permission.ADMIN, async execute(ctx, i) { ctx.getService('storage').setSelectedOres(i.values); const r = await set(ctx, 'storage.selectedOres', i.values); return i.update(payload(ctx, `Ore bán: ${r}`)); } }]
    ],
    button: [CustomId.CONFIG_COORDS, { permission: Permission.ADMIN, async execute(ctx, i) { const modal = new ModalBuilder().setCustomId(CustomId.CONFIG_COORDS_MODAL).setTitle('Tọa độ Fishing'); for (const [id, label] of [['slot', 'AFK slot (11, 13, 15)'], ['x', 'X'], ['y', 'Y'], ['z', 'Z']]) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true))); return i.showModal(modal); } }],
    modal: [CustomId.CONFIG_COORDS_MODAL, { permission: Permission.ADMIN, async execute(ctx, i) { const slot = i.fields.getTextInputValue('slot'); const vector = ['x', 'y', 'z'].map(key => Number(i.fields.getTextInputValue(key))); if (!['11', '13', '15'].includes(slot) || !vector.every(Number.isFinite)) return i.reply({ content: 'Tọa độ không hợp lệ.', ephemeral: true }); const targets = { ...(ctx.config.fishing.slotTargets || {}), [slot]: vector }; const r = await set(ctx, 'fishing.slotTargets', targets); return i.reply({ content: `Đã lưu slot ${slot}: ${r}`, ephemeral: true }); } }]
};
