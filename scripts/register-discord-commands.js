'use strict';

require('dotenv').config({ quiet: true });

const { REST, Routes } = require('discord.js');
const DiscordController = require('../discord/DiscordController');

async function main() {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!token || !clientId) throw new Error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required.');

    const controller = new DiscordController({ config: { discord: {} } });
    const commands = controller.registry.slashData();
    const names = commands.map(command => command.name);
    if (new Set(names).size !== names.length) throw new Error('Duplicate Discord slash command names detected.');

    const rest = new REST({ version: '10' }).setToken(token);
    const route = guildId && process.env.DISCORD_REGISTER_GLOBAL_COMMANDS !== 'true'
        ? Routes.applicationGuildCommands(clientId, guildId)
        : Routes.applicationCommands(clientId);
    await rest.put(route, { body: commands });
    console.log(`Registered ${commands.length} ${guildId ? 'guild' : 'global'} Discord commands.`);
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
