'use strict';

const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const BaseScreen = require('./BaseScreen');

class DungeonScreen extends BaseScreen {
    constructor(guiService, options = {}) { super(guiService); this.config = options.config || {}; this.events = options.events || null; }
    entrySlot() { return slot(this.config.guiLayouts?.dungeon?.entrySlot, this.config.dungeon?.entrySlot, 12); }
    autofarmSlot() { return slot(this.config.guiLayouts?.dungeon?.autofarmSlot, this.config.dungeon?.autofarmSlot, 21); }
    isDungeonWindow(window = this.window()) { return validWindow(window, this.config.guiLayouts?.dungeon?.title ?? this.config.dungeon?.title, 'dungeon'); }
    isAutofarmWindow(window = this.window()) { return validWindow(window, this.config.guiLayouts?.dungeon?.autofarmTitle ?? this.config.dungeon?.autofarmTitle, 'autofarm'); }
    clickEntry() { return this._click(this.isDungeonWindow.bind(this), this.entrySlot()); }
    clickAutofarm() { return this._click(this.isAutofarmWindow.bind(this), this.autofarmSlot()); }
    async _click(matches, index) {
        if (!matches() || index === null) return Result.GUI_NOT_FOUND;
        const snapshot = this.snapshotSlot(index);
        if (!snapshot || !this.isSlotUnchanged(index, snapshot) || !matches()) return Result.GUI_NOT_FOUND;
        return this.click(index, 0, 0);
    }
    waitForOpen(previousWindow, timeout = 10000) {
        if (typeof this.events?.on !== 'function' || typeof this.events?.off !== 'function') return null;
        let cleanup;
        const promise = new Promise((resolve, reject) => {
            const handler = window => { if (window && window !== previousWindow) { cleanup(); resolve(window); } };
            const timer = setTimeout(() => { cleanup(); reject(new Error('Dungeon GUI timed out.')); }, bounded(timeout));
            cleanup = () => { clearTimeout(timer); this.events.off(Events.GUI.OPEN, handler); };
            this.events.on(Events.GUI.OPEN, handler);
        });
        return { promise, cancel: () => cleanup?.() };
    }
}
function slot(primary, legacy, fallback) { const value = primary ?? legacy ?? fallback; return Number.isInteger(value) && value >= 0 ? value : null; }
function validWindow(window) { return BaseScreen.isValidWindow(window); }
function bounded(value) { const number = Number(value); return Number.isFinite(number) ? Math.min(Math.max(number, 1), 60000) : 10000; }
module.exports = DungeonScreen;
