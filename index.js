'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');

const Framework = require('./Framework');
const createDiscordController = require('./discord/bot');

function loadConfig(configPath = path.join(__dirname, 'config', 'config.json')) {
    const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const minecraft = fileConfig.minecraft || {};
    const discord = fileConfig.discord || {};

    return {
        ...fileConfig,
        minecraft: {
            ...minecraft,
            host: process.env.MINECRAFT_HOST || minecraft.host,
            port: Number(process.env.MINECRAFT_PORT || minecraft.port || 25565),
            username: process.env.MINECRAFT_USERNAME || minecraft.username,
            version: process.env.MINECRAFT_VERSION || minecraft.version,
            auth: process.env.MINECRAFT_AUTH || minecraft.auth || 'offline'
        },
        discord: {
            ...discord,
            token: process.env.DISCORD_TOKEN || discord.token || '',
            ownerId: process.env.DISCORD_OWNER_ID || discord.ownerId || ''
        }
    };
}

function validateConfig(config) {
    const required = ['host', 'username'];
    const missing = required.filter(key => !config.minecraft?.[key]);

    if (missing.length > 0) {
        throw new Error(`Missing Minecraft configuration: ${missing.join(', ')}`);
    }

    if (config.discord.token && !config.discord.ownerId) {
        throw new Error('DISCORD_OWNER_ID is required when Discord is enabled.');
    }
}

async function startApplication(config = loadConfig()) {
    validateConfig(config);

    const bot = mineflayer.createBot(config.minecraft);
    bot.loadPlugin(pathfinder);

    const framework = new Framework(bot, config);
    const result = await framework.start();

    if (result !== 'SUCCESS') {
        throw new Error(`Framework failed to start: ${result}`);
    }

    const discordClient = config.discord.token
        ? await createDiscordController({ framework, config })
        : null;

    let stopping = false;
    const stop = async () => {
        if (stopping) {
            return;
        }

        stopping = true;
        await framework.stop();
        discordClient?.destroy();

        if (bot.quit) {
            bot.quit('Application stopped');
        }
    };

    return { bot, framework, discordClient, stop };
}

if (require.main === module) {
    startApplication()
        .then(application => {
            process.once('SIGINT', () => application.stop());
            process.once('SIGTERM', () => application.stop());
        })
        .catch(error => {
            console.error(error.message);
            process.exitCode = 1;
        });
}

module.exports = { loadConfig, validateConfig, startApplication };
