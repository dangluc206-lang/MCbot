'use strict';

class ConfirmationManager {
    constructor(options = {}) {
        this.entries = new Map();
        this.ttlMs = Math.max(1000, Number(options.ttlMs) || 60000);
        this.maxEntries = Math.max(1, Number(options.maxEntries) || 100);
        this.now = typeof options.now === 'function' ? options.now : Date.now;
    }
    create(userId, action) {
        this.cleanup();
        while (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value);
        const id = Math.random().toString(36).slice(2, 10);
        this.entries.set(id, { userId, action, expiresAt: this.now() + this.ttlMs });
        return id;
    }
    take(id, userId) {
        const entry = this.entries.get(id);
        if (!entry) return null;
        if (entry.expiresAt < this.now()) {
            this.entries.delete(id);
            return null;
        }
        if (entry.userId !== userId) return null;
        this.entries.delete(id);
        return entry.action;
    }
    cleanup() {
        const now = this.now();
        for (const [id, entry] of this.entries) if (entry.expiresAt < now) this.entries.delete(id);
    }
    clear() { this.entries.clear(); }
}

module.exports = ConfirmationManager;
