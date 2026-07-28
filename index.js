'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');

const Framework = require('./Framework');
const DiscordController = require('./discord/DiscordController');
const Events = require('./core/constants/Events');
const BotLifecycleService = require('./services/BotLifecycleService');

function zonedClock(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = Number(part.value);
        return result;
    }, {});
    return { hour: parts.hour, minute: parts.minute };
}

function resetWaitDelay(now, resetConfig = {}) {
    const hours = resetConfig.hours || [3, 5];
    const waitMinutes = resetConfig.waitMinutes ?? 10;
    const preWaitMinutes = resetConfig.preWaitMinutes ?? 1;
    const timeZone = resetConfig.timeZone || 'Asia/Ho_Chi_Minh';
    const { hour, minute } = zonedClock(now, timeZone);
    const elapsedInMinute = now.getSeconds() * 1000 + now.getMilliseconds();

    for (const resetHour of hours) {
        if (hour === resetHour && minute < waitMinutes) {
            return {
                delay: (waitMinutes - minute) * 60000 - elapsedInMinute,
                resetHour
            };
        }
        const previousHour = (resetHour + 23) % 24;
        if (hour === previousHour && minute >= 60 - preWaitMinutes) {
            return {
                delay: (60 - minute + waitMinutes) * 60000 - elapsedInMinute,
                resetHour
            };
        }
    }
    return null;
}

function nextResetDelay(now, resetConfig = {}) {
    const hours = resetConfig.hours || [3, 5];
    const timeZone = resetConfig.timeZone || 'Asia/Ho_Chi_Minh';
    const minuteStart = Math.floor(now.getTime() / 60000) * 60000;
    for (let offset = 1; offset <= 24 * 60 + 1; offset += 1) {
        const candidate = new Date(minuteStart + offset * 60000);
        const clock = zonedClock(candidate, timeZone);
        if (clock.minute === 0 && hours.includes(clock.hour)) {
            return candidate.getTime() - now.getTime();
        }
    }
    return 24 * 60 * 60 * 1000;
}

function loadConfig(configPath = path.join(__dirname, 'config', 'config.json')) {
    const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const minecraft = fileConfig.minecraft || {};
    const skyblock = fileConfig.skyblock || {};

    const loaded = {
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
            // Discord is process configuration, never gameplay configuration.
            // Do not fall back to config.json: it can be written by the Config
            // Panel and must not become a source of tokens or access control.
            enabled: String(process.env.DISCORD_ENABLED || 'false').toLowerCase() === 'true',
            token: process.env.DISCORD_TOKEN || '',
            ownerId: process.env.DISCORD_OWNER_ID || '',
            ownerIds: process.env.DISCORD_OWNER_IDS || '',
            controlChannelId: process.env.DISCORD_CONTROL_CHANNEL_ID || '',
            configChannelId: process.env.DISCORD_CONFIG_CHANNEL_ID || '',
            notificationChannelId: process.env.DISCORD_NOTIFICATION_CHANNEL_ID || '',
            errorChannelId: process.env.DISCORD_ERROR_CHANNEL_ID || '',
            defaultEphemeral: process.env.DISCORD_DEFAULT_EPHEMERAL
                ? process.env.DISCORD_DEFAULT_EPHEMERAL === 'true'
                : true,
            liveStatusIntervalMs: Number(process.env.DISCORD_LIVE_STATUS_INTERVAL_MS || 5000)
        },
        skyblock: {
            ...skyblock,
            loginPassword: process.env.SKYBLOCK_LOGIN_PASSWORD || ''
        }
    };
    Object.defineProperty(loaded, 'configPath', { value: configPath, enumerable: false });
    return loaded;
}

