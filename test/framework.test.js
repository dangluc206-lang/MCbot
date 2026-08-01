'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Vec3 } = require('vec3');

const FrameworkBase = require('../Framework');
const Runtime = require('../core/runtime/Runtime');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const {
    activeModeName,
    createModeResumeTracker,
    bindModeResumeTracker,
    kickReconnectDelayMs,
    reconnectDelayAfterKick,
    resetWaitDelay,
    nextResetDelay
} = require('../index');
const { itemLabels } = require('../utils/ItemLabels');
const ServerCommandService = require('../services/ServerCommandService');

// Keep legacy unit tests fast. Production defaults to a six-second command
// hold after GUI close; individual tests opt in when timing is under test.
class Framework extends FrameworkBase {
    constructor(bot, config = {}) {
        super(bot, {
            ...config,
            minecraft: {
                commandAfterGuiCloseDelayMs: 0,
                ...(config.minecraft || {})
            },
            crafting: {
                ...(config.crafting || {}),
                personalVault: {
                    commandCooldownMs: 0,
                    ...(config.crafting?.personalVault || {})
                }
            },
            storage: {
                ...(config.storage || {}),
                smelting: {
                    enabled: false,
                    ...(config.storage?.smelting || {})
                },
                conversion: {
                    enabled: false,
                    ...(config.storage?.conversion || {})
                }
            }
        });
    }
}

class FakeBot extends EventEmitter {
    constructor() {
        super();
        this.entity = { id: 1 };
        this.inventory = {
            items: () => [],
            emptySlotCount: () => 36,
            slots: Array(46)
        };
        this.quickBarSlot = 0;
        this.chatMessages = [];
        this.clickedSlots = [];
        this.clickedActions = [];
    }

    chat(message) {
        this.chatMessages.push(message);
    }

    async clickWindow(slot, mouseButton = 0, mode = 0) {
        this.clickedSlots.push(slot);
        this.clickedActions.push({ slot, mouseButton, mode });
    }

    closeWindow() {
        this.emit('windowClose');
    }
}

async function waitFor(predicate, timeout = 250) {
    const startedAt = Date.now();
    while (!predicate()) {
        if (Date.now() - startedAt > timeout) {
            throw new Error('Timed out waiting for test condition.');
        }
        await new Promise(resolve => setTimeout(resolve, 2));
    }
}

function createServerCommandService(config, chatService) {
    return new ServerCommandService({
        bot: null,
        runtime: { state: {} },
        config,
        logger: null,
        getService: name => name === 'chat' ? chatService : null
    });
}

test('ServerCommandService sells only configured storage conversion targets', async () => {
    const calls = [];
    const chatService = {
        sendCommand: async (...args) => {
            calls.push(args);
            return Result.PENDING;
        }
    };
    const options = { beforeSend: () => {} };
    const service = createServerCommandService({
        storage: {
            sellCommand: '/kho sell',
            conversion: { targetItems: ['diamond'] }
        }
    }, chatService);

    assert.equal(await service.sellStorage('diamond', options), Result.PENDING);
    assert.deepEqual(calls, [['/kho sell diamond', options]]);

    for (const ore of ['coal', 'diamond\nore', 'diamond\rore']) {
        assert.equal(await service.sellStorage(ore, options), Result.FAILED);
    }
    assert.equal(calls.length, 1);
});

test('ServerCommandService rejects missing or invalid storage conversion targets safely', async () => {
    const calls = [];
    const chatService = {
        sendCommand: async (...args) => calls.push(args)
    };

    for (const config of [
        {},
        { storage: { sellCommand: '/kho sell' } },
        { storage: { sellCommand: '/kho sell', conversion: { targetItems: 'diamond' } } }
    ]) {
        const service = createServerCommandService(config, chatService);
        assert.equal(await service.sellStorage('diamond'), Result.FAILED);
    }
    assert.deepEqual(calls, []);
});

test('ServerCommandService resolves the SkyBlock selector command without using islandCommand', async () => {
    const calls = [];
    const chatService = {
        sendCommand: async (...args) => {
            calls.push(args);
            return Result.PENDING;
        }
    };
    const options = { beforeSend: () => {} };
    const primaryService = createServerCommandService({
        serverCommands: { skyblockSelector: 'server-selector' },
        skyblock: { selectorCommand: 'skyblock-selector', islandCommand: '/is' }
    }, chatService);

    assert.equal(await primaryService.openSkyBlockSelector(options), Result.PENDING);
    assert.deepEqual(calls, [['/server-selector', options]]);

    const selectorService = createServerCommandService({
        skyblock: { selectorCommand: 'skyblock-selector', islandCommand: '/is' }
    }, chatService);
    assert.equal(await selectorService.openSkyBlockSelector(), Result.PENDING);

    const fallbackService = createServerCommandService({
        skyblock: { islandCommand: '/is' }
    }, chatService);
    assert.equal(await fallbackService.openSkyBlockSelector(), Result.PENDING);
    assert.equal(await fallbackService.goIsland(), Result.PENDING);
    assert.deepEqual(calls.slice(1), [
        ['/skyblock-selector', undefined],
        ['/skyblock', undefined],
        ['/is', undefined]
    ]);

    const invalidService = createServerCommandService({
        serverCommands: { skyblockSelector: 'bad\ncommand' },
        skyblock: { islandCommand: '/is' }
    }, chatService);
    assert.equal(await invalidService.openSkyBlockSelector(), Result.FAILED);
    assert.equal(calls.length, 4);
});

test('framework can restart after a clean shutdown', async () => {
    const framework = new Framework(new FakeBot(), {});

    assert.equal(await framework.start(), Result.SUCCESS);
    assert.equal(await framework.stop(), Result.SUCCESS);
    assert.equal(await framework.start(), Result.SUCCESS);
    assert.equal(await framework.stop(), Result.SUCCESS);
});

test('server kicks use a five-minute reconnect delay by default', () => {
    assert.equal(kickReconnectDelayMs({}), 300000);
    assert.equal(kickReconnectDelayMs({ kickReconnectDelayMs: 420000 }), 420000);
    assert.equal(kickReconnectDelayMs({ kickReconnectDelayMs: 10 }), 5000);
    assert.equal(reconnectDelayAfterKick({
        minecraft: { kickReconnectDelayMs: 300000 },
        skyblock: { joinRetryDelayMs: 5000 }
    }, true), 5000);
    assert.equal(reconnectDelayAfterKick({
        minecraft: { kickReconnectDelayMs: 300000 },
        skyblock: { joinRetryDelayMs: 5000 }
    }, false), 300000);
});

test('reconnect mode tracker preserves a started mode until it is deliberately paused or stopped', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    const events = framework.ctx.getManager('events');
    const modes = framework.ctx.getManager('mode');
    const tracker = createModeResumeTracker();
    const unbind = bindModeResumeTracker(framework, tracker);

    modes.currentMode = modes.get('collector');
    assert.equal(activeModeName(framework), 'collector');
    events.emit(Events.Mode.START, 'collector');
    assert.equal(tracker.get(), 'collector');

    events.emit(Events.Mode.PAUSE, 'CollectorMode');
    assert.equal(tracker.get(), null);
    events.emit(Events.Mode.RESUME, 'CollectorMode');
    assert.equal(tracker.get(), 'collector');

    events.emit(Events.Mode.STOP, 'CollectorMode');
    assert.equal(tracker.get(), null);
    unbind();
    await framework.stop();
});

test('server reset guard delays reconnect before and during the configured 03:00/05:00 windows', () => {
    const resetConfig = {
        timeZone: 'Asia/Ho_Chi_Minh',
        hours: [3, 5],
        waitMinutes: 10,
        preWaitMinutes: 1
    };
    const preReset = resetWaitDelay(new Date('2026-01-01T19:59:30.000Z'), resetConfig);
    assert.deepEqual(preReset, { delay: 630000, resetHour: 3 });

    const inReset = resetWaitDelay(new Date('2026-01-01T20:03:30.000Z'), resetConfig);
    assert.deepEqual(inReset, { delay: 390000, resetHour: 3 });
    assert.equal(resetWaitDelay(new Date('2026-01-01T20:10:00.000Z'), resetConfig), null);

    assert.equal(nextResetDelay(new Date('2026-01-01T19:30:00.000Z'), resetConfig), 30 * 60 * 1000);
});

test('runtime declares every diagnostic field used by crafting, vault, and smelting workflows', () => {
    const state = new Runtime().state;
    assert.deepEqual(state.smelting.lastSkipReason, null);
    assert.deepEqual(state.personalVault.lastNotice, null);
    assert.deepEqual(state.personalVault.nextCommandAt, null);
    assert.deepEqual(state.crafting.existingItems, []);
    assert.deepEqual(state.crafting.personalVaultWithdrawals, []);
    assert.deepEqual(state.crafting.deferredActions, []);
    assert.deepEqual(state.crafting.lastPersonalVaultAudit, null);
});

test('inventory update emits once per Mineflayer event', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, { skyblock: { islandTeleportDelayMs: 0 } });
    await framework.start();

    let received = 0;
    framework.ctx.getManager('events').on('inventory.update', () => received++);
    bot.emit('windowUpdate');

    assert.equal(received, 1);
    await framework.stop();
});

test('silent inventory sync refreshes the snapshot without broadcasting an event', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {});
    await framework.start();

    bot.inventory.items = () => [{ name: 'coal', count: 3, slot: 36 }];
    let received = 0;
    framework.ctx.getManager('events').on('inventory.update', () => received++);

    assert.equal(framework.ctx.getService('inventory').sync({ emit: false }), Result.SUCCESS);
    assert.equal(received, 0);
    assert.deepEqual(framework.runtime.state.inventory.items.map(item => [item.name, item.count, item.slot]), [
        ['coal', 3, 36]
    ]);
    await framework.stop();
});

test('inventory listener keeps normalized hotbar labels and counts only 36 usable slots', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {});
    await framework.start();

    bot.inventory.slots = Array(46).fill(null);
    bot.inventory.slots[36] = {
        name: 'amethyst_shard',
        count: 2,
        components: [{
            type: 'custom_name',
            data: {
                color: 'aqua',
                text: 'Refined Component'
            }
        }]
    };
    bot.inventory.items = () => [];
    bot.emit('windowUpdate');

    assert.deepEqual(framework.runtime.state.inventory.items, [{
        name: 'amethyst_shard',
        displayName: 'Refined Component',
        labels: ['Refined Component', 'amethyst_shard'],
        type: undefined,
        count: 2,
        slot: 36,
        durabilityUsed: null,
        maxDurability: null
    }]);
    assert.equal(framework.runtime.state.inventory.emptySlots, 35);
    assert.equal(framework.runtime.state.inventory.full, false);
    await framework.stop();
});

test('item label extraction ignores component colour/style metadata', () => {
    const labels = itemLabels({
        name: 'amethyst_shard',
        components: [{
            type: 'custom_name',
            data: {
                color: 'aqua',
                bold: true,
                text: 'Siêu Hợp Kim'
            }
        }]
    });

    assert.deepEqual(labels, ['Siêu Hợp Kim', 'amethyst_shard']);
});

test('GUI probe executes generic command and left/right slot scripts through services', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, { guiProbe: { windowTimeoutMs: 250 } });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const firstWindow = {
        title: 'Danh sách công thức',
        slots: Array(27),
        inventoryStart: 27
    };
    firstWindow.slots[12] = {
        name: 'amethyst_shard',
        count: 1,
        displayName: 'Siêu Hợp Kim',
        nbt: { lore: 'x8 Wolfram' }
    };
    const secondWindow = {
        title: 'Chi tiết công thức',
        slots: Array(27),
        inventoryStart: 27
    };

    const send = bot.chat.bind(bot);
    bot.chat = message => {
        send(message);
        queueMicrotask(() => bot.emit('windowOpen', firstWindow));
    };
    bot.clickWindow = async (slot, mouseButton, mode) => {
        bot.clickedSlots.push(slot);
        bot.clickedActions.push({ slot, mouseButton, mode });
        queueMicrotask(() => bot.emit('windowOpen', secondWindow));
    };

    const output = await framework.ctx.getService('guiProbe').run('/ks > r12 > inspect');
    assert.equal(output.result, Result.SUCCESS);
    assert.deepEqual(bot.chatMessages, ['/ks']);
    assert.deepEqual(bot.clickedActions[0], { slot: 12, mouseButton: 1, mode: 0 });
    assert.equal(output.snapshots.at(-1).title, 'Chi tiết công thức');
    assert.throws(() => framework.ctx.getService('guiProbe').parse('/ks > x12'), /không hợp lệ/);
    await framework.stop();
});

test('Super Alloy crafting plan expands the configured recipe tree in dependency order', async () => {
    const framework = new Framework(new FakeBot(), {});
    await framework.start();

    const crafting = framework.ctx.getService('crafting');
    const plan = crafting.plan(33, 1);
    const amount = slot => plan.actions.find(action => action.slot === slot)?.count;
    const raw = item => plan.rawRequirements.find(requirement => requirement.item === item)?.amount;

    assert.equal(plan.targetName, 'Siêu Hợp Kim');
    assert.equal(amount(33), 1);
    assert.equal(amount(32), 8);
    assert.equal(amount(31), 16);
    assert.equal(amount(30), 32);
    assert.equal(amount(20), 144);
    assert.equal(amount(25), 192);
    assert.equal(raw('redstone'), 262144);
    assert.equal(plan.totalActions, 28617);
    assert.ok(plan.actions.findIndex(action => action.slot === 10) < plan.actions.findIndex(action => action.slot === 33));
    assert.ok(plan.actions.findIndex(action => action.slot === 10) < plan.actions.findIndex(action => action.slot === 20));
    assert.ok(plan.actions.findIndex(action => action.slot === 16) < plan.actions.findIndex(action => action.slot === 28));
    const execution = crafting.createInventorySafeActions(plan);
    assert.equal(execution.reduce((total, action) => total + action.count, 0), plan.totalActions);
    assert.deepEqual(execution.slice(0, 4).map(action => [action.slot, action.count]), [
        [10, 16], [20, 1], [10, 16], [20, 1]
    ]);
    await framework.stop();
});

