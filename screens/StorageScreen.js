'use strict';

const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const BaseScreen = require('./BaseScreen');
const { matchesItem } = require('../utils/ItemMatcher');
const { findSlot } = require('../utils/SlotFinder');

class StorageScreen extends BaseScreen {
    constructor(guiService, options = {}) {
        super(guiService);
        this.config = options.config && typeof options.config === 'object' ? options.config : {};
        this.events = options.events || null;
    }

    isStorageWindow(window = this.window()) {
        if (!BaseScreen.isValidWindow(window)) return false;
        if (this.storageRange(window).end < this.minimumSlots()) return false;
        return true;
    }

    storageRange(window = this.window()) {
        if (!BaseScreen.isValidWindow(window)) return { start: 0, end: 0 };
        const end = Number.isInteger(window.inventoryStart)
            ? Math.min(Math.max(window.inventoryStart, 0), window.slots.length)
            : window.slots.length;
        return { start: 0, end };
    }

    findItem(definition) {
        const window = this.window();
        if (!this.isStorageWindow(window)) return notFound();
        return findSlot(window, definition, this.storageRange(window));
    }

    snapshotStorageSlot(slot) {
        return inRange(slot, this.storageRange()) ? this.snapshotSlot(slot) : null;
    }

    async clickUnique(definition, mouseButton = 0, mode = 0) {
        const found = this.findItem(definition);
        if (found.status !== 'FOUND') return Result.ITEM_NOT_FOUND;
        return this.clickIfUnchanged(found.slot, this.snapshotSlot(found.slot), definition, mouseButton, mode);
    }

    async clickIfUnchanged(slot, snapshot, definition, mouseButton = 0, mode = 0) {
        if (!this.isStorageWindow() || !inRange(slot, this.storageRange())) return Result.GUI_NOT_FOUND;
        const item = this.slot(slot);
        if (!item || !this.isSlotUnchanged(slot, snapshot) || !matchesItem(item, definition)) {
            return Result.ITEM_NOT_FOUND;
        }
        return this.click(slot, mouseButton, mode);
    }

    async clickUniqueAndWaitForClose(definition, timeout = 5000, mouseButton = 0, mode = 0) {
        const targetWindow = this.window();
        const waiting = this.waitForClose(targetWindow, timeout);
        if (!waiting) return { result: Result.FAILED, window: null };
        try {
            const result = await this.clickUnique(definition, mouseButton, mode);
            if (result !== Result.SUCCESS) {
                waiting.cancel();
                return { result, window: null };
            }
            return await waiting.promise;
        } catch (_) {
            waiting.cancel();
            return { result: Result.GUI_CLICK_FAILED, window: null };
        }
    }

    waitForClose(targetWindow, timeout) {
        if (typeof this.events?.on !== 'function' || typeof this.events?.off !== 'function') return null;
        let cleanup;
        const promise = new Promise(resolve => {
            const onClose = window => {
                if (window === targetWindow) finish({ result: Result.SUCCESS, window });
            };
            const timer = setTimeout(() => finish({ result: Result.GUI_TIMEOUT, window: null }), boundedTimeout(timeout));
            const finish = value => {
                cleanup();
                resolve(value);
            };
            cleanup = () => {
                clearTimeout(timer);
                this.events.off(Events.GUI.CLOSE, onClose);
            };
            this.events.on(Events.GUI.CLOSE, onClose);
        });
        return { promise, cancel: () => cleanup?.() };
    }

    title() {
        const configured = this.config.guiLayouts?.storage?.title
            ?? this.config.storage?.guiTitle
            ?? this.config.storage?.title;
        return typeof configured === 'string' && configured.trim() ? configured.trim() : null;
    }

    minimumSlots() {
        const configured = this.config.guiLayouts?.storage?.minimumSlots
            ?? this.config.storage?.minimumGuiSlots
            ?? 54;
        return Number.isInteger(configured) && configured >= 0 ? configured : 54;
    }
}

function inRange(slot, range) {
    return Number.isInteger(slot) && slot >= range.start && slot < range.end;
}

function notFound() {
    return { status: 'NOT_FOUND', slot: null, slots: [] };
}

function boundedTimeout(value) {
    const timeout = Number(value);
    return Number.isFinite(timeout) ? Math.min(Math.max(timeout, 1), 60000) : 5000;
}

function normalizeTitle(value) {
    const smallCaps = {
        'ᴋ': 'k', 'ʜ': 'h', 'ᴏ': 'o', 'ᴄ': 'c', 'ᴜ': 'u', 'ѕ': 's',
        'ʀ': 'r', 'ᴇ': 'e', 'ɴ': 'n', 'ɪ': 'i', 'ᴍ': 'm', 'ᴀ': 'a'
    };
    return titleText(value)
        .replace(/§[0-9A-FK-OR]/gi, '')
        .replace(/[ᴋʜᴏᴄᴜѕʀᴇɴɪᴍᴀ]/g, character => smallCaps[character] || character)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function titleText(value, depth = 0) {
    if (depth > 16 || value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(entry => titleText(entry, depth + 1)).join('');
    if (typeof value !== 'object') return String(value);
    if (value.type === 'string') return titleText(value.value, depth + 1);
    if (value.type === 'compound' || value.type === 'list') return titleText(value.value, depth + 1);
    if (value.text || value.extra) return titleText(value.text, depth + 1) + titleText(value.extra, depth + 1);
    try {
        const rendered = typeof value.toString === 'function' ? value.toString() : '';
        if (rendered && rendered !== '[object Object]') return rendered;
    } catch (_) {
        // Fall through to the component fields.
    }
    return titleText(value.value ?? value.data, depth + 1);
}

module.exports = StorageScreen;
