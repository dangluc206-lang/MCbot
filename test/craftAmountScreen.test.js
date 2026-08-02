'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Result = require('../core/constants/Result');
const CraftAmountScreen = require('../screens/CraftAmountScreen');

function amountWindow() {
    const slots = Array(30).fill(null);
    slots[20] = { name: 'paper', count: 1 };
    slots[22] = { name: 'paper', count: 1 };
    slots[24] = { name: 'paper', count: 1 };
    return { title: 'Chọn số lượng', slots };
}

function screenWithClick(window, clicks) {
    return new CraftAmountScreen({
        window: () => window,
        click: async (...args) => {
            clicks.push(args);
            return Result.SUCCESS;
        }
    });
}

test('CraftAmountScreen resolves and clicks ONE, STACK, and ALL', async () => {
    for (const [amount, slot] of [['ONE', 20], ['STACK', 22], ['ALL', 24]]) {
        const window = amountWindow();
        const clicks = [];
        const screen = screenWithClick(window, clicks);

        assert.deepEqual(await screen.select(amount), { result: Result.SUCCESS, window: null });
        assert.deepEqual(clicks, [[slot, 0, 0]]);
    }
});

test('CraftAmountScreen supports new and legacy slot/timeout configuration', () => {
    const screen = new CraftAmountScreen({ window: amountWindow }, {
        config: {
            guiLayouts: { craftAmount: { oneSlot: 7, closeTimeoutMs: 9 } },
            crafting: { amountSlots: { one: 8, stack: 12, all: 14 }, guiTimeoutMs: 10 }
        }
    });
    assert.deepEqual(screen.resolveAmount('one'), { amount: 'ONE', slot: 7 });
    assert.equal(screen.amountSlot('STACK'), 12);
    assert.equal(screen.amountSlot('ALL'), 14);
    assert.equal(screen.closeTimeoutMs(), 9);
});

test('CraftAmountScreen rejects invalid amounts and buttons, while treating custom titles as diagnostic', async () => {
    const window = amountWindow();
    const clicks = [];
    const screen = screenWithClick(window, clicks);

    assert.deepEqual(await screen.select('many'), { result: Result.GUI_CLICK_FAILED, window: null });
    assert.deepEqual(await screen.select('ONE', 2), { result: Result.GUI_CLICK_FAILED, window: null });
    window.title = '§d✦ GUI custom ✦';
    assert.deepEqual(await screen.select('ONE'), { result: Result.SUCCESS, window: null });
    assert.equal(clicks.length, 1);
});

test('CraftAmountScreen does not wait for a window-close event after clicking', async () => {
    const window = amountWindow();
    const clicks = [];
    const screen = new CraftAmountScreen({
        window: () => window,
        click: async (...args) => {
            clicks.push(args);
            return Result.SUCCESS;
        }
    });

    assert.deepEqual(await screen.select('ONE'), { result: Result.SUCCESS, window: null });
    assert.deepEqual(clicks, [[20, 0, 0]]);
});

test('CraftAmountScreen refuses to click when the expected amount window changed', async () => {
    const expected = amountWindow();
    const replacement = amountWindow();
    const clicks = [];
    const screen = new CraftAmountScreen({
        window: () => replacement,
        click: async (...args) => {
            clicks.push(args);
            return Result.SUCCESS;
        }
    });

    assert.deepEqual(await screen.select('ONE', 0, 0, expected), { result: Result.GUI_NOT_FOUND, window: null });
    assert.deepEqual(clicks, []);
});

test('CraftAmountScreen returns the click outcome without waiting for a close event', async () => {
    const timeoutWindow = amountWindow();
    const timeoutScreen = new CraftAmountScreen({
        window: () => timeoutWindow,
        click: async () => Result.SUCCESS
    }, { config: { guiLayouts: { craftAmount: { closeTimeoutMs: 5 } } } });
    assert.deepEqual(await timeoutScreen.select('ONE'), { result: Result.SUCCESS, window: null });

    const failureScreen = new CraftAmountScreen({
        window: amountWindow,
        click: async () => Result.GUI_CLICK_FAILED
    });
    assert.deepEqual(await failureScreen.select('ONE'), { result: Result.GUI_CLICK_FAILED, window: null });

    const exceptionScreen = new CraftAmountScreen({
        window: amountWindow,
        click: async () => { throw new Error('click failed'); }
    });
    assert.deepEqual(await exceptionScreen.select('ONE'), { result: Result.GUI_CLICK_FAILED, window: null });
});