test('crafting keeps stable material keys when config overrides legacy recipe fields', async () => {
    const framework = new Framework(new FakeBot(), {
        crafting: {
            recipes: {
                25: { name: 'Custom Gold Block Name' }
            }
        }
    });
    await framework.start();
    const crafting = framework.ctx.getService('crafting');
    const plan = crafting.plan(25, 1);

    assert.equal(plan.targetItemKey, 'refined_gold_block');
    assert.equal(plan.actions[0].itemKey, 'refined_gold');
    assert.equal(plan.actions.at(-1).itemKey, 'refined_gold_block');
    await framework.stop();
});

test('shift craft B2 works with a full inventory then closes and re-plans from actual output', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        crafting: {
            shiftCraft: { enabled: true, tier2: true, tier3: true, stableMs: 0, maxReplans: 2 },
            personalVault: { enabled: false },
            recipes: {
                10: { itemKey: 'super_cobble', name: 'Super Cobblestone', inputs: [{ item: 'cobblestone', amount: 16 }] }
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.inventory.full = true;

    let crafted = false;
    bot.inventory.items = () => crafted
        ? [{ name: 'amethyst_shard', displayName: 'Super Cobblestone', count: 16, slot: 36 }]
        : [];
    const craftingWindow = { title: 'Recipes', slots: Array(27), inventoryStart: 27 };
    craftingWindow.slots[10] = { name: 'amethyst_shard', count: 1, displayName: 'Super Cobblestone' };
    bot.currentWindow = craftingWindow;
    bot.emit('windowOpen', craftingWindow);
    bot.clickWindow = async (slot, mouseButton, mode) => {
        bot.clickedSlots.push(slot);
        bot.clickedActions.push({ slot, mouseButton, mode });
        if (slot === 10) {
            crafted = true;
            bot.emit('windowUpdate', slot, null, { name: 'amethyst_shard', count: 16 });
        }
    };

    const crafting = framework.ctx.getService('crafting');
    crafting.run = {
        active: true,
        status: 'CRAFTING',
        settings: crafting.settings(),
        plan: {
            targetSlot: 10,
            targetItemKey: 'super_cobble',
            targetName: 'Super Cobblestone',
            targetCount: 1,
            actions: [{ slot: 10, itemKey: 'super_cobble', name: 'Super Cobblestone', count: 1 }],
            totalActions: 1,
            deferredActions: []
        },
        basePlan: crafting.plan(10, 1),
        actionIndex: 0,
        actionProgress: 0,
        completedActions: 0,
        availability: { materials: [] },
        personalVaultChecked: true,
        vaultWithdrawals: [],
        targetCraftCount: 0,
        resumeStatus: null,
        partial: false,
        nextAt: 0,
        guiDeadline: 0,
        previousWindow: null,
        openedWindow: craftingWindow,
        entryGuiUpdatedAt: 0,
        loggedActionIndex: -1,
        lastLoggedCompletedActions: -1,
        pendingClick: null,
        actionRetryCount: 0,
        shiftReplanCount: 0,
        shiftHistory: [],
        preparedTier2ActionIndex: 0,
        error: null
    };

    await crafting.tick();
    await crafting.tick();
    await crafting.tick();

    assert.deepEqual(bot.clickedActions, [{ slot: 10, mouseButton: 0, mode: 1 }]);
    assert.equal(crafting.run.status, 'CHECKING_STORAGE');
    assert.equal(crafting.run.shiftHistory[0].crafted, 16);
    assert.equal(crafting.run.shiftHistory[0].itemKey, 'super_cobble');
    await framework.stop();
});

test('shift craft never enables shared B4 recipes unless explicitly configured', async () => {
    const framework = new Framework(new FakeBot(), {
        crafting: { shiftCraft: { enabled: true, tier2: true, tier3: true, tier4Slots: [] } }
    });
    await framework.start();
    const crafting = framework.ctx.getService('crafting');
    crafting.run = {
        active: true,
        actionProgress: 0,
        settings: crafting.settings(),
        plan: { targetSlot: 33 }
    };

    assert.equal(crafting._shouldUseShiftCraft({ slot: 10 }), true);
    assert.equal(crafting._shouldUseShiftCraft({ slot: 20 }), true);
    assert.equal(crafting._shouldUseShiftCraft({ slot: 30 }), false);
    crafting.run = null;
    await framework.stop();
});

test('Super Alloy crafting checks /kho, enters /ks slot 16, then crafts without smelting', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        crafting: {
            guiTimeoutMs: 100,
            clickIntervalMs: 100,
            entrySlot: 16,
            personalVault: { enabled: false }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    let crafted = false;
    bot.inventory.items = () => crafted ? [{ name: 'cobblestone', type: 1, count: 1, slot: 36 }] : [];

    const craftingWindow = { title: 'Danh sách công thức', slots: Array(27), inventoryStart: 27 };
    craftingWindow.slots[10] = { name: 'cobblestone', count: 1, displayName: 'Siêu đá cuội' };
    const menuWindow = { title: 'Chế tạo', slots: Array(27), inventoryStart: 27 };
    menuWindow.slots[16] = { name: 'crafting_table', count: 1, displayName: 'Công thức' };

    const storage = framework.ctx.getService('storage');
    storage.refreshStorageGui = async () => Result.SUCCESS;
    storage.getStorageStats = () => ({ free: 200000 });
    framework.runtime.state.storage.gui.items = [
        { slot: 12, itemName: 'cobblestone', amount: 16 }
    ];

    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command === '/ks') {
            bot.currentWindow = menuWindow;
            bot.emit('windowOpen', menuWindow);
        }
    };
    bot.clickWindow = async (slot, mouseButton, mode) => {
        bot.clickedSlots.push(slot);
        bot.clickedActions.push({ slot, mouseButton, mode });
        if (slot === 16) {
            bot.currentWindow = craftingWindow;
            bot.emit('windowOpen', craftingWindow);
        }
        if (slot === 10) {
            crafted = true;
            bot.emit('windowUpdate', slot, null, { name: 'cobblestone', count: 1 });
        }
    };
    assert.equal(framework.ctx.getService('crafting').start(10, 1), Result.SUCCESS);
    for (let tick = 0; tick < 12 && !framework.ctx.getService('crafting').isFinished(); tick += 1) {
        await framework.ctx.getService('crafting').tick();
    }
    assert.deepEqual(bot.chatMessages, ['/ks']);
    assert.deepEqual(bot.clickedActions, [
        { slot: 16, mouseButton: 0, mode: 0 },
        { slot: 10, mouseButton: 0, mode: 0 }
    ]);
    assert.equal(framework.runtime.state.crafting.status, 'COMPLETED');
    await framework.stop();
});

test('Super Alloy crafting stops before smelting when /kho lacks a required material', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, { crafting: { smelting: { passes: 2 }, personalVault: { enabled: false } } });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.storage.gui.items = [{ slot: 12, itemName: 'cobblestone', amount: 15 }];
    framework.ctx.getService('storage').refreshStorageGui = async () => Result.SUCCESS;

    const crafting = framework.ctx.getService('crafting');
    assert.equal(crafting.start(10, 1), Result.SUCCESS);
    assert.equal(await crafting.tick(), Result.INSUFFICIENT_ITEMS);
    assert.equal(framework.runtime.state.crafting.status, 'FAILED');
    assert.match(framework.runtime.state.crafting.error, /cobblestone/);
    assert.deepEqual(bot.chatMessages, []);
    await framework.stop();
});

