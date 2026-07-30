'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Events: DiscordEvents, MessageFlags } = require('discord.js');

const DiscordCommandRegistry = require('../discord/DiscordCommandRegistry');
const DiscordController = require('../discord/DiscordController');
const DiscordInteractionRouter = require('../discord/DiscordInteractionRouter');
const DiscordPermissionManager = require('../discord/DiscordPermissionManager');
const DiscordResponse = require('../discord/DiscordResponse');
const Cooldown = require('../discord/middleware/Cooldown');
const ConfirmationManager = require('../discord/ConfirmationManager');
const InventorySessionManager = require('../discord/InventorySessionManager');
const ControlPanelManager = require('../discord/ControlPanelManager');
const { ConfigPanelManager } = require('../discord/ConfigPanelManager');
const DiscordNotificationService = require('../discord/notifications/DiscordNotificationService');
const BotLifecycleService = require('../services/BotLifecycleService');
const auditLog = require('../discord/middleware/AuditLog');
const FrameworkEvents = require('../core/constants/Events');
const { validateConfig } = require('../index');
const Permission = require('../discord/constants/DiscordPermission');
const statusCommand = require('../discord/commands/system/status.command');
const shutdownCommand = require('../discord/commands/system/shutdown.command');
const personalVaultAuditCommand = require('../discord/commands/minecraft/pv-audit.command');

function interaction(overrides = {}) {
    const result = {
        user: { id: 'viewer', tag: 'viewer#0001' }, guildId: 'guild', member: { roles: { cache: new Map() } },
        commandName: 'test', customId: 'test', replied: false, deferred: false,
        client: { ws: { ping: 12 } }, options: { data: [], getInteger: () => null, getString: () => null },
        isChatInputCommand: () => true, isButton: () => false, isStringSelectMenu: () => false, isModalSubmit: () => false, isAutocomplete: () => false,
        async reply(payload) { this.replied = true; this.payload = payload; return payload; },
        async deferReply(payload) { this.deferred = true; this.deferPayload = payload; },
        async deferUpdate() { this.deferred = true; this.deferUpdated = true; },
        async editReply(payload) { this.payload = payload; return payload; },
        async followUp(payload) { this.followup = payload; return payload; },
        async update(payload) { this.replied = true; this.payload = payload; return payload; },
        async respond(payload) { this.autocomplete = payload; return payload; },
        ...overrides
    };
    return result;
}

class FakeDiscordClient extends EventEmitter {
    constructor({ emitReady = true, loginError = null } = {}) {
        super();
        this.emitReady = emitReady;
        this.loginError = loginError;
        this.user = { tag: 'mcbot#0001' };
        this.ws = { ping: 0 };
        this.channels = { fetch: async () => null };
        this.destroyed = false;
        this.loginCalls = 0;
    }

    async login(token) {
        this.loginCalls += 1;
        this.token = token;
        if (this.loginError) throw this.loginError;
        if (this.emitReady) queueMicrotask(() => this.emit(DiscordEvents.ClientReady, this));
        return token;
    }

    destroy() {
        this.destroyed = true;
    }
}

