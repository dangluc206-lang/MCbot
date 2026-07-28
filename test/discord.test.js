'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const DiscordCommandRegistry = require('../discord/DiscordCommandRegistry');
const DiscordInteractionRouter = require('../discord/DiscordInteractionRouter');
const DiscordPermissionManager = require('../discord/DiscordPermissionManager');
const DiscordResponse = require('../discord/DiscordResponse');
const Cooldown = require('../discord/middleware/Cooldown');
const Permission = require('../discord/constants/DiscordPermission');
const statusCommand = require('../discord/commands/system/status.command');
const shutdownCommand = require('../discord/commands/system/shutdown.command');

function interaction(overrides = {}) {
    const result = {
        user: { id: 'viewer', tag: 'viewer#0001' }, guildId: 'guild', member: { roles: { cache: new Map() } },
        commandName: 'test', customId: 'test', replied: false, deferred: false,
        client: { ws: { ping: 12 } }, options: { data: [], getInteger: () => null, getString: () => null },
        isChatInputCommand: () => true, isButton: () => false, isStringSelectMenu: () => false, isModalSubmit: () => false, isAutocomplete: () => false,
        async reply(payload) { this.replied = true; this.payload = payload; return payload; },
        async deferReply() { this.deferred = true; },
        async editReply(payload) { this.payload = payload; return payload; },
        async followUp(payload) { this.followup = payload; return payload; },
        ...overrides
    };
    return result;
}

function context() {
    const state = {
        bot: { connected: true }, engine: { state: 'RUNNING', lastError: null }, player: { health: 20, food: 20, level: 0, position: null }, mode: { current: null, state: 'IDLE' }, skyblock: { joined: false }, metrics: { reconnects: 0 }, inventory: { emptySlots: 36 }, startedAt: Date.now()
    };
    return {
        config: { minecraft: {}, discord: { ownerIds: 'owner' } }, runtime: { state }, logger: { info() {}, warn() {}, error() {} },
        errorHandler: { handle() {} },
        getService(name) { return name === 'inventory' ? { countEmptySlots: () => 36 } : null; },
        getManager() { return null; }
    };
}

test('permission manager resolves owner and role hierarchy', () => {
    const manager = new DiscordPermissionManager({ ownerIds: 'owner', permissions: { adminRoleIds: 'admin-role', moderatorRoleIds: 'mod-role', viewerRoleIds: 'view-role' } });
    assert.equal(manager.can(interaction({ user: { id: 'owner' } }), Permission.OWNER), true);
    assert.equal(manager.can(interaction({ member: { roles: { cache: new Map([['admin-role', {}]]) } } }), Permission.ADMIN), true);
    assert.equal(manager.can(interaction({ member: { roles: { cache: new Map([['mod-role', {}]]) } } }), Permission.ADMIN), false);
});

test('registry rejects duplicate command names', () => {
    const registry = new DiscordCommandRegistry();
    const command = { data: { name: 'test', toJSON: () => ({ name: 'test' }) }, execute() {} };
    registry.register(command);
    assert.throws(() => registry.register(command), /already registered/);
});

test('safe response edits a deferred interaction', async () => {
    const target = interaction({ deferred: true });
    await DiscordResponse.send(target, { content: 'ok' });
    assert.equal(target.payload.content, 'ok');
});

test('router denies unauthorized command before execute', async () => {
    const ctx = context();
    const registry = new DiscordCommandRegistry();
    let executed = false;
    registry.register({ data: { name: 'test', toJSON: () => ({ name: 'test' }) }, permission: Permission.OWNER, async execute() { executed = true; } });
    const router = new DiscordInteractionRouter({ getContext: () => ctx, registry, permissions: new DiscordPermissionManager(ctx.config.discord), cooldown: new Cooldown() });
    const target = interaction();
    await router.handle(target);
    assert.equal(executed, false);
    assert.equal(target.payload.embeds[0].data.title, 'Không thể thực hiện thao tác');
});

test('cooldown blocks repeated command from same user', () => {
    const cooldown = new Cooldown();
    const target = interaction();
    assert.equal(cooldown.check(target, 'status', 3), 0);
    assert.ok(cooldown.check(target, 'status', 3) > 0);
});

test('status command creates a dashboard response', async () => {
    const ctx = context();
    const target = interaction();
    await statusCommand.execute(ctx, target);
    assert.equal(target.payload.embeds[0].data.title, 'Minecraft Bot Dashboard');
});

test('router rejects minecraft command while bot is offline', async () => {
    const ctx = context();
    ctx.runtime.state.bot.connected = false;
    const registry = new DiscordCommandRegistry();
    registry.register({ data: { name: 'test', toJSON: () => ({ name: 'test' }) }, minecraftRequired: true, async execute() { throw new Error('must not execute'); } });
    const target = interaction();
    await new DiscordInteractionRouter({ getContext: () => ctx, registry, permissions: new DiscordPermissionManager(ctx.config.discord), cooldown: new Cooldown() }).handle(target);
    assert.match(target.payload.embeds[0].data.description, /Minecraft bot chưa sẵn sàng/);
});

test('unauthorized shutdown is rejected by router', async () => {
    const ctx = context();
    const registry = new DiscordCommandRegistry();
    registry.register(shutdownCommand);
    const target = interaction({ commandName: 'shutdown' });
    await new DiscordInteractionRouter({ getContext: () => ctx, registry, permissions: new DiscordPermissionManager(ctx.config.discord), cooldown: new Cooldown() }).handle(target);
    assert.match(target.payload.embeds[0].data.description, /không có quyền/);
});