test('Super Alloy preflight preserves raw B1 then rebuilds its ledger from a second /kho snapshot', async () => {
    const framework = new Framework(new FakeBot(), {
        crafting: {
            personalVault: { enabled: false },
            recipes: {
                99: { name: 'Test Alloy', inputs: [{ item: 'coal', amount: 16 }] }
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const storage = framework.ctx.getService('storage');
    const calls = [];
    storage.refreshStorageGui = async options => {
        calls.push(options || null);
        framework.runtime.state.storage.gui.items = calls.length === 1
            ? [{ slot: 10, itemName: 'coal', amount: 0 }]
            : [{ slot: 10, itemName: 'coal', amount: 16 }];
        return Result.SUCCESS;
    };

    const crafting = framework.ctx.getService('crafting');
    assert.equal(crafting.start(99, 1), Result.SUCCESS);
    assert.equal(await crafting.tick(), Result.PENDING);
    assert.deepEqual(calls, [{ runCompression: false }, { runPostProcessing: false }]);
    assert.equal(crafting.run.status, 'OPENING_GUI');
    assert.equal(crafting.run.plan.rawRequirements[0].amount, 16);
    await framework.stop();
});

test('Super Alloy preflight leaves B1 blocks compressed until the matching B2 group begins', async () => {
    const framework = new Framework(new FakeBot(), {
        crafting: {
            personalVault: { enabled: false },
            recipes: { 99: { name: 'Test Alloy', inputs: [{ item: 'coal', amount: 16 }] } }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const storage = framework.ctx.getService('storage');
    const refreshCalls = [];
    storage.refreshStorageGui = async options => {
        refreshCalls.push(options || null);
        framework.runtime.state.storage.gui.items = [
            { slot: 10, itemName: 'coal', amount: 8 },
            { slot: 11, itemName: 'coal_block', amount: 1 }
        ];
        return Result.SUCCESS;
    };
    let requestedRaw = null;
    storage.prepareRawForCraft = async rawRequirements => {
        requestedRaw = rawRequirements;
        return Result.SUCCESS;
    };

    const crafting = framework.ctx.getService('crafting');
    assert.equal(crafting.start(99, 1), Result.SUCCESS);
    assert.equal(await crafting.tick(), Result.PENDING);
    assert.equal(requestedRaw, null);
    assert.deepEqual(refreshCalls, [
        { runCompression: false },
        { runPostProcessing: false }
    ]);
    assert.equal(crafting.run.status, 'OPENING_GUI');
    assert.equal(crafting.run.plan.rawRequirements[0].amount, 16);
    await framework.stop();
});

test('Crafting starts its /ks GUI timeout after queued command transmission, not before', async () => {
    const framework = new Framework(new FakeBot(), {
        crafting: {
            guiTimeoutMs: 1000,
            personalVault: { enabled: false },
            recipes: {
                99: { name: 'Test Alloy', inputs: [{ item: 'coal', amount: 16 }] }
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.storage.gui.items = [{ slot: 10, itemName: 'coal', amount: 16 }];

    const storage = framework.ctx.getService('storage');
    storage.refreshStorageGui = async () => Result.SUCCESS;
    const chat = framework.ctx.getService('chat');
    chat.sendCommand = async () => {
        await new Promise(resolve => setTimeout(resolve, 1050));
        return Result.SUCCESS;
    };

    const crafting = framework.ctx.getService('crafting');
    assert.equal(crafting.start(99, 1), Result.SUCCESS);
    assert.equal(await crafting.tick(), Result.PENDING);
    assert.equal(crafting.run.status, 'OPENING_GUI');

    assert.equal(await crafting.tick(), Result.PENDING);
    assert.equal(crafting.run.status, 'WAITING_GUI');
    // With the old deadline, this immediately returned GUI_TIMEOUT because
    // sendCommand had taken longer than guiTimeoutMs.
    assert.equal(await crafting.tick(), Result.PENDING);
    assert.equal(crafting.isFinished(), false);
    await framework.stop();
});

test('Crafting retries an unacknowledged ordinary recipe click before failing safely', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        crafting: {
            clickAckTimeoutMs: 500,
            clickAckMaxRetries: 1,
            clickAckRetryDelayMs: 0,
            personalVault: { enabled: false }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const craftingWindow = { title: 'Recipes', slots: Array(27), inventoryStart: 27 };
    craftingWindow.slots[10] = { name: 'cobblestone', count: 1, displayName: 'Super Cobblestone' };
    bot.currentWindow = craftingWindow;
    bot.emit('windowOpen', craftingWindow);

    const crafting = framework.ctx.getService('crafting');
    crafting.run = {
        active: true,
        status: 'CRAFTING',
        settings: { ...crafting.settings(), clickAckTimeoutMs: 500, clickAckMaxRetries: 1, clickAckRetryDelayMs: 0 },
        plan: {
            targetSlot: 10,
            targetName: 'Super Cobblestone',
            targetCount: 1,
            actions: [{ slot: 10, name: 'Super Cobblestone', count: 1 }],
            totalActions: 1,
            deferredActions: []
        },
        actionIndex: 0,
        actionProgress: 0,
        completedActions: 0,
        availability: { materials: [] },
        personalVaultChecked: true,
        vaultWithdrawals: [],
        targetCraftCount: 1,
        resumeStatus: null,
        partial: false,
        nextAt: 0,
        guiDeadline: 0,
        previousWindow: null,
        openedWindow: craftingWindow,
        entryGuiUpdatedAt: 0,
        loggedActionIndex: -1,
        lastLoggedCompletedActions: -1,
        pendingClick: null,
        actionRetryCount: 0,
        preparedTier2ActionIndex: 0,
        error: null
    };

    assert.equal(await crafting.tick(), Result.PENDING);
    assert.equal(bot.clickedActions.length, 1);
    await new Promise(resolve => setTimeout(resolve, 510));

    assert.equal(await crafting.tick(), Result.PENDING);
    assert.equal(crafting.run.actionRetryCount, 1);
    assert.equal(await crafting.tick(), Result.PENDING);
    assert.equal(bot.clickedActions.length, 2);
    await new Promise(resolve => setTimeout(resolve, 510));

    assert.equal(await crafting.tick(), Result.FAILED);
    assert.equal(crafting.run.status, 'FAILED');
    assert.match(crafting.run.error, /sau 2 lần click/);
    await framework.stop();
});

test('Crafting acknowledges an ordinary custom recipe from an inventory refresh without a GUI event', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        crafting: {
            clickAckTimeoutMs: 500,
            personalVault: { enabled: false },
            recipes: {
                98: { itemKey: 'custom_recipe_output', name: 'Custom Recipe Output', inputs: [{ slot: 99, amount: 1 }] },
                99: { itemKey: 'custom_recipe_input', name: 'Custom Recipe Input', inputs: [] }
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    let crafted = false;
    bot.inventory.items = () => (crafted
        ? [{ name: 'amethyst_shard', displayName: 'Custom Recipe Output', count: 1, slot: 36 }]
        : []);

    const craftingWindow = { title: 'Recipes', slots: Array(27), inventoryStart: 27 };
    craftingWindow.slots[98] = { name: 'amethyst_shard', count: 1, displayName: 'Custom Recipe Output' };
    bot.currentWindow = craftingWindow;
    bot.emit('windowOpen', craftingWindow);
    bot.clickWindow = async (slot, mouseButton, mode) => {
        bot.clickedSlots.push(slot);
        bot.clickedActions.push({ slot, mouseButton, mode });
        if (slot === 98) crafted = true;
    };

    const crafting = framework.ctx.getService('crafting');
    crafting.run = {
        active: true,
        status: 'CRAFTING',
        settings: crafting.settings(),
        plan: {
            targetSlot: 98,
            targetName: 'Custom Recipe Output',
            targetCount: 1,
            actions: [{ slot: 98, itemKey: 'custom_recipe_output', name: 'Custom Recipe Output', count: 1 }],
            totalActions: 1,
            deferredActions: []
        },
        actionIndex: 0,
        actionProgress: 0,
        completedActions: 0,
        availability: { materials: [] },
        personalVaultChecked: true,
        vaultWithdrawals: [],
        targetCraftCount: 1,
        resumeStatus: null,
        partial: false,
        nextAt: 0,
        guiDeadline: 0,
        previousWindow: null,
        openedWindow: craftingWindow,
        entryGuiUpdatedAt: 0,
        loggedActionIndex: -1,
        lastLoggedCompletedActions: -1,
        pendingClick: null,
        actionRetryCount: 0,
        preparedTier2ActionIndex: 0,
        error: null
    };

    assert.equal(await crafting.tick(), Result.PENDING);
    assert.equal(bot.clickedActions.length, 1);
    assert.equal(await crafting.tick(), Result.SUCCESS);
    assert.equal(crafting.run.status, 'COMPLETED');
    assert.equal(crafting.run.actionRetryCount, 0);
    assert.equal(bot.clickedActions.length, 1);
    await framework.stop();
});

test('Super Alloy stock already in /pv 2 never satisfies a request to craft a new target', async () => {
    const framework = new Framework(new FakeBot(), {
        crafting: {
            targetSlot: 99,
            targetCount: 1,
            recipes: {
                99: { name: 'Stored Target', inputs: [] }
            }
        }
    });
    await framework.start();
    const crafting = framework.ctx.getService('crafting');
    const plan = crafting.plan(99, 1);
    const planned = crafting.planUsingExisting(plan, new Map([[
        99, { inventory: 1, storage: 1, vault: 1 }
    ]]));

    assert.equal(planned.actions.find(action => action.slot === 99)?.count, 1);
    const target = planned.existingItems.find(item => item.slot === 99);
    assert.equal(target.inventoryUsed, 0);
    assert.equal(target.storageUsed, 0);
    assert.equal(target.vaultUsed, 0);
    assert.deepEqual(planned.vaultWithdrawals, []);
    await framework.stop();
});

test('Super Alloy storage assessment combines the configured /kho item and block slots', async () => {
    const framework = new Framework(new FakeBot(), {});
    await framework.start();
    const crafting = framework.ctx.getService('crafting');
    framework.runtime.state.storage.gui.items = [
        { slot: 10, itemName: 'coal', amount: 7 },
        { slot: 11, itemName: 'coal_block', amount: 1 },
        { slot: 22, itemName: 'iron_block', amount: 1 },
        { slot: 23, itemName: 'iron_ingot', amount: 55 },
        { slot: 24, itemName: 'iron_ore', amount: 0 },
        { slot: 30, itemName: 'raw_iron', amount: 0 }
    ];

    const coal = crafting.assessStorage(crafting.plan(11, 1));
    const iron = crafting.assessStorage(crafting.plan(14, 1));
    assert.equal(coal.canCraft, true);
    assert.equal(coal.materials[0].available, 16);
    assert.equal(iron.canCraft, true);
    assert.equal(iron.materials[0].available, 64);
    await framework.stop();
});

test('Super Alloy assessment counts custom items and raw materials in inventory', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        crafting: {
            personalVault: { enabled: false },
            recipes: {
                98: { name: 'Refined Component', inputs: [{ item: 'coal', amount: 16 }] },
                99: { name: 'Test Alloy', inputs: [{ slot: 98, amount: 2 }] }
            }
        }
    });
    await framework.start();
    bot.inventory.items = () => [
        {
            name: 'amethyst_shard',
            displayName: 'Amethyst Shard',
            count: 2,
            slot: 36,
            components: [{ type: 'custom_name', data: '{"text":"Refined Component"}' }]
        },
        { name: 'coal', displayName: 'Coal', count: 64, slot: 37 }
    ];
    framework.ctx.getService('inventory').sync();

    const crafting = framework.ctx.getService('crafting');
    const supplies = crafting._recipeSupplies();
    assert.equal(supplies.get(98).inventory, 2);

    const rawPlan = {
        rawRequirements: [{ item: 'coal', amount: 64 }]
    };
    framework.runtime.state.storage.gui.items = [{ slot: 10, itemName: 'coal', amount: null }];
    const availability = crafting.assessStorage(rawPlan);
    assert.equal(availability.canCraft, true);
    assert.equal(availability.materials[0].available, 64);
    assert.equal(availability.materials[0].inventory, 64);
    await framework.stop();
});

test('Crafting includes hotbar items and runs a feasible SHK branch while deferring blocked branches', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        crafting: {
            personalVault: { enabled: false },
            recipes: {
                97: { name: 'Red Component', inputs: [{ item: 'redstone', amount: 16 }] },
                98: { name: 'Coal Component', inputs: [{ item: 'coal', amount: 16 }] },
                99: { name: 'Test Alloy', inputs: [{ slot: 98, amount: 1 }, { slot: 97, amount: 1 }] }
            }
        }
    });
    await framework.start();

    // Simulates /pv 2 shift-click moving an item to the taskbar while
    // Mineflayer's inventory.items() has not yet included that slot.
    bot.inventory.slots = Array(46).fill(null);
    bot.inventory.slots[36] = { name: 'coal', displayName: 'Coal', count: 16 };
    bot.inventory.items = () => [];
    framework.ctx.getService('inventory').sync();

    const crafting = framework.ctx.getService('crafting');
    const fullPlan = crafting.planUsingExisting(crafting.plan(99, 1), crafting._recipeSupplies());
    framework.runtime.state.storage.gui.items = [
        { slot: 10, itemName: 'coal', amount: null },
        { slot: 31, itemName: 'redstone', amount: 0 }
    ];
    const availability = crafting.assessStorage(fullPlan);
    const staged = crafting.planCraftableStages(fullPlan, availability);

    assert.equal(framework.runtime.state.inventory.items[0].slot, 36);
    assert.equal(availability.materials.find(item => item.item === 'coal').available, 16);
    assert.deepEqual(staged.actions.map(action => action.slot), [98]);
    assert.deepEqual(staged.rawRequirements, [{ item: 'coal', amount: 16 }]);
    assert.equal(staged.partial, true);
    assert.deepEqual(staged.deferredActions.map(action => action.slot), [97, 99]);
    await framework.stop();
});

test('/kho post-processing clicks the block icon to pack stored ingots', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        storage: {
            conversion: {
                enabled: true,
                guiTimeoutMs: 100,
                clickDelayMs: 0,
                targetItems: ['coal']
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.storage.gui.items = [
        { slot: 10, itemName: 'coal', amount: 9 }
    ];

    const conversionMenu = { title: 'Danh mục', slots: Array(27), inventoryStart: 27 };
    conversionMenu.slots[10] = { name: 'anvil', count: 1, displayName: 'Ép phôi' };
    const conversionWindow = { title: 'Ép phôi thành khối', slots: Array(27), inventoryStart: 27 };
    conversionWindow.slots[4] = { name: 'coal_block', count: 7, displayName: 'Coal Block' };
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command !== '/ks') return;
        bot.currentWindow = conversionMenu;
        bot.emit('windowOpen', conversionMenu);
    };
    bot.clickWindow = async (slot, mouseButton, mode) => {
        bot.clickedSlots.push(slot);
        bot.clickedActions.push({ slot, mouseButton, mode });
        if (slot === 10) {
            bot.currentWindow = conversionWindow;
            bot.emit('windowOpen', conversionWindow);
        }
        if (slot === 4) {
            bot.currentWindow = null;
            bot.emit('windowClose');
        }
    };

    const conversion = framework.ctx.getService('materialConversion');
    assert.equal(await conversion.run(), Result.SUCCESS);

    assert.deepEqual(bot.chatMessages, ['/ks']);
    assert.deepEqual(bot.clickedActions, [
        { slot: 10, mouseButton: 0, mode: 0 },
        { slot: 4, mouseButton: 0, mode: 0 }
    ]);
    assert.deepEqual(framework.runtime.state.materialConversion.converted, ['coal']);
    await framework.stop();
});

test('craft preparation only unpacks a block type whose direct B1 amount is short', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        storage: { conversion: { enabled: true, guiTimeoutMs: 100, clickDelayMs: 0, targetItems: ['coal', 'redstone'] } }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.storage.gui.items = [
        { slot: 10, itemName: 'coal', amount: 8 },
        { slot: 11, itemName: 'coal_block', amount: 1 },
        { slot: 31, itemName: 'redstone', amount: 64 },
        { slot: 32, itemName: 'redstone_block', amount: 4 }
    ];
    framework.runtime.state.storage.gui.detail.storage.free = 800000;

    const menu = { title: 'Menu', slots: Array(27), inventoryStart: 27 };
    menu.slots[10] = { name: 'anvil', count: 1 };
    const conversionWindow = { title: 'Convert', slots: Array(27), inventoryStart: 27 };
    conversionWindow.slots[4] = { name: 'coal', count: 1 };
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command === '/ks') {
            bot.currentWindow = menu;
            bot.emit('windowOpen', menu);
        }
    };
    bot.clickWindow = async slot => {
        bot.clickedSlots.push(slot);
        if (slot === 10) {
            bot.currentWindow = conversionWindow;
            bot.emit('windowOpen', conversionWindow);
        }
        if (slot === 4) {
            bot.currentWindow = null;
            bot.emit('windowClose');
        }
    };

    const result = await framework.ctx.getService('storage').prepareRawForCraft(
        [{ item: 'coal', amount: 16 }, { item: 'redstone', amount: 64 }],
        { coal: 10, redstone: 31 }
    );
    assert.equal(result, Result.SUCCESS);
    assert.deepEqual(bot.chatMessages, ['/ks']);
    assert.deepEqual(bot.clickedSlots, [10, 4]);
    assert.deepEqual(framework.runtime.state.materialConversion.converted, ['coal']);
    await framework.stop();
});

test('storage compression reopens /ks after each material conversion', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        storage: {
            conversion: {
                enabled: true,
                guiTimeoutMs: 100,
                clickDelayMs: 0,
                targetItems: ['coal', 'redstone']
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.storage.gui.items = [
        { slot: 10, itemName: 'coal', amount: 9 },
        { slot: 31, itemName: 'redstone', amount: 9 }
    ];

    const conversionMenu = { title: 'Menu', slots: Array(27), inventoryStart: 27 };
    conversionMenu.slots[10] = { name: 'anvil', count: 1, displayName: 'Convert' };
    const coalConversion = { title: 'Convert', slots: Array(27), inventoryStart: 27 };
    coalConversion.slots[4] = { name: 'coal_block', count: 7, displayName: 'Coal Block' };
    const redstoneConversion = { title: 'Convert', slots: Array(27), inventoryStart: 27 };
    redstoneConversion.slots[5] = { name: 'redstone_block', count: 7, displayName: 'Redstone Block' };
    let conversionMenusOpened = 0;
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command !== '/ks') return;
        bot.currentWindow = conversionMenu;
        bot.emit('windowOpen', conversionMenu);
    };
    bot.clickWindow = async (slot, mouseButton, mode) => {
        bot.clickedSlots.push(slot);
        bot.clickedActions.push({ slot, mouseButton, mode });
        if (slot === 10) {
            bot.currentWindow = [coalConversion, redstoneConversion][conversionMenusOpened++];
            bot.emit('windowOpen', bot.currentWindow);
        }
        if (slot === 4 || slot === 5) {
            bot.currentWindow = null;
            bot.emit('windowClose');
        }
    };

    const conversion = framework.ctx.getService('materialConversion');
    assert.equal(await conversion.run(), Result.SUCCESS);

    assert.deepEqual(bot.chatMessages, ['/ks', '/ks']);
    assert.deepEqual(bot.clickedActions, [
        { slot: 10, mouseButton: 0, mode: 0 },
        { slot: 4, mouseButton: 0, mode: 0 },
        { slot: 10, mouseButton: 0, mode: 0 },
        { slot: 5, mouseButton: 0, mode: 0 }
    ]);
    assert.deepEqual(framework.runtime.state.materialConversion.converted, ['coal', 'redstone']);
    await framework.stop();
});

test('Super Alloy withdraws existing refined items from /pv 2 and skips their recipe', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        crafting: {
            targetSlot: 99,
            targetCount: 1,
            guiTimeoutMs: 100,
            clickIntervalMs: 0,
            smelting: { passes: 0 },
            personalVault: {
                enabled: true,
                command: '/pv 2',
                guiTimeoutMs: 100,
                commandCooldownMs: 0,
                transferDelayMs: 0
            },
            recipes: {
                98: { name: 'Refined Component', inputs: [{ item: 'coal', amount: 16 }] },
                99: { name: 'Test Alloy', inputs: [{ slot: 98, amount: 2 }] }
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    bot.inventory.slots = Array(36).fill(null);

    const vaultWindow = { title: 'Personal Vault', slots: Array(27), inventoryStart: 27 };
    vaultWindow.slots[3] = {
        name: 'amethyst_shard',
        count: 2,
        displayName: 'Amethyst Shard',
        components: [{ type: 'custom_name', data: '{"text":"Refined Component"}' }]
    };
    const craftingMenu = { title: 'Craft menu', slots: Array(100), inventoryStart: 100 };
    craftingMenu.slots[16] = { name: 'crafting_table', count: 1, displayName: 'Recipes' };
    const craftingWindow = { title: 'Recipes', slots: Array(100), inventoryStart: 100 };
    craftingWindow.slots[99] = { name: 'nether_star', count: 1, displayName: 'Test Alloy' };
    let withdrawn = false;
    let crafted = false;
    vaultWindow.withdraw = async (type, metadata, count) => {
        assert.equal(type, vaultWindow.slots[3].type);
        assert.equal(metadata, vaultWindow.slots[3].metadata);
        assert.equal(count, 2);
        withdrawn = true;
        vaultWindow.slots[3].count -= count;
    };
    bot.inventory.items = () => {
        if (crafted) return [{ name: 'nether_star', count: 1, slot: 36, displayName: 'Test Alloy' }];
        return withdrawn ? [{ name: 'amethyst_shard', count: 2, slot: 36, displayName: 'Refined Component' }] : [];
    };
    bot.closeWindow = () => {
        bot.currentWindow = null;
        bot.emit('windowClose');
    };
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command === '/pv 2') {
            bot.currentWindow = vaultWindow;
            bot.emit('windowOpen', vaultWindow);
        }
        if (command === '/ks') {
            bot.currentWindow = craftingMenu;
            bot.emit('windowOpen', craftingMenu);
        }
    };
    bot.clickWindow = async (slot, mouseButton, mode) => {
        bot.clickedSlots.push(slot);
        bot.clickedActions.push({ slot, mouseButton, mode });
        if (slot === 16) {
            bot.currentWindow = craftingWindow;
            bot.emit('windowOpen', craftingWindow);
        }
        if (slot === 99) {
            crafted = true;
            bot.emit('windowUpdate', slot, null, { name: 'nether_star', count: 1 });
        }
    };

    framework.ctx.getService('storage').refreshStorageGui = async () => Result.SUCCESS;
    const crafting = framework.ctx.getService('crafting');
    assert.equal(crafting.start(99, 1), Result.SUCCESS);
    for (let tick = 0; tick < 30 && !crafting.isFinished(); tick += 1) await crafting.tick();

    assert.deepEqual(bot.chatMessages, ['/pv 2', '/ks', '/pv 2', '/ks']);
    assert.deepEqual(bot.clickedActions, [
        { slot: 16, mouseButton: 0, mode: 0 },
        { slot: 16, mouseButton: 0, mode: 0 },
        { slot: 99, mouseButton: 0, mode: 0 }
    ]);
    assert.deepEqual(framework.runtime.state.crafting.existingItems.find(item => item.slot === 98), {
        slot: 98,
        name: 'Refined Component',
        inventoryAvailable: 0,
        storageAvailable: 0,
        vaultAvailable: 2,
        inventoryUsed: 0,
        storageUsed: 0,
        vaultUsed: 2
    });
    assert.equal(crafting.succeeded(), true);
    await framework.stop();
});

