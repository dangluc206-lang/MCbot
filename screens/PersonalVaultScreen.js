'use strict';

const Result = require('../core/constants/Result');
const BaseScreen = require('./BaseScreen');
const { matchesItem } = require('../utils/ItemMatcher');
const { findSlot } = require('../utils/SlotFinder');

class PersonalVaultScreen extends BaseScreen {
    constructor(guiService, options = {}) {
        super(guiService);
        this.title = typeof options.title === 'string' && options.title.trim()
            ? options.title.trim()
            : 'Personal Vault';
    }

    isVaultWindow(window = this.window()) {
        return BaseScreen.isValidWindow(window);
    }

    vaultRange(window = this.window()) {
        if (!this.isVaultWindow(window)) return emptyRange();
        const end = boundary(window.inventoryStart, window.slots.length);
        return { start: 0, end };
    }

    playerInventoryRange(window = this.window()) {
        if (!this.isVaultWindow(window)) return emptyRange();
        const start = boundary(window.inventoryStart, window.slots.length);
        const end = Math.max(start, boundary(window.inventoryEnd, window.slots.length));
        return { start, end };
    }

    snapshotVaultSlots() {
        return this.snapshotSlots(this.vaultRange());
    }

    snapshotPlayerInventorySlots() {
        return this.snapshotSlots(this.playerInventoryRange());
    }

    snapshotSlots(range) {
        const window = this.window();
        if (!this.isVaultWindow(window)) return [];
        const snapshots = [];
        for (let slot = range.start; slot < range.end; slot += 1) {
            snapshots.push({ slot, item: this.snapshotSlot(slot) });
        }
        return snapshots;
    }

    findVaultItem(definition) {
        return this.findItem(definition, this.vaultRange());
    }

    findPlayerInventoryItem(definition) {
        return this.findItem(definition, this.playerInventoryRange());
    }

    findItem(definition, range) {
        const window = this.window();
        if (!this.isVaultWindow(window)) return { status: 'NOT_FOUND', slot: null, slots: [] };
        return findSlot(window, definition, range);
    }

    async clickUnique(definition, range, mouseButton = 0, mode = 0) {
        const found = this.findItem(definition, range);
        if (found.status !== 'FOUND') return Result.ITEM_NOT_FOUND;
        return this.clickIfUnchanged(found.slot, this.snapshotSlot(found.slot), definition, mouseButton, mode);
    }

    async clickIfUnchanged(slot, snapshot, definition, mouseButton = 0, mode = 0) {
        const window = this.window();
        if (!this.isVaultWindow(window)) return Result.GUI_NOT_FOUND;
        const item = this.slot(slot);
        if (!item || !this.isSlotUnchanged(slot, snapshot) || !matchesItem(item, definition)) {
            return Result.ITEM_NOT_FOUND;
        }
        return this.click(slot, mouseButton, mode);
    }

    async clickVaultSlotIfUnchanged(slot, snapshot, mouseButton = 0, mode = 0) {
        return this.clickSlotIfUnchanged(slot, snapshot, this.vaultRange(), mouseButton, mode);
    }

    async clickPlayerSlotIfUnchanged(slot, snapshot, mouseButton = 0, mode = 0) {
        return this.clickSlotIfUnchanged(slot, snapshot, this.playerInventoryRange(), mouseButton, mode);
    }

    async clickSlotIfUnchanged(slot, snapshot, range, mouseButton = 0, mode = 0) {
        if (!this.isVaultWindow() || slot < range.start || slot >= range.end || !this.isSlotUnchanged(slot, snapshot)) {
            return Result.GUI_NOT_FOUND;
        }
        return this.click(slot, mouseButton, mode);
    }
}

function boundary(value, length) {
    if (!Number.isInteger(value)) return length;
    return Math.min(Math.max(value, 0), length);
}

function emptyRange() {
    return { start: 0, end: 0 };
}

module.exports = PersonalVaultScreen;
