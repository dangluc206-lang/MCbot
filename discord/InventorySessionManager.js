'use strict';

class InventorySessionManager {
    constructor() { this.sessions = new Map(); }
    create(userId, items) {
        const id = Math.random().toString(36).slice(2, 10);
        this.sessions.set(id, { userId, items, page: 0, expiresAt: Date.now() + 120000 });
        return id;
    }
    get(id, userId) {
        const session = this.sessions.get(id);
        if (!session || session.userId !== userId || session.expiresAt < Date.now()) {
            this.sessions.delete(id);
            return null;
        }
        return session;
    }
    clear() { this.sessions.clear(); }
}

module.exports = InventorySessionManager;