test('personal vault withdraws only the requested part of a custom-material stack', async () => {
    const framework = new Framework(new FakeBot(), {
        crafting: { personalVault: { transferDelayMs: 0, exactWithdraw: true } }
    });
    await framework.start();
    const vault = framework.ctx.getService('personalVault');
    const window = { slots: Array(27), inventoryStart: 27 };
    window.slots[4] = {
        name: 'amethyst_shard',
        type: 123,
        metadata: 0,
        count: 64,
        displayName: 'Refined Component'
    };
    const requests = [];
    window.withdraw = async (type, metadata, count) => {
        requests.push({ type, metadata, count });
        window.slots[4].count -= count;
    };
    vault._withVault = async operation => operation(window);

    assert.equal(await vault.withdraw([{ slot: 98, name: 'Refined Component', amount: 16 }]), Result.SUCCESS);
    assert.deepEqual(requests, [{ type: 123, metadata: 0, count: 16 }]);
    assert.equal(window.slots[4].count, 48);
    assert.deepEqual(framework.runtime.state.personalVault.lastWithdrawal.moved, [{
        slot: 98,
        name: 'Refined Component',
        sourceSlot: 4,
        count: 16
    }]);
    await framework.stop();
});

test('personal vault uses the exact source slot when component-only items share one carrier', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        crafting: { personalVault: { transferDelayMs: 0, exactWithdraw: true } }
    });
    await framework.start();
    const vault = framework.ctx.getService('personalVault');
    const window = { slots: Array(64).fill(null), inventoryStart: 27, inventoryEnd: 63 };
    window.slots[4] = {
        name: 'amethyst_shard',
        type: 123,
        metadata: 0,
        count: 64,
        displayName: 'Refined Component'
    };
    window.slots[5] = {
        name: 'amethyst_shard',
        type: 123,
        metadata: 0,
        count: 64,
        displayName: 'Different Component'
    };
    window.withdraw = async () => assert.fail('ambiguous carrier must not use native window.withdraw');
    bot.currentWindow = window;
    vault.gui = framework.ctx.getService('gui');
    vault.gui.sync(window);
    vault._withVault = async operation => operation(window);

    assert.equal(await vault.withdraw([{ slot: 98, name: 'Refined Component', amount: 16 }]), Result.SUCCESS);
    assert.deepEqual(bot.clickedActions[0], { slot: 4, mouseButton: 0, mode: 0 });
    assert.equal(bot.clickedActions.filter(action => action.slot === 27 && action.mouseButton === 1).length, 16);
    assert.deepEqual(bot.clickedActions.at(-1), { slot: 4, mouseButton: 0, mode: 0 });
    await framework.stop();
});

test('personal vault stores a completed SHK from player inventory', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        crafting: {
            personalVault: {
                command: '/pv 2',
                guiTimeoutMs: 100,
                commandCooldownMs: 0,
                transferDelayMs: 0
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const vaultWindow = { title: 'Personal Vault', slots: Array(63), inventoryStart: 27 };
    vaultWindow.slots[30] = {
        name: 'amethyst_shard',
        count: 1,
        displayName: 'Siêu Hợp Kim'
    };
    bot.closeWindow = () => {
        bot.currentWindow = null;
        bot.emit('windowClose');
    };
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command === '/pv 2') {
            bot.currentWindow = vaultWindow;
            bot.emit('windowOpen', vaultWindow);
        }
    };
    bot.clickWindow = async (slot, mouseButton, mode) => {
        bot.clickedSlots.push(slot);
        bot.clickedActions.push({ slot, mouseButton, mode });
        if (slot === 30 && mode === 1) vaultWindow.slots[30] = null;
    };

    const result = await framework.ctx.getService('personalVault').deposit([{
        name: 'Siêu Hợp Kim',
        aliases: ['Siêu Hợp Kim'],
        amount: 1
    }, {
        // This represents a stale recovery request: the final SHK click may
        // consume the intermediate after CraftingService's last snapshot.
        name: 'Titan',
        aliases: ['Titan'],
        amount: 16
    }]);
    assert.equal(result, Result.SUCCESS);
    assert.deepEqual(bot.chatMessages, ['/pv 2']);
    assert.deepEqual(bot.clickedActions, [{ slot: 30, mouseButton: 0, mode: 1 }]);
    assert.equal(framework.runtime.state.personalVault.lastDeposit.moved[0].name, 'Siêu Hợp Kim');
    assert.equal(framework.runtime.state.personalVault.status, 'PARTIAL');
    assert.equal(framework.runtime.state.personalVault.lastError, null);
    assert.deepEqual(framework.runtime.state.personalVault.lastDeposit.missing, [{ name: 'Titan', amount: 16 }]);
    await framework.stop();
});

test('/pv 2 waits for the configured server command cooldown before reopening', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        crafting: {
            personalVault: {
                enabled: true,
                command: '/pv 2',
                guiTimeoutMs: 100,
                commandCooldownMs: 25
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const vaultWindow = { title: 'Personal Vault', slots: Array(27), inventoryStart: 27 };
    const sentAt = [];
    bot.closeWindow = () => {
        bot.currentWindow = null;
        bot.emit('windowClose');
    };
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        sentAt.push(Date.now());
        queueMicrotask(() => {
            bot.currentWindow = vaultWindow;
            bot.emit('windowOpen', vaultWindow);
        });
    };

    const vault = framework.ctx.getService('personalVault');
    assert.equal(await vault.refresh(), Result.SUCCESS);
    assert.equal(await vault.refresh(), Result.SUCCESS);
    assert.equal(bot.chatMessages.length, 2);
    assert.ok(sentAt[1] - sentAt[0] >= 20);
    await framework.stop();
});

test('all slash commands wait after a Minecraft GUI closes', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        minecraft: { commandAfterGuiCloseDelayMs: 30 }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const sentAt = [];
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        sentAt.push({ command, at: Date.now() });
        send(command);
    };

    const chat = framework.ctx.getService('chat');
    assert.equal(await chat.sendCommand('/pv 2'), Result.SUCCESS);
    bot.emit('windowClose');
    const nextCommand = chat.sendCommand('/ks');
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(bot.chatMessages, ['/pv 2']);

    assert.equal(await nextCommand, Result.SUCCESS);
    assert.deepEqual(bot.chatMessages, ['/pv 2', '/ks']);
    assert.ok(sentAt[1].at - sentAt[0].at >= 25);
    await framework.stop();
});

test('Crafting waits for the /pv 2 cooldown before it opens its /ks crafting menu', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        minecraft: { commandAfterGuiCloseDelayMs: 0 },
        crafting: {
            targetSlot: 10,
            targetCount: 1,
            personalVault: {
                enabled: true,
                command: '/pv 2',
                guiTimeoutMs: 100,
                commandCooldownMs: 50,
                transferDelayMs: 0
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    bot.inventory.items = () => [];

    const vaultWindow = { title: 'Personal Vault', slots: Array(27), inventoryStart: 27 };
    const craftingMenu = { title: 'Chế tạo', slots: Array(27), inventoryStart: 27 };
    craftingMenu.slots[16] = { name: 'crafting_table', count: 1, displayName: 'Công thức' };
    framework.runtime.state.storage.gui.items = [{ slot: 12, itemName: 'cobblestone', amount: 16 }];
    framework.ctx.getService('storage').refreshStorageGui = async () => Result.SUCCESS;

    let personalVaultSentAt = 0;
    let craftingMenuSentAt = 0;
    bot.closeWindow = () => {
        bot.currentWindow = null;
        bot.emit('windowClose');
    };
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command === '/pv 2') {
            personalVaultSentAt = Date.now();
            bot.currentWindow = vaultWindow;
            bot.emit('windowOpen', vaultWindow);
        }
        if (command === '/ks') {
            craftingMenuSentAt = Date.now();
            bot.currentWindow = craftingMenu;
            bot.emit('windowOpen', craftingMenu);
        }
    };

    const crafting = framework.ctx.getService('crafting');
    assert.equal(crafting.start(10, 1), Result.SUCCESS);
    await crafting.tick();
    await crafting.tick();

    assert.equal(framework.runtime.state.crafting.status, 'WAITING_PERSONAL_VAULT_COOLDOWN');
    assert.equal(bot.chatMessages.includes('/ks'), false);

    await new Promise(resolve => setTimeout(resolve, 60));
    await crafting.tick();
    await crafting.tick();

    assert.ok(craftingMenuSentAt - personalVaultSentAt >= 45);
    assert.deepEqual(bot.chatMessages, ['/pv 2', '/ks']);
    await framework.stop();
});