function validateConfig(config) {
    const required = ['host', 'username'];
    const missing = required.filter(key => !config.minecraft?.[key]);

    if (missing.length > 0) {
        throw new Error(`Missing Minecraft configuration: ${missing.join(', ')}`);
    }

    if (config.discord.enabled && config.discord.token && !config.discord.ownerId && !config.discord.ownerIds) {
        throw new Error('DISCORD_OWNER_IDS is required when Discord is enabled.');
    }
}

function startLiveViewer(bot, viewerConfig = {}) {
    if (!viewerConfig.enabled) return () => {};

    let started = false;
    const start = () => {
        if (started || !bot.entity) return;
        started = true;
        const viewer = require('prismarine-viewer').mineflayer;
        viewer(bot, {
            port: viewerConfig.port ?? 3000,
            viewDistance: viewerConfig.viewDistance ?? 6,
            firstPerson: true,
            prefix: viewerConfig.prefix || ''
        });
        console.log(`Live bot view started on port ${viewerConfig.port ?? 3000}.`);
    };

    if (bot.entity) start();
    else bot.once('spawn', start);

    return () => {
        bot.removeListener('spawn', start);
        bot.viewer?.close?.();
    };
}

async function startApplication(config = loadConfig()) {
    validateConfig(config);
    let stopping = false;
    let reconnecting = false;
    let reconnectTimer = null;
    let resetTimer = null;
    let reconnectAttempt = 0;
    let connection = null;
    let discordController = null;
    const application = { bot: null, framework: null, discordClient: null, stop: null };

    const activeModeName = framework => {
        const modes = framework.ctx.getManager('mode');
        return modes.names().find(name => modes.get(name) === modes.current()) || null;
    };

    const closeConnection = async (target, quit = false) => {
        if (!target) return;
        await target.framework.stop();
        target.stopViewer();
        if (quit && target.bot.quit) target.bot.quit('Application stopped');
    };

    const createConnection = async () => {
        const bot = mineflayer.createBot(config.minecraft);
        bot.loadPlugin(pathfinder);
        const framework = new Framework(bot, config);
        const result = await framework.start();
        if (result !== 'SUCCESS') throw new Error(`Framework failed to start: ${result}`);
        const lifecycle = new BotLifecycleService(framework.ctx, {
            connect: () => requestMinecraftConnect(),
            restart: () => requestMinecraftRestart(),
            shutdown: () => application.stop()
        });
        framework.ctx.registerService('lifecycle', lifecycle);
        await lifecycle.initialize();
        const stopViewer = startLiveViewer(bot, config.viewer || {});
        return { bot, framework, stopViewer };
    };

    const scheduleReconnect = (reason, options = {}) => {
        if (stopping || reconnectTimer || reconnecting) return;
        const modeToResume = activeModeName(connection.framework);
        const baseDelay = config.minecraft.reconnectDelayMs ?? 5000;
        const maxDelay = config.minecraft.reconnectMaxDelayMs ?? 60000;
        const retryDelay = Math.min(baseDelay * (2 ** reconnectAttempt), maxDelay);
        const resetWait = resetWaitDelay(new Date(), config.serverReset);
        const delay = Math.max(options.delayMs ?? retryDelay, resetWait?.delay || 0);
        reconnectAttempt += 1;
        const resetMessage = resetWait
            ? ` Server reset ${String(resetWait.resetHour).padStart(2, '0')}:00; chờ tới sau reset.`
            : '';
        connection.framework.ctx.logger.warn(`Mất kết nối (${reason || 'unknown'}); reconnect sau ${Math.ceil(delay / 1000)} giây.${resetMessage}`);
        reconnectTimer = setTimeout(async () => {
            reconnectTimer = null;
            reconnecting = true;
            try {
                await closeConnection(connection);
                connection = await createConnection();
                application.bot = connection.bot;
                application.framework = connection.framework;
                if (discordController) await discordController.updateContext(connection.framework.ctx);
                application.discordClient = discordController?.client || null;
                reconnectAttempt = 0;
                bindReconnect(connection);
                if (modeToResume || options.joinSkyblock) {
                    const resumedConnection = connection;
                    const joinAfterReconnect = () => {
                        resumedConnection.framework.ctx.getService('skyblock').startJoin(options.joinSkyblock ? 'scheduled-reset' : 'reconnect');
                    };
                    if (resumedConnection.framework.runtime.state.bot.connected) joinAfterReconnect();
                    else resumedConnection.framework.ctx.getManager('events').once(Events.Connection.CONNECTED, joinAfterReconnect);
                    if (modeToResume) resumedConnection.framework.ctx.getManager('events').once(Events.SkyBlock.JOINED, async () => {
                        const delay = modeToResume === 'dungeon'
                            ? (config.dungeon?.reentryDelayMs ?? 300000)
                            : 0;
                        if (delay > 0) {
                            resumedConnection.framework.ctx.logger.info(`Đã vào SkyBlock; chờ ${delay / 1000} giây trước khi tiếp tục Dungeon.`);
                            await new Promise(resolve => {
                                const timer = setTimeout(resolve, delay);
                                timer.unref?.();
                            });
                        }
                        if (stopping || connection !== resumedConnection || resumedConnection.framework.ctx.getManager('mode').current()) return;
                        const resumed = await resumedConnection.framework.ctx.getManager('mode').start(modeToResume);
                        resumedConnection.framework.ctx.logger.info(`Đã tiếp tục mode ${modeToResume} sau reconnect: ${resumed}.`);
                    });
                }
            }
            catch (error) {
                console.error(`Reconnect failed: ${error.message}`);
                reconnecting = false;
                scheduleReconnect(error.message);
                return;
            }
            reconnecting = false;
        }, delay);
        reconnectTimer.unref?.();
    };

    const bindReconnect = target => {
        target.bot.once('kicked', reason => scheduleReconnect(`kicked: ${String(reason)}`));
        target.bot.once('end', reason => scheduleReconnect(`end: ${reason || 'socketClosed'}`));
        target.bot.once('error', error => scheduleReconnect(`error: ${error?.message || error}`));
    };

    const requestMinecraftConnect = async () => {
        if (stopping || reconnecting) return 'BUSY';
        if (connection?.framework.runtime.state.bot.connected) return 'ALREADY_CONNECTED';
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        scheduleReconnect('Discord connect request', { delayMs: 0 });
        return 'CONNECTING';
    };

    const requestMinecraftRestart = async () => {
        if (stopping || reconnecting) return 'BUSY';
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        scheduleReconnect('Discord restart request', { delayMs: 0 });
        connection?.bot.quit?.('Discord restart request');
        return 'PENDING';
    };

    const scheduleServerReset = () => {
        const delay = nextResetDelay(new Date(), config.serverReset);
        resetTimer = setTimeout(() => {
            resetTimer = null;
            if (!stopping && connection && !reconnectTimer && !reconnecting) {
                connection.framework.ctx.logger.warn('Server reset scheduled; chờ 10 phút trước khi vào lại SkyBlock.');
                scheduleReconnect('scheduled reset', { joinSkyblock: true });
                connection.bot.quit?.('Scheduled server reset');
            }
            if (!stopping) scheduleServerReset();
        }, delay);
        resetTimer.unref?.();
    };

    connection = await createConnection();
    application.bot = connection.bot;
    application.framework = connection.framework;
    if (config.discord.enabled && config.discord.token) {
        discordController = new DiscordController(connection.framework.ctx);
        await discordController.start();
        application.discordClient = discordController.client;
    }
    bindReconnect(connection);
    scheduleServerReset();

    const stop = async () => {
        if (stopping) {
            return;
        }

        stopping = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = null;
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = null;
        await discordController?.stop();
        await closeConnection(connection, true);
    };
    application.stop = stop;
    return application;
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

module.exports = { loadConfig, validateConfig, startApplication, startLiveViewer, resetWaitDelay, nextResetDelay };