function controllerContext(discord = {}) {
    const ctx = context();
    ctx.config = {
        minecraft: {},
        discord: {
            enabled: true,
            token: 'test-token',
            ownerIds: 'owner',
            defaultEphemeral: true,
            ...discord
        }
    };
    return ctx;
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

test('lifecycle adapter forwards a Control Panel force-connect request unchanged', async () => {
    const ctx = context();
    let received = null;
    const lifecycle = new BotLifecycleService(ctx, {
        connect: async options => {
            received = options;
            return 'CONNECTING';
        }
    });
    assert.equal(await lifecycle.connect({ force: true, source: 'discord-control-panel' }), 'CONNECTING');
    assert.deepEqual(received, { force: true, source: 'discord-control-panel' });
});

test('permission manager resolves owner and role hierarchy', () => {
    const manager = new DiscordPermissionManager({ ownerIds: 'owner', permissions: { adminRoleIds: 'admin-role', moderatorRoleIds: 'mod-role', viewerRoleIds: 'view-role' } });
    assert.equal(manager.can(interaction({ user: { id: 'owner' } }), Permission.OWNER), true);
    assert.equal(manager.can(interaction({ member: { roles: { cache: new Map([['admin-role', {}]]) } } }), Permission.ADMIN), true);
    assert.equal(manager.can(interaction({ member: { roles: { cache: new Map([['mod-role', {}]]) } } }), Permission.ADMIN), false);
    assert.equal(new DiscordPermissionManager({ ownerIds: 'owner' }).can(interaction(), Permission.VIEWER), false);
});

test('PV2 audit formats every stack into a Discord attachment report', () => {
    const report = personalVaultAuditCommand.formatAuditFile([
        {
            vaultSlot: 7,
            carrier: 'player_head',
            count: 64,
            displayName: 'Khối Vàng Tinh Luyện ✦',
            recipeSlot: 25,
            recipeName: 'Khối vàng tinh luyện',
            labels: ['Khối Vàng Tinh Luyện ✦', 'Player Head']
        },
        {
            vaultSlot: 8,
            carrier: 'player_head',
            count: 1,
            displayName: 'Vật phẩm khác',
            recipeSlot: null,
            recipeName: null,
            labels: ['Vật phẩm khác']
        }
    ]);
    assert.match(report, /#7 \| player_head x64/);
    assert.match(report, /map: slot 25 \(Khối vàng tinh luyện\)/);
    assert.match(report, /#8 \| player_head x1/);
    assert.match(report, /map: UNKNOWN/);
});

test('permission manager parses trimmed role IDs and preserves hierarchy', () => {
    const manager = new DiscordPermissionManager({
        ownerIds: ' owner ',
        permissions: { viewerRoleIds: ' viewer-role , another-role ' }
    });
    const viewer = interaction({ member: { roles: { cache: new Map([['viewer-role', {}]]) } } });
    assert.equal(manager.can(viewer, Permission.VIEWER), true);
    assert.equal(manager.can(viewer, Permission.MODERATOR), false);
});

test('registry rejects duplicate command names', () => {
    const registry = new DiscordCommandRegistry();
    const command = { data: { name: 'test', toJSON: () => ({ name: 'test' }) }, execute() {} };
    registry.register(command);
    assert.throws(() => registry.register(command), /already registered/);
});

test('registry rejects invalid and duplicate component handlers', () => {
    const registry = new DiscordCommandRegistry();
    const handler = { async execute() {} };
    registry.registerButton('button:test', handler);
    assert.throws(() => registry.registerButton('button:test', handler), /already registered/);
    assert.throws(() => registry.registerModal('', handler), /Invalid Discord modal/);
});

test('safe response edits a deferred interaction', async () => {
    const target = interaction({ deferred: true });
    await DiscordResponse.send(target, { content: 'ok' });
    assert.equal(target.payload.content, 'ok');
});

test('safe response uses reply, editReply, and followUp without invalid deferred flags', async () => {
    const client = { mcbotController: { ctx: { config: { discord: { defaultEphemeral: true } } } } };
    const first = interaction({ client });
    await DiscordResponse.send(first, { content: 'first' });
    assert.equal(first.payload.flags, MessageFlags.Ephemeral);

    const deferred = interaction({ client, deferred: true });
    await DiscordResponse.send(deferred, { content: 'edit' });
    assert.equal(deferred.payload.flags, undefined);

    const replied = interaction({ client, replied: true });
    await DiscordResponse.send(replied, { content: 'follow-up' });
    assert.equal(replied.followup.flags, MessageFlags.Ephemeral);
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

test('router safely rejects stale component interactions', async () => {
    const ctx = context();
    const target = interaction({
        isChatInputCommand: () => false,
        isButton: () => true,
        customId: 'removed:button'
    });
    const router = new DiscordInteractionRouter({
        getContext: () => ctx,
        registry: new DiscordCommandRegistry(),
        permissions: new DiscordPermissionManager(ctx.config.discord),
        cooldown: new Cooldown()
    });
    await router.handle(target);
    assert.match(target.payload.embeds[0].data.description, /hết hạn/);
});

test('router ignores an expired interaction response instead of reporting Discord error 10062', async () => {
    let handled = 0;
    let debugged = 0;
    const ctx = context();
    ctx.errorHandler = { handle() { handled += 1; } };
    ctx.logger = { debug() { debugged += 1; }, info() {}, warn() {}, error() {} };
    const target = interaction({
        reply: async () => {
            const error = new Error('Unknown interaction');
            error.code = 10062;
            throw error;
        }
    });
    const registry = new DiscordCommandRegistry();
    registry.register({ data: { name: 'test', toJSON: () => ({ name: 'test' }) }, permission: Permission.OWNER, async execute() {} });
    const router = new DiscordInteractionRouter({
        getContext: () => ctx,
        registry,
        permissions: new DiscordPermissionManager(ctx.config.discord),
        cooldown: new Cooldown()
    });

    await router.handle(target);
    assert.equal(handled, 0);
    assert.equal(debugged, 1);
});

test('router checks permission again for button interactions', async () => {
    const ctx = context();
    const registry = new DiscordCommandRegistry();
    let executed = false;
    registry.registerButton('owner:button', { permission: Permission.OWNER, async execute() { executed = true; } });
    const target = interaction({
        isChatInputCommand: () => false,
        isButton: () => true,
        customId: 'owner:button'
    });
    await new DiscordInteractionRouter({ getContext: () => ctx, registry, permissions: new DiscordPermissionManager(ctx.config.discord), cooldown: new Cooldown() }).handle(target);
    assert.equal(executed, false);
    assert.match(target.payload.embeds[0].data.description, /không có quyền/);
});

test('router routes button, select, modal, and autocomplete contracts', async () => {
    const ctx = context();
    const registry = new DiscordCommandRegistry();
    const permissions = new DiscordPermissionManager(ctx.config.discord);
    const router = new DiscordInteractionRouter({ getContext: () => ctx, registry, permissions, cooldown: new Cooldown() });
    const seen = [];
    const handler = { permission: Permission.OWNER, async execute(_ctx, target) { seen.push(target.customId); } };
    registry.registerButton('button:test', handler);
    registry.registerSelect('select:test', handler);
    registry.registerModal('modal:test', handler);
    registry.register({
        data: { name: 'auto', toJSON: () => ({ name: 'auto' }) },
        permission: Permission.OWNER,
        async execute() {},
        async autocomplete(_ctx, target) { await target.respond([{ name: 'collector', value: 'collector' }]); }
    });

    await router.handle(interaction({ user: { id: 'owner' }, isChatInputCommand: () => false, isButton: () => true, customId: 'button:test' }));
    await router.handle(interaction({ user: { id: 'owner' }, isChatInputCommand: () => false, isStringSelectMenu: () => true, customId: 'select:test' }));
    await router.handle(interaction({ user: { id: 'owner' }, isChatInputCommand: () => false, isModalSubmit: () => true, customId: 'modal:test' }));
    const auto = interaction({ user: { id: 'owner' }, commandName: 'auto', isChatInputCommand: () => false, isAutocomplete: () => true });
    await router.handle(auto);

    assert.deepEqual(seen, ['button:test', 'select:test', 'modal:test']);
    assert.deepEqual(auto.autocomplete, [{ name: 'collector', value: 'collector' }]);
});

test('router defers a long command with matching ephemeral visibility', async () => {
    const ctx = context();
    const registry = new DiscordCommandRegistry();
    registry.register({
        data: { name: 'slow', toJSON: () => ({ name: 'slow' }) },
        permission: Permission.OWNER,
        defer: true,
        async execute(_ctx, target) { return DiscordResponse.send(target, { content: 'done' }); }
    });
    const target = interaction({
        user: { id: 'owner' },
        commandName: 'slow',
        client: { mcbotController: { ctx: { config: { discord: { defaultEphemeral: true } } } } }
    });
    await new DiscordInteractionRouter({ getContext: () => ctx, registry, permissions: new DiscordPermissionManager(ctx.config.discord), cooldown: new Cooldown() }).handle(target);
    assert.equal(target.deferPayload.flags, MessageFlags.Ephemeral);
    assert.equal(target.payload.flags, undefined);
});

test('router defers a long button interaction and edits its original message', async () => {
    const ctx = context();
    const registry = new DiscordCommandRegistry();
    registry.registerButton('slow:button', {
        permission: Permission.OWNER,
        defer: true,
        async execute(_ctx, target) {
            assert.equal(target.deferred, true);
            return target.editReply({ content: 'updated' });
        }
    });
    const target = interaction({
        user: { id: 'owner' },
        isChatInputCommand: () => false,
        isButton: () => true,
        customId: 'slow:button'
    });
    await new DiscordInteractionRouter({ getContext: () => ctx, registry, permissions: new DiscordPermissionManager(ctx.config.discord), cooldown: new Cooldown() }).handle(target);
    assert.equal(target.deferUpdated, true);
    assert.equal(target.payload.content, 'updated');
});

test('cooldown blocks repeated command from same user', () => {
    const cooldown = new Cooldown();
    const target = interaction();
    assert.equal(cooldown.check(target, 'status', 3), 0);
    assert.ok(cooldown.check(target, 'status', 3) > 0);
});

test('cooldown isolates users/commands and bounds cached entries', () => {
    let now = 1000;
    const cooldown = new Cooldown({ maxEntries: 2, ttlMs: 50, now: () => now });
    const first = interaction({ user: { id: 'one' } });
    const second = interaction({ user: { id: 'two' } });
    assert.equal(cooldown.check(first, 'status', 1), 0);
    assert.equal(cooldown.check(second, 'status', 1), 0);
    assert.equal(cooldown.check(first, 'health', 1), 0);
    assert.equal(cooldown.entries.size, 2);
    now += 1001;
    assert.equal(cooldown.check(first, 'status', 1), 0);
    assert.equal(cooldown.entries.size, 1);
});

test('sessions expire, remain private, and confirmations are not consumed by another user', () => {
    let now = 1000;
    const sessions = new InventorySessionManager({ ttlMs: 50, now: () => now });
    const sessionId = sessions.create('owner', []);
    assert.equal(sessions.get(sessionId, 'other'), null);
    assert.ok(sessions.get(sessionId, 'owner'));
    now += 1001;
    assert.equal(sessions.get(sessionId, 'owner'), null);

    const confirmations = new ConfirmationManager({ ttlMs: 50, now: () => now });
    const confirmationId = confirmations.create('owner', { type: 'drop' });
    assert.equal(confirmations.take(confirmationId, 'other'), null);
    assert.deepEqual(confirmations.take(confirmationId, 'owner'), { type: 'drop' });
});

test('status command creates a dashboard response', async () => {
    const ctx = context();
    ctx.runtime.state.storage = {
        gui: {
            updatedAt: Date.now(),
            detail: { storage: { total: 800000, used: 453724, free: 346276 } }
        }
    };
    ctx.runtime.state.personalVault = {
        status: 'READY',
        updatedAt: Date.now(),
        items: [
            { displayName: 'red', count: 605 },
            { displayName: 'aqua', count: 50 }
        ]
    };
    const target = interaction();
    await statusCommand.execute(ctx, target);
    assert.equal(target.payload.embeds[0].data.title, 'Minecraft Bot Dashboard');
    const storageField = target.payload.embeds[0].data.fields.find(field => field.name === 'Kho NPC');
    assert.match(storageField.value, /Còn trống: \*\*346\.276\*\*/);
    assert.doesNotMatch(storageField.value, /Slot|Đã dùng|Tổng|Thông tin kho/);
    const vaultField = target.payload.embeds[0].data.fields.find(field => field.name === 'Kho cá nhân (/pv 2)');
    assert.match(vaultField.value, /Đã đọc: 2 stack • 655 item/);
    assert.doesNotMatch(vaultField.value, /READY|red|aqua/);
});

test('router rejects minecraft command while bot is offline', async () => {
    const ctx = context();
    ctx.runtime.state.bot.connected = false;
    const registry = new DiscordCommandRegistry();
    registry.register({ data: { name: 'test', toJSON: () => ({ name: 'test' }) }, minecraftRequired: true, async execute() { throw new Error('must not execute'); } });
    const target = interaction({ user: { id: 'owner' } });
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

test('DiscordController starts once, cleans resources, and handles disabled Discord', async () => {
    const client = new FakeDiscordClient();
    const controller = new DiscordController(controllerContext(), { createClient: () => client, readyTimeoutMs: 100 });
    assert.equal(await controller.start(), 'SUCCESS');
    assert.equal(controller.isStarted(), true);
    assert.equal(await controller.start(), 'NO_ACTION');
    assert.equal(await controller.stop(), 'SUCCESS');
    assert.equal(client.destroyed, true);
    assert.equal(await controller.stop(), 'NO_ACTION');

    let created = false;
    const disabled = new DiscordController(controllerContext({ enabled: false }), {
        createClient: () => { created = true; return new FakeDiscordClient(); }
    });
    assert.equal(await disabled.start(), 'NO_ACTION');
    assert.equal(created, false);
});

test('DiscordController times out and destroys a client that never becomes ready', async () => {
    const client = new FakeDiscordClient({ emitReady: false });
    const controller = new DiscordController(controllerContext(), { createClient: () => client, readyTimeoutMs: 100 });
    await assert.rejects(controller.start(), /did not become ready/);
    assert.equal(client.destroyed, true);
    assert.equal(client.listenerCount(DiscordEvents.InteractionCreate), 0);
});

test('ControlPanelManager recreates a deleted persistent dashboard message', async () => {
    const events = new EventEmitter();
    const ctx = context();
    ctx.config.discord = { controlChannelId: 'control', liveStatusIntervalMs: 60000 };
    ctx.getManager = name => name === 'events' ? events : null;
    let stale = false;
    const oldMessage = {
        author: { id: 'bot' },
        embeds: [{ title: 'Minecraft Bot Dashboard' }],
        async edit() {
            stale = true;
            const error = new Error('Unknown Message');
            error.code = 10008;
            throw error;
        }
    };
    const replacement = { author: { id: 'bot' }, embeds: [{ title: 'Minecraft Bot Dashboard' }], async edit() {} };
    const channel = {
        isTextBased: () => true,
        messages: { fetch: async () => stale ? new Map() : new Map([['old', oldMessage]]) },
        async send() { return replacement; }
    };
    const client = { user: { id: 'bot' }, channels: { fetch: async () => channel } };
    const manager = new ControlPanelManager(ctx, client);
    await manager.start();
    await manager.refresh();
    assert.equal(manager.message, replacement);
    manager.stop();
});

test('ControlPanelManager clamps invalid refresh intervals and avoids duplicate event bindings', async () => {
    const events = new EventEmitter();
    const ctx = context();
    ctx.config.discord = { controlChannelId: 'control', liveStatusIntervalMs: 0 };
    ctx.getManager = name => name === 'events' ? events : null;
    const message = { author: { id: 'bot' }, embeds: [{ title: 'Minecraft Bot Dashboard' }], async edit() {} };
    const channel = {
        isTextBased: () => true,
        messages: { fetch: async () => new Map([['panel', message]]) },
        async send() { return message; }
    };
    const manager = new ControlPanelManager(ctx, { user: { id: 'bot' }, channels: { fetch: async () => channel } });

    await manager.start();
    await manager.start();
    assert.equal(manager.intervalMs, 1000);
    assert.equal(events.listenerCount(FrameworkEvents.GUI.OPEN), 1);
    manager.stop();
    assert.equal(events.listenerCount(FrameworkEvents.GUI.OPEN), 0);
});

test('ConfigPanelManager refreshes its persistent message after a modal save', async () => {
    const ctx = context();
    ctx.config = {
        discord: { configChannelId: 'config' },
        skyblock: { serverSlot: 12 },
        dungeon: { entrySlot: 12 },
        fishing: { afkSlots: [11] },
        storage: { selectedOres: [], oreOptions: [] }
    };
    ctx.runtime.state.storage = { gui: {} };
    const edits = [];
    const message = {
        author: { id: 'bot' },
        embeds: [{ title: 'Bot Configuration' }],
        async edit(payload) { edits.push(payload); }
    };
    const channel = {
        isTextBased: () => true,
        messages: { fetch: async () => new Map() },
        async send() { return message; }
    };
    const manager = new ConfigPanelManager(ctx, { user: { id: 'bot' }, channels: { fetch: async () => channel } });
    await manager.start();
    await manager.refresh('Đã lưu storage.sellAtSegments.');
    assert.equal(edits[0].content, 'Đã lưu storage.sellAtSegments.');
    manager.stop();
});

test('notification service can operate with only an error channel and cleans event listeners', async () => {
    const events = new EventEmitter();
    const sent = [];
    const errorChannel = { isTextBased: () => true, async send(payload) { sent.push(payload); } };
    const ctx = context();
    ctx.config.discord = { errorChannelId: 'errors' };
    ctx.getManager = name => name === 'events' ? events : null;
    const service = new DiscordNotificationService(ctx, { channels: { fetch: async () => errorChannel } });
    await service.start();
    events.emit(FrameworkEvents.Engine.ERROR, new Error('boom'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(sent.length, 1);
    service.stop();
    assert.equal(events.listenerCount(FrameworkEvents.Engine.ERROR), 0);
});

test('validateConfig rejects an enabled Discord controller without token or owner', () => {
    const minecraft = { host: 'localhost', username: 'bot' };
    assert.throws(() => validateConfig({ minecraft, discord: { enabled: true, token: '', ownerIds: 'owner' } }), /DISCORD_TOKEN/);
    assert.throws(() => validateConfig({ minecraft, discord: { enabled: true, token: 'token', ownerIds: '' } }), /DISCORD_OWNER_IDS/);
    assert.doesNotThrow(() => validateConfig({ minecraft, discord: { enabled: false } }));
});

test('audit log redacts raw Minecraft commands and marks dangerous actions as warnings', () => {
    const entries = [];
    const ctx = { logger: { info(message) { entries.push(['info', message]); }, warn(message) { entries.push(['warn', message]); } } };
    const target = interaction({
        commandName: 'command',
        options: { data: [{ name: 'command', value: '/login hidden-password' }] }
    });
    auditLog(ctx, target, 'command', Date.now() - 5, 'SUCCESS');
    assert.equal(entries[0][0], 'warn');
    assert.match(entries[0][1], /command=\[redacted\]/);
    assert.doesNotMatch(entries[0][1], /hidden-password/);
});