test('collector mode records only bot collection events', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        skyblock: { islandTeleportDelayMs: 0 },
        collector: { superAlloyEnabled: false }
    });
    await framework.start();

    framework.runtime.state.bot.connected = true;
    framework.runtime.state.skyblock.loggedIn = true;
    framework.runtime.state.skyblock.joined = true;

    let pickupTarget = null;
    framework.ctx.getService('movement').goto = async target => {
        pickupTarget = target;
        return Result.SUCCESS;
    };

    const modes = framework.ctx.getManager('mode');
    assert.equal(await modes.start('collector'), Result.SUCCESS);
    assert.deepEqual(pickupTarget, { x: -23996.7, y: 100, z: 19207.3 });
    assert.ok(bot.chatMessages.includes('/is'));

    bot.emit('playerCollect', bot.entity, { name: 'stone' });
    assert.equal(framework.runtime.state.collector.collected, 1);

    await framework.stop();
});

test('collector does not tick storage or crafting while its start flow is still running', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, { collector: { pickupPosition: null } });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.skyblock.loggedIn = true;
    framework.runtime.state.skyblock.joined = true;

    let releaseIsland;
    framework.ctx.getService('skyblock').goToIsland = () => new Promise(resolve => { releaseIsland = resolve; });
    let storageChecks = 0;
    framework.ctx.getService('storage').refreshStorageGui = async () => {
        storageChecks += 1;
        return Result.SUCCESS;
    };

    const modes = framework.ctx.getManager('mode');
    const collector = framework.ctx.getMode('collector');
    const starting = modes.start('collector');
    await waitFor(() => collector.starting && typeof releaseIsland === 'function');
    await new Promise(resolve => setTimeout(resolve, 75));
    assert.equal(storageChecks, 0);

    releaseIsland(Result.SUCCESS);
    assert.equal(await starting, Result.SUCCESS);
    await framework.stop();
});

test('collector adopts an active craft run instead of retrying with BUSY', async () => {
    const framework = new Framework(new FakeBot(), {});
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.skyblock.joined = true;

    const collector = framework.ctx.getMode('collector');
    const crafting = framework.ctx.getService('crafting');
    let active = true;
    let craftTicks = 0;
    crafting.isActive = () => active;
    crafting.tick = async () => {
        craftTicks += 1;
        active = false;
        return Result.SUCCESS;
    };
    crafting.isFinished = () => true;
    crafting.succeeded = () => false;
    crafting.wasPartial = () => false;

    assert.equal(await collector.tick(), Result.SUCCESS);
    assert.equal(craftTicks, 1);
    assert.equal(collector.craftingActive, false);
    await framework.stop();
});

test('collector reaches its pickup point before starting the first SHK preflight', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        skyblock: { islandTeleportDelayMs: 0 },
        collector: {
            pickupPosition: { x: 10, y: 70, z: 20 },
            superAlloyEnabled: true,
            storageGuiCheckIntervalMs: 5000
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.skyblock.loggedIn = true;
    framework.runtime.state.skyblock.joined = true;

    const order = [];
    framework.ctx.getService('movement').goto = async (target, range, timeout) => {
        order.push(`move:${target.x},${target.y},${target.z}:${range}:${timeout}`);
        framework.runtime.state.player.position = { ...target };
        return Result.SUCCESS;
    };
    const crafting = framework.ctx.getService('crafting');
    let craftStarts = 0;
    let rawReady = true;
    crafting.getStorageReadiness = () => ({
        ready: rawReady,
        reason: rawReady ? null : 'coal: thiếu 1'
    });
    crafting.start = () => {
        order.push('craft');
        craftStarts += 1;
        return Result.SUCCESS;
    };

    const modes = framework.ctx.getManager('mode');
    assert.equal(await modes.start('collector'), Result.SUCCESS);
    const collector = framework.ctx.getMode('collector');
    assert.equal(craftStarts, 1);
    assert.deepEqual(order, ['move:10,70,20:1:60000', 'craft']);
    assert.equal(collector.craftingActive, true);
    assert.equal(framework.runtime.state.mode.state, 'CRAFTING_SHK');
    await framework.stop();
});

test('collector sells configured storage ores when free space reaches the threshold', async () => {
    const framework = new Framework(new FakeBot(), {
        collector: { postCraftSellMinimumAmount: 64 }
    });
    await framework.start();

    const storage = framework.ctx.getService('storage');
    const collector = framework.ctx.getMode('collector');
    let soldOres = null;
    const storageRefreshOptions = [];
    storage.refreshStorageGui = async options => {
        storageRefreshOptions.push(options || null);
        framework.runtime.state.storage.gui = {
            detail: {
                storage: { total: 800000, used: 750000, free: 50000 }
            },
            items: [
                { itemName: 'diamond', amount: 64 },
                { itemName: 'diamond_block', amount: 63 },
                { itemName: 'emerald', amount: 120 },
                { itemName: 'lapis_lazuli', amount: 64 },
                { itemName: 'coal', amount: 999 }
            ]
        };
        return Result.SUCCESS;
    };
    storage.sellItems = async ores => {
        soldOres = ores;
        return Result.SUCCESS;
    };

    assert.equal(await collector._checkAndSellStorage(), Result.SUCCESS);
    assert.deepEqual(storageRefreshOptions, [null, { runPostProcessing: false }]);
    assert.deepEqual(soldOres, storage.getSelectedOres());
    await framework.stop();
});

test('collector runs /kho packing and selling maintenance before pausing a full inventory', async () => {
    const framework = new Framework(new FakeBot(), {});
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.skyblock.joined = true;

    const collectorMode = framework.ctx.getMode('collector');
    const inventory = framework.ctx.getService('inventory');
    const storage = framework.ctx.getService('storage');
    const crafting = framework.ctx.getService('crafting');
    const calls = [];
    inventory.isFull = () => true;
    storage.refreshStorageGui = async options => {
        calls.push(options);
        return Result.SUCCESS;
    };
    storage.getStorageStats = () => ({ free: 200000 });
    crafting.getStorageReadiness = () => ({ ready: false });
    collectorMode.nextStorageGuiCheckAt = 0;

    assert.equal(await collectorMode.tick(), Result.INVENTORY_FULL);
    assert.deepEqual(calls, [undefined, { runPostProcessing: false }]);
    assert.equal(framework.runtime.state.collector.state, 'INVENTORY_FULL');
    await framework.stop();
});

test('SHK ledger aggregates custom materials from inventory, /pv 2, and /kho lore quantities', async () => {
    const framework = new Framework(new FakeBot(), {
        crafting: {
            recipes: {
                30: { name: 'Carbon', inputs: [] },
                31: { name: 'Titan', inputs: [] },
                32: { name: 'Wolfram', inputs: [] },
                33: { name: 'Super Alloy', inputs: [] }
            },
            materialAliases: { 32: ['Volfram'] }
        }
    });
    await framework.start();
    framework.runtime.state.inventory.items = [
        { labels: ['Volfram'], count: 2, slot: 36 }
    ];
    framework.runtime.state.personalVault.items = [
        { labels: ['Wolfram'], count: 3, slot: 0 }
    ];
    framework.runtime.state.storage.gui.items = [
        { labels: ['Volfram', 'Số lượng: 7'], amount: 7, count: 1, slot: 10 }
    ];

    const ledger = framework.ctx.getService('crafting').buildMaterialLedger();
    const wolfram = ledger.entries.find(item => item.slot === 32);
    assert.deepEqual(wolfram, {
        slot: 32,
        itemKey: 'wolfram',
        name: 'Wolfram',
        inventory: 2,
        storage: 7,
        vault: 3,
        total: 12
    });
    await framework.stop();
});

test('SHK ledger recognises a decorated refined-block display name in /pv 2', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();

    framework.runtime.state.personalVault.items = [{
        // MinerUA sometimes appends rarity/decorative symbols to the custom
        // name.  The exact recipe label is still the identity inside it.
        displayName: '✦ Khối Vàng Tinh Luyện ✦',
        labels: ['✦ Khối Vàng Tinh Luyện ✦', 'Player Head'],
        count: 12,
        slot: 4
    }];

    const ledger = framework.ctx.getService('crafting').buildMaterialLedger();
    const goldBlock = ledger.entries.find(item => item.slot === 25);
    assert.equal(goldBlock.vault, 12);
    assert.equal(goldBlock.total, 12);
    await framework.stop();
});

test('PV2 audit reports the exact SHK recipe slot recognised for each stored stack', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.personalVault.items = [{
        slot: 7,
        itemName: 'player_head',
        displayName: 'Khối Vàng Tinh Luyện ✦',
        labels: ['Khối Vàng Tinh Luyện ✦', 'Player Head'],
        count: 20
    }];
    const vault = framework.ctx.getService('personalVault');
    vault.refresh = async () => Result.SUCCESS;

    const audit = await framework.ctx.getService('crafting').auditPersonalVault();
    assert.equal(audit.result, Result.SUCCESS);
    assert.equal(audit.items[0].recipeSlot, 25);
    assert.equal(audit.items[0].recipeName, 'Khối vàng tinh luyện');
    assert.equal(framework.runtime.state.crafting.lastPersonalVaultAudit.mappedCount, 1);
    await framework.stop();
});

test('PV2 ledger maps MinerUA compact lore identifiers for every SHK material tier', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    const identifiers = new Map([
        [10, 'SIEUDACUOI'], [11, 'THANTINHLUYEN'], [12, 'DADOTINHLUYEN'], [13, 'LUULYTINHLUYEN'],
        [14, 'SATTINHLUYEN'], [15, 'VANGTINHLUYEN'], [16, 'KIMCUONGTINHLUYEN'], [19, 'NGOCLUCBAOTINHLUYEN'],
        [20, 'KHOISIEUDACUOI'], [21, 'KHOITHANTINHLUYEN'], [22, 'KHOIDADOTINHLUYEN'], [23, 'KHOILUULYTINHLUYEN'],
        [24, 'KHOISATTINHLUYEN'], [25, 'KHOIVANGTINHLUYEN'], [28, 'KHOIKIMCUONGTINHLUYEN'], [29, 'KHOINGOCLUCBAOTINHLUYEN'],
        [30, 'CACBON'], [31, 'TITAN'], [32, 'VOLFRAM'], [33, 'SIEUHOPKIM']
    ]);
    framework.runtime.state.personalVault.items = [...identifiers.entries()].map(([slot, identifier], index) => ({
        slot: index,
        itemName: 'player_head',
        displayName: 'Nguyên liệu sử dụng để chế tạo',
        labels: ['Nguyên liệu sử dụng để chế tạo', identifier, 'NAME'],
        count: 1
    }));

    const ledger = framework.ctx.getService('crafting').buildMaterialLedger();
    for (const slot of identifiers.keys()) {
        assert.equal(ledger.entries.find(item => item.slot === slot)?.vault, 1, `slot ${slot} must map from compact lore`);
    }
    await framework.stop();
});

test('SHK planner withdraws /pv 2 intermediates before equivalent NPC-storage stock', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    const crafting = framework.ctx.getService('crafting');
    const basePlan = crafting.plan(31, 1); // Titan needs 8 Khối Vàng TL.
    const supplies = new Map();
    for (const action of basePlan.actions) {
        supplies.set(action.slot, { inventory: 0, storage: 0, vault: 0 });
    }
    supplies.set(25, { inventory: 0, storage: 8, vault: 8 });

    const planned = crafting.planUsingExisting(basePlan, supplies);
    const goldBlock = planned.existingItems.find(item => item.slot === 25);
    assert.equal(goldBlock.inventoryUsed, 0);
    assert.equal(goldBlock.vaultUsed, 8);
    assert.equal(goldBlock.storageUsed, 0);
    assert.deepEqual(planned.vaultWithdrawals.find(item => item.slot === 25)?.amount, 8);
    await framework.stop();
});

test('SHK planner never treats /kho intermediate stock as player-carried B2-B4 material', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    const crafting = framework.ctx.getService('crafting');
    const basePlan = crafting.plan(31, 1); // Titan needs refined blocks.
    const supplies = new Map();
    for (const action of basePlan.actions) {
        supplies.set(action.slot, { inventory: 0, storage: 0, vault: 0 });
    }
    supplies.set(25, { inventory: 0, storage: 8, vault: 0 });

    const planned = crafting.planUsingExisting(basePlan, supplies);
    const goldBlock = planned.existingItems.find(item => item.slot === 25);
    assert.equal(goldBlock.storageAvailable, 8);
    assert.equal(goldBlock.storageUsed, 0);
    assert.equal(goldBlock.vaultUsed, 0);
    assert.equal(planned.actions.find(action => action.slot === 25)?.count, 8);
    await framework.stop();
});

test('SHK planner crafts only the missing Carbon, Titan, and Wolfram after using /pv 2 stock', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    const crafting = framework.ctx.getService('crafting');
    const basePlan = crafting.plan(33, 1);
    const supplies = new Map();
    for (const action of basePlan.actions) {
        supplies.set(action.slot, { inventory: 0, storage: 0, vault: 0 });
    }

    // One SHK needs 32 Carbon, 16 Titan and 8 Wolfram.  The vault already
    // provides all but one of each, therefore the recipe tree must expand
    // only the three missing units rather than recreate all 56 components.
    supplies.set(30, { inventory: 0, storage: 0, vault: 31 });
    supplies.set(31, { inventory: 0, storage: 0, vault: 15 });
    supplies.set(32, { inventory: 0, storage: 0, vault: 7 });

    const planned = crafting.planUsingExisting(basePlan, supplies);
    const counts = new Map(planned.actions.map(action => [action.slot, action.count]));
    assert.equal(counts.get(30), 1);
    assert.equal(counts.get(31), 1);
    assert.equal(counts.get(32), 1);
    assert.equal(counts.get(33), 1);
    assert.equal(planned.existingItems.find(item => item.slot === 30)?.vaultUsed, 31);
    assert.equal(planned.existingItems.find(item => item.slot === 31)?.vaultUsed, 15);
    assert.equal(planned.existingItems.find(item => item.slot === 32)?.vaultUsed, 7);
    await framework.stop();
});

