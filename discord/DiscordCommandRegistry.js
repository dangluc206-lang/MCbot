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

    registerButton(customId, handler) { return this._registerComponent(this.buttons, 'button', customId, handler); }
    registerSelect(customId, handler) { return this._registerComponent(this.selects, 'select menu', customId, handler); }
    registerModal(customId, handler) { return this._registerComponent(this.modals, 'modal', customId, handler); }
    registerButtonMatcher(match, handler) { this.buttonMatchers.push({ match, handler }); return this; }
    component(type, customId) {
        const handler = this[type].get(customId);
        if (handler || type !== 'buttons') return handler || null;
        return this.buttonMatchers.find(entry => entry.match(customId))?.handler || null;
    }
    command(name) { return this.commands.get(name) || null; }
    slashData() { return [...this.commands.values()].map(command => command.data.toJSON()); }

    _registerComponent(collection, type, customId, handler) {
        if (!customId || typeof customId !== 'string' || !handler || typeof handler.execute !== 'function') {
            throw new Error(`Invalid Discord ${type} handler contract.`);
        }
        if (collection.has(customId)) {
            throw new Error(`Discord ${type} "${customId}" already registered.`);
        }
        collection.set(customId, handler);
        return this;
    }
}

module.exports = DiscordCommandRegistry;
