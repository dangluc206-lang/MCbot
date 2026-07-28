'use strict';

/** Stores command and component contracts without coupling them to Discord events. */
class DiscordCommandRegistry {
    constructor() {
        this.commands = new Map();
        this.buttons = new Map();
        this.selects = new Map();
        this.modals = new Map();
        this.buttonMatchers = [];
    }

    register(command) {
        const name = command?.data?.name;
        if (!name || typeof command.execute !== 'function') throw new Error('Invalid Discord command contract.');
        if (this.commands.has(name)) throw new Error(`Discord command "${name}" already registered.`);
        this.commands.set(name, command);
        return this;
    }

    registerButton(customId, handler) { this.buttons.set(customId, handler); return this; }
    registerSelect(customId, handler) { this.selects.set(customId, handler); return this; }
    registerModal(customId, handler) { this.modals.set(customId, handler); return this; }
    registerButtonMatcher(match, handler) { this.buttonMatchers.push({ match, handler }); return this; }
    component(type, customId) {
        const handler = this[type].get(customId);
        if (handler || type !== 'buttons') return handler || null;
        return this.buttonMatchers.find(entry => entry.match(customId))?.handler || null;
    }
    command(name) { return this.commands.get(name) || null; }
    slashData() { return [...this.commands.values()].map(command => command.data.toJSON()); }
}

module.exports = DiscordCommandRegistry;