test('SHK batch uses vault refined blocks first and crafts only two missing Wolfram before SHK', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    const crafting = framework.ctx.getService('crafting');
    const basePlan = crafting.plan(33, 1);
    const supplies = new Map();
    for (const action of basePlan.actions) {
        supplies.set(action.slot, { inventory: 0, storage: 0, vault: 0 });
    }

    // One SHK needs Carbon x32, Titan x16 and Wolfram x8.  `/pv 2` already
    // holds 6 Wolfram and every block required to create the last two.
    supplies.set(30, { inventory: 0, storage: 0, vault: 32 });
    supplies.set(31, { inventory: 0, storage: 0, vault: 16 });
    supplies.set(32, { inventory: 0, storage: 0, vault: 6 });
    supplies.set(20, { inventory: 0, storage: 0, vault: 4 });
    supplies.set(28, { inventory: 0, storage: 0, vault: 32 });
    supplies.set(29, { inventory: 0, storage: 0, vault: 8 });
    supplies.set(24, { inventory: 0, storage: 0, vault: 16 });
    supplies.set(25, { inventory: 0, storage: 0, vault: 16 });

    const planned = crafting.planUsingExisting(basePlan, supplies);
    const staged = crafting.planCraftableStages(planned, { materials: [] });
    const safeActions = crafting.createInventorySafeActions(staged);

    assert.deepEqual(staged.actions.map(action => [action.slot, action.count]), [[32, 2], [33, 1]]);
    assert.deepEqual(safeActions.map(action => [action.slot, action.count]), [[32, 2], [33, 1]]);
    assert.deepEqual(
        staged.vaultWithdrawals.map(item => [item.slot, item.amount]).sort((a, b) => a[0] - b[0]),
        [[20, 4], [24, 16], [25, 16], [28, 32], [29, 8], [30, 32], [31, 16], [32, 6]]
    );
    await framework.stop();
});

test('crafting pulls only the B3 inputs for the next B4 click from /pv 2', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    framework.runtime.state.bot.connected = true;
    const crafting = framework.ctx.getService('crafting');
    const settings = crafting.settings();
    const action = { slot: 30, name: settings.recipes[30].name, count: 1 };
    const definitions = [20, 21, 22].map(slot => ({
        slot,
        displayName: settings.recipes[slot].name,
        labels: [settings.recipes[slot].name],
        count: 64
    }));
    framework.runtime.state.personalVault.items = definitions;
    const requests = [];
    framework.ctx.getService('personalVault').withdraw = async items => {
        requests.push(...items);
        return Result.SUCCESS;
    };
    crafting.run = {
        active: true,
        status: 'CRAFTING',
        settings,
        plan: {
            targetSlot: 33,
            targetName: settings.recipes[33].name,
            targetCount: 1,
            actions: [action],
            totalActions: 1
        },
        actionIndex: 0,
        actionProgress: 0,
        completedActions: 0,
        availability: { materials: [] },
        vaultWithdrawals: [],
        actualVaultWithdrawals: [],
        plannedVaultWithdrawals: [],
        preparedVaultActionKey: null,
        targetCraftCount: 1,
        partial: false,
        shiftHistory: []
    };

    assert.equal(await crafting._prepareVaultInputsForAction(action), Result.PENDING);
    assert.deepEqual(
        requests.map(item => [item.slot, item.amount]).sort((a, b) => a[0] - b[0]),
        [[20, 4], [21, 16], [22, 8]]
    );
    assert.equal(await crafting._prepareVaultInputsForAction(action), Result.NO_ACTION);
    assert.equal(crafting.run.status, 'OPENING_GUI');
    await framework.stop();
});

test('crafting compacts carried B2 into B3 after a successful B5 click', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    const crafting = framework.ctx.getService('crafting');
    const settings = crafting.settings();
    framework.runtime.state.inventory.items = [{
        slot: 36,
        name: 'amethyst_shard',
        displayName: settings.recipes[10].name,
        labels: [settings.recipes[10].name],
        count: 32
    }];
    crafting.run = {
        active: true,
        status: 'CRAFTING',
        settings,
        plan: {
            targetSlot: 33,
            targetName: settings.recipes[33].name,
            targetCount: 1,
            actions: [],
            totalActions: 1
        },
        actionIndex: 0,
        actionProgress: 0,
        completedActions: 1,
        createdTargetCount: 1,
        postTargetB3PromotionChecked: false,
        availability: { materials: [] },
        vaultWithdrawals: [],
        actualVaultWithdrawals: [],
        plannedVaultWithdrawals: [],
        shiftHistory: []
    };

    assert.equal(crafting._completeOrPromoteB3(), Result.PENDING);
    assert.deepEqual(crafting.run.plan.actions.map(action => [action.slot, action.count]), [[20, 2]]);
    assert.equal(crafting.run.plan.totalActions, 3);
    await framework.stop();
});

test('SHK planner promotes carried B2 into B3 before scheduling another B2 craft', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    const crafting = framework.ctx.getService('crafting');
    const settings = crafting.settings();
    const basePlan = crafting.plan(20, 1);
    const supplies = new Map(basePlan.actions.map(action => [action.slot, {
        inventory: 0,
        storage: 0,
        vault: 0
    }]));
    // One refined-material block needs 16 B2. They already exist in player
    // inventory, so crafting must use them directly rather than create B2.
    supplies.set(10, { inventory: 16, storage: 0, vault: 0 });

    const reduced = crafting.planUsingExisting(basePlan, supplies, settings);
    const staged = crafting.planCraftableStages(reduced, { materials: [] }, settings);
    const actions = crafting.createInventorySafeActions(staged, settings);

    assert.deepEqual(reduced.actions.map(action => [action.slot, action.count]), [[20, 1]]);
    assert.deepEqual(actions.map(action => [action.slot, action.count]), [[20, 1]]);
    await framework.stop();
});

test('a full inventory re-plans around existing B2/B3 before failing the next B2 click', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.inventory.full = true;
    const crafting = framework.ctx.getService('crafting');
    const action = { slot: 10, name: 'Siêu đá cuội', count: 1 };
    crafting.run = {
        active: true,
        status: 'CRAFTING',
        settings: crafting.settings(),
        plan: { targetSlot: 33, targetName: 'Siêu Hợp Kim', targetCount: 1, actions: [action], totalActions: 1 },
        basePlan: crafting.plan(33, 1),
        actionIndex: 0,
        actionProgress: 0,
        completedActions: 0,
        personalVaultChecked: true,
        preparedTier2ActionIndex: 0,
        inventoryPressureReplanCount: 0,
        shiftHistory: []
    };

    assert.equal(await crafting._restartForInventoryPressure(action), Result.PENDING);
    assert.equal(crafting.run.status, 'CHECKING_STORAGE');
    assert.equal(crafting.run.inventoryPressureReplanCount, 1);
    assert.equal(crafting.run.actionIndex, 0);
    await framework.stop();
});

test('SHK recovery returns custom B2-B4 overflow even when a run fails', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    const crafting = framework.ctx.getService('crafting');
    framework.runtime.state.inventory.items = [
        { slot: 36, itemName: 'amethyst_shard', displayName: 'Khối vàng tinh luyện', labels: ['Khối vàng tinh luyện'], count: 8 },
        { slot: 37, itemName: 'amethyst_shard', displayName: 'Cacbon', labels: ['Cacbon'], count: 2 },
        { slot: 38, itemName: 'cobblestone', displayName: 'Cobblestone', labels: ['Cobblestone'], count: 64 },
        { slot: 39, itemName: 'amethyst_shard', displayName: 'Siêu Hợp Kim', labels: ['Siêu Hợp Kim'], count: 1 }
    ];
    crafting.run = {
        active: false,
        status: 'FAILED',
        settings: crafting.settings(),
        plan: crafting.plan(33, 1)
    };

    assert.deepEqual(
        crafting.getIntermediateRecoveryDepositRequests().map(item => [item.name, item.amount]),
        [['Khối vàng tinh luyện', 8], ['Cacbon', 2]]
    );
    crafting.run = null;
    await framework.stop();
});

test('collector deposits B2-B4 recovery material after a failed craft run', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    const collector = framework.ctx.getMode('collector');
    const crafting = framework.ctx.getService('crafting');
    const vault = framework.ctx.getService('personalVault');
    let deposited = null;

    crafting.tick = async () => Result.INVENTORY_FULL;
    crafting.isFinished = () => true;
    crafting.succeeded = () => false;
    crafting.wasPartial = () => false;
    crafting.getCraftedTargetCount = () => 0;
    crafting.getCompletedTargetDepositRequest = () => null;
    crafting.getIntermediateRecoveryDepositRequests = () => [{ name: 'Khối vàng tinh luyện', amount: 3 }];
    vault.deposit = async requests => {
        deposited = requests;
        return Result.SUCCESS;
    };
    collector.craftingActive = true;

    assert.equal(await collector._tickCrafting(), Result.INVENTORY_FULL);
    assert.deepEqual(deposited, [{ name: 'Khối vàng tinh luyện', amount: 3 }]);
    await framework.stop();
});

test('collector stops cascading GUI commands after a /ks timeout', async () => {
    const framework = new Framework(new FakeBot(), {
        collector: { guiFailureBackoffMs: 30000 }
    });
    await framework.start();
    const collector = framework.ctx.getMode('collector');
    const crafting = framework.ctx.getService('crafting');
    const vault = framework.ctx.getService('personalVault');
    const storage = framework.ctx.getService('storage');
    let vaultDeposits = 0;
    let storageReads = 0;

    crafting.tick = async () => Result.GUI_TIMEOUT;
    crafting.isFinished = () => true;
    crafting.succeeded = () => false;
    crafting.wasPartial = () => false;
    crafting.getCraftedTargetCount = () => 0;
    crafting.getCompletedTargetDepositRequest = () => null;
    crafting.getIntermediateRecoveryDepositRequests = () => [
        { name: 'Khối vàng tinh luyện', amount: 3 }
    ];
    vault.deposit = async () => {
        vaultDeposits += 1;
        return Result.SUCCESS;
    };
    storage.refreshStorageGui = async () => {
        storageReads += 1;
        return Result.SUCCESS;
    };
    collector.craftingActive = true;

    const beforeFailure = Date.now();
    assert.equal(await collector._tickCrafting(), Result.GUI_TIMEOUT);
    assert.equal(vaultDeposits, 0);
    assert.ok(collector.guiBackoffUntil >= beforeFailure + 29900);
    assert.equal(await collector._checkAndSellStorage(), Result.PENDING);
    assert.equal(storageReads, 0);
    assert.equal(collector._startCrafting(), Result.PENDING);
    await framework.stop();
});

test('collector clears the failed-session GUI backoff after reconnect', async () => {
    const framework = new Framework(new FakeBot());
    await framework.start();
    const collector = framework.ctx.getMode('collector');

    collector.guiBackoffUntil = Date.now() + 30000;
    collector.nextStorageGuiCheckAt = collector.guiBackoffUntil;
    collector.lastConnectionSessionId = 4;
    framework.runtime.state.bot.sessionId = 5;

    collector._resetGuiBackoffAfterReconnect();
    assert.equal(collector.guiBackoffUntil, 0);
    assert.equal(collector.nextStorageGuiCheckAt, 0);
    assert.equal(framework.runtime.state.collector.guiBackoffUntil, null);
    await framework.stop();
});

test('collector waits one hour only after it actually creates SHK', async () => {
    const framework = new Framework(new FakeBot(), {
        collector: { superAlloyIntervalMs: 3600000, superAlloyRetryIntervalMs: 120000 }
    });
    await framework.start();
    const collector = framework.ctx.getMode('collector');
    const crafting = framework.ctx.getService('crafting');
    crafting.tick = async () => Result.SUCCESS;
    crafting.isFinished = () => true;
    crafting.succeeded = () => true;
    crafting.wasPartial = () => false;
    crafting.getCraftedTargetCount = () => 1;
    crafting.getCompletedTargetDepositRequest = () => null;
    collector.craftingActive = true;

    const beforeSuccess = Date.now();
    await collector._tickCrafting();
    assert.ok(collector.nextCraftAttemptAt >= beforeSuccess + 3599000);

    crafting.getCraftedTargetCount = () => 0;
    crafting.wasPartial = () => true;
    collector.craftingActive = true;
    const beforePartial = Date.now();
    await collector._tickCrafting();
    assert.ok(collector.nextCraftAttemptAt >= beforePartial + 119000);
    assert.ok(collector.nextCraftAttemptAt < beforePartial + 130000);
    await framework.stop();
});

