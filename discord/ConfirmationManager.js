'use strict';

class ConfirmationManager {
    constructor() { this.entries = new Map(); }
    create(userId, action) {
        const id = Math.random().toString(36).slice(2, 10);
        this.entries.set(id, { userId, action, expiresAt: Date.now() + 60000 });
        return id;
    }
    take(id, userId) {
        const entry = this.entries.get(id);
        this.entries.delete(id);
        return entry?.userId === userId && entry.expiresAt >= Date.now() ? entry.action : null;
    }
    clear() { this.entries.clear(); }
}

module.exports = ConfirmationManager;
