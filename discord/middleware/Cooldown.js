'use strict';

/** Per-user command cooldown tracker with bounded memory. */
class Cooldown {
    constructor() {
        this.entries = new Map();
    }

    check(interaction, key, seconds = 0) {
        if (!seconds) return 0;
        const now = Date.now();
        const id = `${interaction.guildId || 'dm'}:${interaction.user.id}:${key}`;
        const previous = this.entries.get(id) || 0;
        const wait = seconds * 1000 - (now - previous);
        if (wait > 0) return wait;
        this.entries.set(id, now);
        if (this.entries.size > 1000) {
            for (const [entry, timestamp] of this.entries) if (now - timestamp > 600000) this.entries.delete(entry);
        }
        return 0;
    }

    clear() {
        this.entries.clear();
    }
}

module.exports = Cooldown;