test('fishing reaches the target before equipping the rod and defaults to sprint-jump', async () => {
    const bot = new FakeBot();
    const events = [];
    bot.entity = { id: 1, position: new Vec3(76, 69, 88) };
    bot.inventory.items = () => [{ name: 'fishing_rod', displayName: 'Fishing Rod', count: 1 }];
    bot.equip = async () => events.push('equip');
    bot.setControlState = (control, value) => events.push(`${control}:${value}`);
    bot.lookAt = async () => {};

    const framework = new Framework(bot, {
        fishing: {
            slotTargets: { 11: [76, 69, 88] },
            targetReachDistance: 3,
            forceDirectSprintJump: true
        }
    });
    await framework.start();

    const fishing = framework.ctx.getService('fishing');
    fishing.running = true;
    fishing.afkSlot = 11;
    fishing.prepareNoDigMovement = () => {};
    fishing.walkDirectlyToTarget = async () => {
        assert.equal(events.includes('equip'), false, 'rod must not be equipped before arrival');
        events.push('arrived');
    };

    assert.equal(await fishing.prepareFishing(), Result.SUCCESS);
    assert.deepEqual(events.slice(0, 2), ['arrived', 'equip']);
    assert.equal(fishing.shouldForceDirectSprintJump({}), true);
    assert.equal(fishing.shouldForceDirectSprintJump({ forceDirectSprintJump: false }), false);

    events.length = 0;
    fishing.applyDirectMovementControls(new Vec3(77, 69, 88), {});
    assert.deepEqual(events, ['forward:true', 'sprint:true', 'jump:true']);
    await framework.stop();
});

test('storage title parser records capacity bars from the real NBT shape', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {});
    await framework.start();

    const title = {
        type: 'compound',
        value: {
            text: { type: 'string', value: '' },
            extra: {
                type: 'list',
                value: {
                    type: 'compound',
                    value: [
                        { text: { type: 'string', value: 'KHO ' } },
                        { text: { type: 'string', value: '▮▮▮▮' } },
                        { text: { type: 'string', value: '▯▯▯▯' } }
                    ]
                }
            }
        },
        toString: () => ''
    };

    const slots = Array(54);
    slots[49] = {
        name: 'player_head',
        displayName: 'Thông tin kho',
        nbt: {
            type: 'compound',
            value: {
                Lore: {
                    type: 'list',
                    value: [
                        { type: 'string', value: '{"text":"Dung lượng: 4/8"}' },
                        { type: 'string', value: '{"text":"Trạng thái: ĐÃ LỌC"}' },
                        { type: 'string', value: '{"text":"Số lượng: 8"}' }
                    ]
                }
            }
        }
    };

    bot.emit('windowOpen', { title, slots, inventoryStart: 54 });

    const storage = framework.runtime.state.storage.gui;
    assert.equal(storage.filledSegments, 4);
    assert.equal(storage.totalSegments, 8);
    assert.match(storage.title, /▮▮▮▮▯▯▯▯/);
    assert.equal(storage.detail.slot, 49);
    assert.equal(storage.detail.available, true);
    assert.equal(storage.detail.status, 'ĐÃ LỌC');
    assert.equal(storage.detail.amount, 8);
    assert.deepEqual(storage.detail.capacity, { filled: 4, total: 8 });
    await framework.stop();
});

test('storage slot 49 parser reads total, used, free, and percentages', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {});
    await framework.start();

    const slots = Array(54);
    slots[49] = {
        name: 'player_head',
        displayName: 'Storage information',
        nbt: {
            type: 'compound',
            value: {
                Lore: {
                    type: 'list',
                    value: [
                        { type: 'string', value: '{"text":"Dung luong: 800,000"}' },
                        { type: 'string', value: '{"text":"Da su dung: 453,724 / 56.72%"}' },
                        { type: 'string', value: '{"text":"Con trong: 346,276 / 43.28%"}' }
                    ]
                }
            }
        }
    };
    bot.emit('windowOpen', { title: 'Kho chua', slots, inventoryStart: 54 });

    assert.deepEqual(framework.runtime.state.storage.gui.detail.storage, {
        total: 800000,
        used: 453724,
        free: 346276,
        usedPercent: 56.72,
        freePercent: 43.28
    });
    await framework.stop();
});

test('storage slot 49 parser reads lore from Minecraft item components', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {});
    await framework.start();

    const slots = Array(54);
    slots[49] = {
        name: 'player_head',
        displayName: 'Storage information',
        components: [{
            type: 'lore',
            data: [
                '{"text":"Dung luong: 800,000"}',
                '{"text":"Da su dung: 453,724 / 56.72%"}',
                '{"text":"Con trong: 346,276 / 43.28%"}'
            ]
        }]
    };
    slots[10] = {
        name: 'coal',
        displayName: 'Coal',
        components: [{ type: 'lore', data: ['{"text":"So luong: 123,456"}'] }]
    };
    slots[12] = {
        name: 'cobblestone',
        displayName: 'Cobblestone',
        components: new Map([['lore', { data: ['{"text":"So luong: 654,321"}'] }]])
    };
    slots[13] = {
        name: 'diamond',
        displayName: 'Diamond',
        components: [{
            type: 'lore',
            data: {
                toString: () => 'So luong: 42'
            }
        }]
    };
    slots[14] = {
        name: 'diamond_block',
        displayName: 'Block of Diamond',
        components: [{
            type: 'lore',
            data: [{ text: 'Số lượng:' }, { color: 'yellow', text: '47,782' }]
        }]
    };
    bot.emit('windowOpen', { title: 'Kho chua', slots, inventoryStart: 54 });

    assert.deepEqual(framework.runtime.state.storage.gui.detail.storage, {
        total: 800000,
        used: 453724,
        free: 346276,
        usedPercent: 56.72,
        freePercent: 43.28
    });
    assert.equal(framework.runtime.state.storage.gui.items.find(item => item.slot === 10)?.amount, 123456);
    assert.equal(framework.runtime.state.storage.gui.items.find(item => item.slot === 12)?.amount, 654321);
    assert.equal(framework.runtime.state.storage.gui.items.find(item => item.slot === 13)?.amount, 42);
    assert.equal(framework.runtime.state.storage.gui.items.find(item => item.slot === 14)?.amount, 47782);
    await framework.stop();
});

test('storage reserves the B1 expansion buffer and never sells protected craft material', async () => {
    const framework = new Framework(new FakeBot(), {
        storage: {
            autoSellFreeThreshold: 150000,
            selectedOres: ['coal', 'coal_block', 'diamond']
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.storage.gui.items = [
        { slot: 10, itemName: 'coal', amount: 0 },
        { slot: 11, itemName: 'coal_block', amount: 100 }
    ];

    const storage = framework.ctx.getService('storage');
    let free = 150020;
    let sold = null;
    storage.getStorageStats = () => ({ free });
    storage.sellItems = async ores => {
        sold = ores;
        return Result.SUCCESS;
    };
    storage.refreshStorageGui = async options => {
        assert.deepEqual(options, { runPostProcessing: false });
        free = 200000;
        return Result.SUCCESS;
    };

    const result = await storage.reserveCapacityForUnpack(
        [{ item: 'coal', amount: 16 }],
        { coal: 10 },
        { protectedItems: [{ item: 'coal', amount: 16 }] }
    );

    assert.equal(result, Result.SUCCESS);
    assert.deepEqual(sold, ['diamond']);
    assert.equal(framework.runtime.state.storage.capacityReservation.status, 'RESERVED_AFTER_SELL');
    assert.equal(framework.runtime.state.storage.capacityReservation.additionalStorageUnits, 800);
    assert.equal(framework.runtime.state.storage.capacityReservation.requiredFree, 150800);
    await framework.stop();
});

test('storage re-packs B1 and sells non-protected ores before the capacity buffer is crossed', async () => {
    const framework = new Framework(new FakeBot(), {
        storage: {
            autoSellFreeThreshold: 150000,
            selectedOres: ['coal', 'coal_block', 'diamond']
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const storage = framework.ctx.getService('storage');
    const refreshes = [];
    let sold = null;
    storage.refreshStorageGui = async options => {
        refreshes.push(options);
        return Result.SUCCESS;
    };
    storage.getStorageStats = () => ({ free: 149999 });
    storage.sellItems = async ores => {
        sold = ores;
        return Result.SUCCESS;
    };

    assert.equal(
        await storage.repackAndProtectCapacity({ protectedItems: [{ item: 'coal', amount: 16 }] }),
        Result.SUCCESS
    );
    assert.deepEqual(refreshes, [undefined, { runPostProcessing: false }]);
    assert.deepEqual(sold, ['diamond']);
    await framework.stop();
});

test('storage sells each configured ore through its service API', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        storage: { selectedOres: ['DIAMOND', 'IRON_BLOCK'], sellCommandDelayMs: 0 }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const storage = framework.ctx.getService('storage');
    assert.equal(await storage.sellStorage(), Result.SUCCESS);
    assert.deepEqual(bot.chatMessages, ['/kho sell DIAMOND', '/kho sell IRON_BLOCK']);
    await framework.stop();
});

test('each successful /kho refresh runs raw smelting through /ks slot 12', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        storage: {
            guiTimeoutMs: 100,
            guiRetryAttempts: 0,
            smelting: {
                enabled: true,
                passes: 1,
                guiTimeoutMs: 100,
                actionDelayMs: 0
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const storageWindow = { title: 'Kho chứa', slots: Array(54), inventoryStart: 54 };
    storageWindow.slots[29] = { name: 'raw_gold', count: 1, displayName: 'Raw Gold' };
    const recipeMenu = { title: 'Chế tạo', slots: Array(27), inventoryStart: 27 };
    recipeMenu.slots[12] = { name: 'furnace', count: 1, displayName: 'Nung raw' };
    const smeltingWindow = { title: 'Nung raw', slots: Array(27), inventoryStart: 27 };
    smeltingWindow.slots[1] = { name: 'furnace', count: 1, displayName: 'Nung' };

    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command === '/kho') {
            bot.currentWindow = storageWindow;
            bot.emit('windowOpen', storageWindow);
        }
        if (command === '/ks') {
            bot.currentWindow = recipeMenu;
            bot.emit('windowOpen', recipeMenu);
        }
    };
    bot.clickWindow = async (slot, mouseButton, mode) => {
        bot.clickedSlots.push(slot);
        bot.clickedActions.push({ slot, mouseButton, mode });
        if (slot === 12) {
            bot.currentWindow = smeltingWindow;
            bot.emit('windowOpen', smeltingWindow);
        }
    };

    const result = await framework.ctx.getService('storage').refreshStorageGui();
    assert.equal(result, Result.SUCCESS);
    assert.deepEqual(bot.chatMessages, ['/kho', '/ks']);
    assert.deepEqual(bot.clickedActions, [
        { slot: 12, mouseButton: 0, mode: 0 },
        { slot: 1, mouseButton: 0, mode: 0 }
    ]);
    assert.equal(framework.runtime.state.smelting.status, 'READY');
    await framework.stop();
});

test('storage skips /ks smelting entirely when the /kho snapshot has no raw material', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        storage: {
            guiTimeoutMs: 100,
            guiRetryAttempts: 0,
            smelting: { enabled: true, passes: 2, guiTimeoutMs: 100 }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const storageWindow = { title: 'Kho chứa', slots: Array(54), inventoryStart: 54 };
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command === '/kho') {
            bot.currentWindow = storageWindow;
            bot.emit('windowOpen', storageWindow);
        }
    };

    assert.equal(await framework.ctx.getService('storage').refreshStorageGui(), Result.SUCCESS);
    assert.deepEqual(bot.chatMessages, ['/kho']);
    assert.equal(framework.runtime.state.smelting.lastSkipReason, 'NO_RAW_MATERIALS');
    await framework.stop();
});

test('each successful /kho refresh invokes the idle compression post-processor', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        storage: { guiTimeoutMs: 100, guiRetryAttempts: 0 }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    let conversionRuns = 0;
    framework.ctx.getService('materialConversion').pack = async () => {
        conversionRuns += 1;
        return Result.SUCCESS;
    };
    const storageWindow = { title: 'Kho chứa', slots: Array(54), inventoryStart: 54 };
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command === '/kho') {
            bot.currentWindow = storageWindow;
            bot.emit('windowOpen', storageWindow);
        }
    };

    assert.equal(await framework.ctx.getService('storage').refreshStorageGui(), Result.SUCCESS);
    assert.equal(conversionRuns, 1);
    await framework.stop();
});

test('lightweight /kho refresh skips smelting and conversion while retaining a fresh snapshot', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        storage: { guiTimeoutMs: 100, guiRetryAttempts: 0 }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    let smeltingRuns = 0;
    let conversionRuns = 0;
    framework.ctx.getService('smelting').run = async () => {
        smeltingRuns += 1;
        return Result.SUCCESS;
    };
    framework.ctx.getService('materialConversion').run = async () => {
        conversionRuns += 1;
        return Result.SUCCESS;
    };
    const storageWindow = { title: 'Kho chứa', slots: Array(54), inventoryStart: 54 };
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command === '/kho') {
            bot.currentWindow = storageWindow;
            bot.emit('windowOpen', storageWindow);
        }
    };

    const result = await framework.ctx.getService('storage').refreshStorageGui({
        runPostProcessing: false
    });
    assert.equal(result, Result.SUCCESS);
    assert.deepEqual(bot.chatMessages, ['/kho']);
    assert.equal(smeltingRuns, 0);
    assert.equal(conversionRuns, 0);
    await framework.stop();
});

