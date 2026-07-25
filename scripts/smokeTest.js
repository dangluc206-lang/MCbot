'use strict';

const Framework = require('../Framework');

class FakeBot {

    constructor() {
        this._events = new Map();
    }

    on(event, listener) {

        if (!this._events.has(event)) {
            this._events.set(event, []);
        }

        this._events.get(event).push(listener);

    }

    once(event, listener) {
        this.on(event, listener);
    }

    off() {}

    removeListener() {}

    emit(event, ...args) {

        const listeners = this._events.get(event) || [];

        for (const listener of listeners) {
            listener(...args);
        }

    }

}

(async () => {

    const bot = new FakeBot();

    const framework = new Framework(bot, {});

    console.log('========== START ==========');

    await framework.start();

    console.log('Framework started.');

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('========== STOP ==========');

    await framework.stop();

    console.log('Framework stopped.');

    process.exit(0);

})();