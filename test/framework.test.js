'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const Framework = require('../Framework');
const Result = require('../core/constants/Result');

class FakeBot extends EventEmitter {
    constructor() {
        super();
        this.entity = { id: 1 };
        this.inventory = {
            items: () => [],
            emptySlotCount: () => 36,
            slots: Array(36)
        };
        this.quickBarSlot = 0;
        this.chatMessages = [];
        this.clickedSlots = [];
    }

    chat(message) {
        this.chatMessages.push(message);
    }

    async clickWindow(slot) {
        this.clickedSlots.push(slot);
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

test('framework can restart after a clean shutdown', async () => {
    const framework = new Framework(new FakeBot(), {});

    assert.equal(await framework.start(), Result.SUCCESS);
    assert.equal(await framework.stop(), Result.SUCCESS);
    assert.equal(await framework.start(), Result.SUCCESS);
    assert.equal(await framework.stop(), Result.SUCCESS);
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

test('collector mode records only bot collection events', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, { skyblock: { islandTeleportDelayMs: 0 } });
    await framework.start();

    framework.runtime.state.bot.connected = true;
    framework.runtime.state.skyblock.loggedIn = true;
    framework.runtime.state.skyblock.joined = true;

    const modes = framework.ctx.getManager('mode');
    assert.equal(await modes.start('collector'), Result.SUCCESS);

    bot.emit('playerCollect', bot.entity, { name: 'stone' });
    assert.equal(framework.runtime.state.collector.collected, 1);

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

    bot.emit('windowOpen', { title, slots: Array(54), inventoryStart: 54 });

    const storage = framework.runtime.state.storage.gui;
    assert.equal(storage.filledSegments, 4);
    assert.equal(storage.totalSegments, 8);
    assert.match(storage.title, /▮▮▮▮▯▯▯▯/);
    await framework.stop();
});

test('storage sells each configured ore through its service API', async () => {
    const bot = new FakeBot();
    const framework = new Framework(bot, {
        storage: { selectedOres: ['DIAMOND', 'IRON_BLOCK'], sellCommandDelayMs: 0 }
    });
    await framework.start();

    const storage = framework.ctx.getService('storage');
    assert.equal(await storage.sellStorage(), Result.SUCCESS);
    assert.deepEqual(bot.chatMessages, ['/kho sell diamond', '/kho sell iron_block']);
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
