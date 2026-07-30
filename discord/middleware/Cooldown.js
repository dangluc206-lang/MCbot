'use strict';

/** Per-user command cooldown tracker with bounded memory. */
class Cooldown {
    constructor(options = {}) {
        this.entries = new Map();
        this.maxEntries = Math.max(1, Number(options.maxEntries) || 1000);
        this.ttlMs = Math.max(1000, Number(options.ttlMs) || 600000);
        this.now = typeof options.now === 'function' ? options.now : Date.now;
    }

    check(interaction, key, seconds = 0) {
        if (!seconds) return 0;
        const now = this.now();
        const id = `${interaction.guildId || 'dm'}:${interaction.user.id}:${key}`;
        const previous = this.entries.get(id) || 0;
        const wait = seconds * 1000 - (now - previous);
        if (wait > 0) return wait;
        this._evict(now);
        this.entries.set(id, now);
        return 0;
    }

    clear() {
        this.entries.clear();
    }

    _evict(now) {
        for (const [entry, timestamp] of this.entries) {
            if (now - timestamp > this.ttlMs) this.entries.delete(entry);
        }
        while (this.entries.size >= this.maxEntries) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) break;
            this.entries.delete(oldest);
        }
    }
}

module.exports = Cooldown;