test('/kho waits for a recent /pv 2 cooldown even when the vault GUI never opened', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        storage: { guiTimeoutMs: 100, guiRetryAttempts: 0 },
        crafting: {
            personalVault: {
                commandCooldownMs: 30
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const storageWindow = { title: 'Kho chứa', slots: Array(54), inventoryStart: 54 };
    let khoSentAt = 0;
    const send = bot.chat.bind(bot);
    bot.chat = command => {
        send(command);
        if (command === '/kho') {
            khoSentAt = Date.now();
            bot.currentWindow = storageWindow;
            bot.emit('windowOpen', storageWindow);
        }
    };

    const vault = framework.ctx.getService('personalVault');
    vault.lastCommandAt = Date.now();
    const startedAt = vault.lastCommandAt;
    assert.equal(await framework.ctx.getService('storage').refreshStorageGui({
        runPostProcessing: false
    }), Result.SUCCESS);
    assert.ok(khoSentAt - startedAt >= 25);
    await framework.stop();
});

test('crafting storage readiness uses raw /kho quantities, not slot 49 capacity', async () => {
    const framework = new Framework(new FakeBot(), {
        crafting: {
            targetSlot: 99,
            targetCount: 1,
            recipes: {
                99: { name: 'Test Alloy', inputs: [{ item: 'coal', amount: 16 }] }
            }
        }
    });
    await framework.start();

    framework.runtime.state.storage.gui = {
        detail: {
            storage: { total: 800000, used: 1, free: 799999 }
        },
        items: [{ slot: 10, itemName: 'coal', amount: 16 }]
    };

    const crafting = framework.ctx.getService('crafting');
    assert.equal(crafting.getStorageReadiness(99, 1).ready, true);
    framework.runtime.state.storage.gui.items[0].amount = 15;
    assert.equal(crafting.getStorageReadiness(99, 1).ready, false);
    await framework.stop();
});

test('collector waits longer before probing storage after a sale', async () => {
    const framework = new Framework(new FakeBot(), {
        storage: { guiCheckIntervalMs: 5000, afterSellGuiCheckDelayMs: 10000 }
    });
    await framework.start();

    const collectorMode = framework.ctx.getMode('collector');
    assert.equal(collectorMode._postStorageSellDelay(), 10000);
    await framework.stop();
});

test('storage probe waits for a new kho GUI instead of using a stale window', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, { storage: { guiTimeoutMs: 100 } });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const storage = framework.ctx.getService('storage');
    const probing = storage.refreshStorageGui();
    await waitFor(() => bot.chatMessages.includes('/kho'));

    bot.emit('windowOpen', {
        title: {
            type: 'compound',
            value: {
                text: { type: 'string', value: '' },
                extra: {
                    type: 'list',
                    value: {
                        type: 'compound',
                        value: [
                            { text: { type: 'string', value: 'ᴋʜᴏ ᴄʜứᴀ ' } },
                            { text: { type: 'string', value: '▮▮▮▮' } },
                            { text: { type: 'string', value: '▯▯▯▯' } }
                        ]
                    }
                }
            },
            toString: () => ''
        },
        slots: Array(54),
        inventoryStart: 54
    });

    assert.equal(await probing, Result.SUCCESS);
    assert.equal(framework.runtime.state.storage.gui.totalSegments, 8);
    await framework.stop();
});

test('storage probe exposes server feedback when /kho does not open a GUI', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, { storage: { guiTimeoutMs: 30 } });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const storage = framework.ctx.getService('storage');
    const probing = storage.refreshStorageGui();
    await waitFor(() => bot.chatMessages.includes('/kho'));
    bot.emit('messagestr', 'Ban phai doi truoc khi dung lenh nay.');

    assert.equal(await probing, Result.GUI_TIMEOUT);
    assert.equal(framework.runtime.state.storage.lastGuiProbe.status, 'TIMEOUT');
    assert.match(framework.runtime.state.storage.lastGuiProbe.message, /Chat server: Ban phai doi/);
    await framework.stop();
});

test('/pv 2 exposes server feedback when its GUI does not open', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        crafting: {
            personalVault: {
                guiTimeoutMs: 30,
                guiRetryAttempts: 0,
                commandCooldownMs: 0
            }
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const vault = framework.ctx.getService('personalVault');
    const probing = vault.refresh();
    await waitFor(() => bot.chatMessages.includes('/pv 2'));
    bot.emit('messagestr', 'Bạn phải đợi trước khi dùng lệnh này.');
    bot.emit('actionBar', { toString: () => 'Cooldown /pv 2' });

    assert.equal(await probing, Result.GUI_TIMEOUT);
    assert.equal(framework.runtime.state.personalVault.status, 'FAILED');
    assert.match(framework.runtime.state.personalVault.lastError, /Chat server: Bạn phải đợi/);
    assert.match(framework.runtime.state.personalVault.lastError, /Action bar: Cooldown \/pv 2/);
    await framework.stop();
});

test('mode manager rolls back a mode that fails during start', async () => {
    const framework = new Framework(new FakeBot(), {});
    await framework.start();

    const manager = framework.ctx.getManager('mode');
    const brokenMode = {
        name: 'BrokenMode',
        modeState: 'STOPPED',
        running: true,
        async start() { return Result.FAILED; },
        isRunning() { return this.running; },
        async stop() { this.running = false; return Result.SUCCESS; }
    };
    manager.register('broken', brokenMode);

    assert.equal(await manager.start('broken'), Result.FAILED);
    assert.equal(manager.current(), null);
    assert.equal(framework.runtime.state.mode.current, null);
    assert.equal(brokenMode.running, false);
    await framework.stop();
});

test('SkyBlock workflow reports each GUI step and waits for confirmation', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        skyblock: {
            afterSpawnDelayMs: 0,
            afterGuiOpenDelayMs: 0,
            islandClickAttempts: 1,
            islandTeleportDelayMs: 0,
            guiTimeoutMs: 100,
            joinTimeoutMs: 100
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.skyblock.loggedIn = true;

    const skyblock = framework.ctx.getService('skyblock');
    assert.equal(await skyblock.startJoin('test'), Result.PENDING);
    await waitFor(() => bot.chatMessages.includes('/skyblock'));

    const firstWindow = { title: 'SkyBlock', slots: [] };
    bot.emit('windowOpen', firstWindow);
    await waitFor(() => bot.clickedSlots.includes(12));

    const secondWindow = { title: 'Choose island', slots: [] };
    bot.emit('windowOpen', secondWindow);
    await waitFor(() => bot.clickedSlots.includes(19));

    bot.emit('message', { toString: () => 'Welcome to SkyBlock' });
    await waitFor(() => framework.runtime.state.skyblock.joined);

    assert.equal(skyblock.status().step, 'VERIFY_SKYBLOCK');
    assert.equal(skyblock.status().status, 'complete');
    await framework.stop();
});

test('SkyBlock workflow confirms a server teleport without relying on chat text', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        skyblock: { afterSpawnDelayMs: 0, afterGuiOpenDelayMs: 0, islandClickAttempts: 1, islandTeleportDelayMs: 0, guiTimeoutMs: 100, joinTimeoutMs: 100 }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.skyblock.loggedIn = true;
    const skyblock = framework.ctx.getService('skyblock');

    await skyblock.startJoin('test');
    await waitFor(() => bot.chatMessages.includes('/skyblock'));
    bot.emit('windowOpen', { title: 'SkyBlock', slots: [] });
    await waitFor(() => bot.clickedSlots.includes(12));
    bot.emit('windowOpen', { title: 'Island', slots: [] });
    await waitFor(() => bot.clickedSlots.includes(19));
    bot.emit('forcedMove');
    await waitFor(() => framework.runtime.state.skyblock.joined);

    assert.equal(skyblock.status().status, 'complete');
    await framework.stop();
});

test('SkyBlock retries the GUI flow without sending /login again', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        skyblock: {
            loginPassword: 'test-password',
            afterSpawnDelayMs: 0,
            afterLoginDelayMs: 0,
            afterGuiOpenDelayMs: 0,
            islandClickAttempts: 1,
            guiTimeoutMs: 50,
            joinTimeoutMs: 50,
            joinRetryDelayMs: 1000,
            islandTeleportDelayMs: 0
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    let skyblockAttempts = 0;
    const send = bot.chat.bind(bot);
    bot.chat = message => {
        send(message);
        if (message.startsWith('/login ')) {
            queueMicrotask(() => bot.emit('message', { toString: () => 'Đăng nhập thành công' }));
        }
        if (message === '/skyblock') {
            skyblockAttempts += 1;
            const menu = { title: `SkyBlock ${skyblockAttempts}`, slots: [] };
            bot.currentWindow = menu;
            bot.emit('windowOpen', menu);
        }
    };
    bot.clickWindow = async (slot, mouseButton, mode) => {
        bot.clickedSlots.push(slot);
        bot.clickedActions.push({ slot, mouseButton, mode });
        if (slot === 12) {
            const island = { title: `Island ${skyblockAttempts}`, slots: [] };
            bot.currentWindow = island;
            bot.emit('windowOpen', island);
        }
        if (slot === 19 && skyblockAttempts === 2) {
            setTimeout(() => bot.emit('forcedMove'), 0);
        }
    };

    bot.emit('login');
    bot.emit('spawn');

    const skyblock = framework.ctx.getService('skyblock');
    assert.equal(await skyblock.startJoin('test-retry'), Result.PENDING);
    await waitFor(() => framework.runtime.state.skyblock.joined, 2000);

    assert.equal(bot.chatMessages.filter(message => message.startsWith('/login ')).length, 1);
    assert.equal(bot.chatMessages.filter(message => message === '/skyblock').length, 2);
    assert.equal(skyblock.status().status, 'complete');
    await framework.stop();
});

test('SkyBlock join never sends login from ensureJoined after a connection error', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        skyblock: { loginPassword: 'test-password', loginTimeoutMs: 100 }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const skyblock = framework.ctx.getService('skyblock');
    assert.equal(await skyblock.startJoin('ensure-joined'), Result.PENDING);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(bot.chatMessages.filter(message => message.startsWith('/login ')).length, 0);

    bot.emit('error', new Error('client timed out'));
    await waitFor(() => framework.runtime.state.bot.connected === false);
    assert.equal(bot.chatMessages.filter(message => message.startsWith('/login ')).length, 0);
    await framework.stop();
});

test('SkyBlock never confirms a closed island menu after the socket has ended', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {});
    await framework.start();
    framework.runtime.state.bot.connected = true;

    const skyblock = framework.ctx.getService('skyblock');
    const waiting = skyblock.waitForJoined(1000);
    bot.emit('windowClose');
    bot.emit('end', 'socketClosed');

    await assert.rejects(waiting, /Mất kết nối khi chờ teleport/);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(framework.runtime.state.skyblock.joined, false);
    await framework.stop();
});

test('SkyBlock live exit uses a five-second recovery cooldown without reconnecting Minecraft', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        skyblock: {
            leaveRecoveryDelayMs: 5000,
            leaveCheckIntervalMs: 60000
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.skyblock.joined = true;
    framework.runtime.state.skyblock.loggedIn = true;
    bot.scoreboard = { sidebar: { title: 'Lobby', items: [] } };

    const skyblock = framework.ctx.getService('skyblock');
    let leaveReason = null;
    framework.ctx.getManager('events').once('skyblock.leave', reason => { leaveReason = reason; });

    assert.equal(skyblock.evaluateSkyBlockPresence('test lobby teleport'), Result.SUCCESS);
    assert.equal(framework.runtime.state.skyblock.joined, false);
    assert.match(leaveReason, /lobby/i);
    assert.equal(await skyblock.ensureJoined(), Result.PENDING);
    assert.deepEqual(bot.chatMessages, []);
    await framework.stop();
});

test('unexpected Dungeon teleport schedules /d re-entry without disabling AutoFarm', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        dungeon: {
            spawnCheckDelayMs: 0,
            spawnReentryDelayMs: 0,
            reentryDelayMs: 0,
            reenterOnUnexpectedForcedMove: true,
            unexpectedTeleportMinDistance: 12
        }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.skyblock.joined = true;
    bot.entity.position = new Vec3(0, 64, 0);
    bot.emit('move');

    const dungeon = framework.ctx.getService('dungeon');
    await dungeon.start();
    dungeon.autoFarmActive = true;
    let entries = 0;
    dungeon.enter = async () => {
        entries += 1;
        return Result.SUCCESS;
    };

    bot.entity.position = new Vec3(100, 64, 0);
    bot.emit('forcedMove');
    await waitFor(() => entries === 1);
    assert.equal(dungeon.autoFarmActive, true);
    await framework.stop();
});

test('dungeon mode enables AutoFarm before entering through /d', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        skyblock: { islandTeleportDelayMs: 0 },
        dungeon: { teleportDelayMs: 0, autofarmMenuDelayMs: 0, autofarmCloseDelayMs: 0, guiTimeoutMs: 100, entrySlot: 12, autofarmSlot: 21 }
    });
    await framework.start();
    framework.runtime.state.bot.connected = true;
    framework.runtime.state.skyblock.loggedIn = true;
    framework.runtime.state.skyblock.joined = true;

    const starting = framework.ctx.getManager('mode').start('dungeon');
    await waitFor(() => bot.chatMessages.includes('/autofarm'));
    const autofarmSlots = Array(54);
    autofarmSlots[21] = { type: 1, id: 1, name: 'stone' };
    bot.emit('windowOpen', { title: 'AutoFarm', slots: autofarmSlots });
    await waitFor(() => bot.clickedSlots.includes(21));
    await waitFor(() => bot.chatMessages.includes('/d'));
    const dungeonSlots = Array(54);
    dungeonSlots[12] = { type: 1, id: 1, name: 'stone' };
    bot.emit('windowOpen', { title: 'Dungeon', slots: dungeonSlots });
    await waitFor(() => bot.clickedSlots.includes(12));

    assert.equal(await starting, Result.SUCCESS);
    assert.ok(bot.clickedSlots.includes(12));
    assert.ok(bot.clickedSlots.includes(21));
    assert.equal(framework.runtime.state.dungeon.state, 'RUNNING');
    await framework.stop();
});
