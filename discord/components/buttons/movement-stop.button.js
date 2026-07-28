'use strict';

const Permission = require('../../constants/DiscordPermission');
const CustomId = require('../../constants/DiscordCustomId');

module.exports = [CustomId.MOVEMENT_STOP, {
    permission: Permission.MODERATOR,
    cooldown: 2,
    minecraftRequired: true,
    async execute(ctx, interaction) {
        const result = ctx.getService('movement').stop();
        return interaction.update({ content: `Dừng di chuyển: ${result}`, components: [] });
    }
}];
