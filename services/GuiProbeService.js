'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');

/**
 * Diagnostic workflow for discovering server GUIs. It delegates chat and click
 * actions to services, keeping Discord commands free of Mineflayer calls.
 */
class GuiProbeService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'GuiProbeService';
        this.events = ctx.getManager('events');
        this.running = false;
    }

    /** Runs a small GUI discovery script, for example `/ks > l12 > r5`. */
    async run(script) {
        if (!this.state.bot.connected) return this._result(Result.NOT_CONNECTED, 'Minecraft bot chưa sẵn sàng.');
        if (this.running || this.manager('mode')?.current?.()) {
            return this._result(Result.BUSY, 'Hãy dừng mode hiện tại trước khi rà GUI.');
        }

        let actions;
        try {
            actions = this.parse(script);
        } catch (error) {
            return this._result(Result.FAILED, error.message);
        }

        this.running = true;
        const snapshots = [];
        try {
            for (const action of actions) {
                const output = await this._runAction(action);
                if (output.snapshot) snapshots.push(output.snapshot);
                if (output.result !== Result.SUCCESS) return this._result(output.result, output.message, snapshots);
            }
            return this._result(Result.SUCCESS, `Đã rà ${snapshots.length} GUI. Xem terminal với nhãn [GuiProbeService].`, snapshots);
        } catch (error) {
            this.error('GUI probe failed:', error.message);
            return this._result(Result.FAILED, error.message, snapshots);
        } finally {
            this.running = false;
        }
    }

    /** Parses `/command > l12 > r5 > wait:800 > inspect > close`. */
    parse(script) {
        const text = String(script || '').trim();
        if (!text || text.length > 256) throw new Error('Script phải dài từ 1 đến 256 ký tự.');

        const tokens = text.split('>').map(token => token.trim()).filter(Boolean);
        if (!tokens.length || !tokens[0].startsWith('/')) {
            throw new Error('Script phải bắt đầu bằng lệnh Minecraft, ví dụ: /ks > l12.');
        }

        return tokens.map((token, index) => {
            if (index === 0) return { type: 'command', command: token };

            const click = /^([lr])(\d{1,3})$/i.exec(token);
            if (click) return { type: 'click', slot: Number(click[2]), button: click[1].toLowerCase() === 'r' ? 1 : 0, token };

            const wait = /^wait(?::|\s+)(\d{1,5})$/i.exec(token);
            if (wait) {
                const milliseconds = Number(wait[1]);
                if (milliseconds > 10000) throw new Error('wait tối đa là 10000 ms.');
                return { type: 'wait', milliseconds };
            }

            if (/^(inspect|log)$/i.test(token)) return { type: 'inspect' };
            if (/^close$/i.test(token)) return { type: 'close' };
            throw new Error(`Bước "${token}" không hợp lệ. Dùng l12, r12, wait:800, inspect hoặc close.`);
        });
    }

    async _runAction(action) {
        const gui = this.service('gui');
        if (action.type === 'command') {
            const previous = gui.window();
            const result = await this.service('chat').sendCommand(action.command);
            if (result !== Result.SUCCESS) return { result, message: `Không gửi được ${action.command}: ${result}.` };
            const changed = await this._waitForWindowChange(previous, this._windowTimeout());
            const snapshot = this._logWindow(`sau ${action.command}${changed ? '' : ' (không thấy GUI mới)'}`);
            return changed
                ? { result: Result.SUCCESS, snapshot }
                : { result: Result.GUI_TIMEOUT, message: `Không thấy GUI mới sau ${action.command}.`, snapshot };
        }

        if (action.type === 'click') {
            const window = gui.window();
            if (!window) return { result: Result.GUI_NOT_FOUND, message: `Không có GUI để click ${action.token}.` };
            if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= (window.slots?.length || 0)) {
                return { result: Result.GUI_CLICK_FAILED, message: `Slot ${action.slot} không nằm trong GUI hiện tại.` };
            }
            const result = await gui.click(action.slot, action.button);
            if (result !== Result.SUCCESS) return { result, message: `Không click được ${action.token}: ${result}.` };
            const changed = await this._waitForWindowChange(window, this._windowTimeout());
            return { result: Result.SUCCESS, snapshot: this._logWindow(`sau ${action.token}${changed ? '' : ' (GUI không đổi)'}`) };
        }

        if (action.type === 'wait') {
            await this._delay(action.milliseconds);
            return { result: Result.SUCCESS, snapshot: this._logWindow(`sau wait:${action.milliseconds}`) };
        }

        if (action.type === 'inspect') return { result: Result.SUCCESS, snapshot: this._logWindow('inspect') };

        const result = await gui.close();
        if (result !== Result.SUCCESS) return { result, message: `Không đóng được GUI: ${result}.` };
        return { result, snapshot: this._logWindow('sau close') };
    }

    _windowTimeout() {
        const configured = Number(this.config.guiProbe?.windowTimeoutMs);
        return Number.isFinite(configured) ? Math.min(Math.max(configured, 250), 10000) : 1000;
    }

    _waitForWindowChange(previous, timeout) {
        const gui = this.service('gui');
        if (gui.window() && gui.window() !== previous) return Promise.resolve(true);
        return new Promise(resolve => {
            let timer;
            const finish = changed => {
                clearTimeout(timer);
                this.events.off(Events.GUI.OPEN, onOpen);
                resolve(changed);
            };
            const onOpen = window => {
                if (window !== previous) finish(true);
            };
            this.events.on(Events.GUI.OPEN, onOpen);
            timer = setTimeout(() => finish(false), timeout);
        });
    }

    _logWindow(label) {
        const window = this.service('gui').window();
        if (!window) {
            const snapshot = { label, title: null, itemCount: 0 };
            this.success(`[GUI probe] ${label} | GUI đã đóng.`);
            return snapshot;
        }

        const end = Number.isInteger(window.inventoryStart) ? window.inventoryStart : (window.slots?.length || 0);
        const items = (window.slots || []).slice(0, end).map((item, slot) => item ? this._itemText(item, slot) : null).filter(Boolean);
        const snapshot = { label, title: this._text(window.title), itemCount: items.length };
        this.success(`[GUI probe] ${label} | title="${snapshot.title || '(không có)'}" | items=${items.length}${items.length ? ` | ${items.join(' | ')}` : ''}`);
        return snapshot;
    }

    _itemText(item, slot) {
        const rawNbt = this._short(JSON.stringify(item.nbt || null), 1200);
        return `#${slot} ${item.name || 'unknown'} x${item.count || 1}${item.displayName ? ` (${item.displayName})` : ''}${rawNbt && rawNbt !== 'null' ? ` nbt=${rawNbt}` : ''}`;
    }

    _text(value) {
        if (typeof value === 'string') return value;
        try {
            const rendered = value?.toString?.();
            if (rendered && rendered !== '[object Object]') return rendered;
            return this._textComponent(value);
        } catch (_) {
            return '';
        }
    }

    _textComponent(value) {
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(entry => this._textComponent(entry)).join('');
        if (!value || typeof value !== 'object') return '';
        if (value.type === 'string') return String(value.value || '');
        if (value.type === 'list') return this._textComponent(value.value?.value || value.value);
        if (value.type === 'compound') return this._textComponent(value.value);
        return this._textComponent(value.text) + this._textComponent(value.extra);
    }

    _short(value, maxLength) {
        const text = String(value || '').replace(/[\r\n]+/g, ' ');
        return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
    }

    _delay(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    _result(result, message, snapshots = []) {
        return { result, message, snapshots };
    }
}

module.exports = GuiProbeService;
