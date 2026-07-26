'use strict';

const { Client, GatewayIntentBits } = require('discord.js');

function formatResult(result) {
    return `Result: ${result}`;
}

function formatSkyBlockStatus(skyblock) {
    const status = skyblock.status();
    return [
        `SkyBlock: ${status.joined ? 'joined' : 'not joined'}`,
        `Step: ${status.step} (${status.status})`,
        `Detail: ${status.message}`,
        status.error ? `Error: ${status.error}` : null
    ].filter(Boolean).join('\n');
}

module.exports = async function createDiscordController({ framework, config }) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });

    const commands = new Map([
        ['status', async () => {
            const state = framework.runtime.state;
            const skyblock = framework.ctx.getService('skyblock');
            return [
                `Engine: ${state.engine.state}`,
                `Connected: ${state.bot.connected}`,
                `Mode: ${state.mode.current || 'none'} (${state.mode.state})`,
                formatSkyBlockStatus(skyblock)
            ].join('\n');
        }],
        ['skyblock', async args => {
            const skyblock = framework.ctx.getService('skyblock');
            const action = (args[0] || 'status').toLowerCase();

            if (action === 'status') return formatSkyBlockStatus(skyblock);
            if (action === 'join' || action === 'start') {
                const result = await skyblock.startJoin('discord');
                return `${formatResult(result)}\n${formatSkyBlockStatus(skyblock)}`;
            }
            if (action === 'cancel') {
                return `${formatResult(skyblock.cancelJoin())}\n${formatSkyBlockStatus(skyblock)}`;
            }
            return 'Usage: !skyblock <status|join|cancel>';
        }],
        ['chat', async args => {
            const text = args.join(' ').trim();
            if (!text) return 'Usage: !chat <message or /command>';
            framework.bot.chat(text);
            return 'Đã gửi chat/command tới Minecraft.';
        }],
        ['click', async args => {
            const slot = Number(args[0]);
            if (!Number.isInteger(slot) || slot < 0) return 'Usage: !click <slot>';
            return formatResult(await framework.ctx.getService('gui').click(slot));
        }],
        ['start', async args => {
            const name = args[0];
            if (!name) {
                return `Usage: !start <${framework.ctx.getManager('mode').names().join('|')}>`;
            }

            return formatResult(await framework.ctx.getManager('mode').start(name));
        }],
        ['stop', async () => formatResult(await framework.ctx.getManager('mode').stop())],
        ['pause', async () => formatResult(await framework.ctx.getManager('mode').pause())],
        ['resume', async () => formatResult(await framework.ctx.getManager('mode').resume())],
        ['help', async () => 'Commands: !status, !skyblock <status|join|cancel>, !start <collector|dungeon>, !stop, !pause, !resume, !chat <message|/command>, !click <slot>']
    ]);

    client.once('ready', () => {
        framework.ctx.logger.info(`Discord controller online as ${client.user.tag}.`);
    });

    client.on('messageCreate', async message => {
        if (message.author.bot || !message.content.startsWith('!')) {
            return;
        }

        if (message.author.id !== config.discord.ownerId) {
            return;
        }

        const [name, ...args] = message.content.slice(1).trim().split(/\s+/);
        const command = commands.get(name.toLowerCase());

        if (!command) {
            await message.reply('Unknown command. Use !help.');
            return;
        }

        try {
            await message.reply(await command(args));
        }
        catch (error) {
            framework.ctx.errorHandler.handle(error, {
                phase: 'discord.command',
                command: name
            });
            await message.reply('Command failed. Check the bot log.');
        }
    });

    await client.login(config.discord.token);
    return client;
};
