'use strict';

class InventorySessionManager {
    constructor(options = {}) {
        this.sessions = new Map();
        this.ttlMs = Math.max(1000, Number(options.ttlMs) || 120000);
        this.maxEntries = Math.max(1, Number(options.maxEntries) || 100);
        this.now = typeof options.now === 'function' ? options.now : Date.now;
    }
    create(userId, items) {
        this.cleanup();
        while (this.sessions.size >= this.maxEntries) this.sessions.delete(this.sessions.keys().next().value);
        const id = Math.random().toString(36).slice(2, 10);
        this.sessions.set(id, { userId, items, page: 0, expiresAt: this.now() + this.ttlMs });
        return id;
    }
    get(id, userId) {
        const session = this.sessions.get(id);
        if (!session) return null;
        if (session.expiresAt < this.now()) {
            this.sessions.delete(id);
            return null;
        }
        if (session.userId !== userId) return null;
        return session;
    }
    remove(id) { return this.sessions.delete(id); }
    cleanup() {
        const now = this.now();
        for (const [id, session] of this.sessions) if (session.expiresAt < now) this.sessions.delete(id);
    }
    clear() { this.sessions.clear(); }
}

module.exports = InventorySessionManager;
