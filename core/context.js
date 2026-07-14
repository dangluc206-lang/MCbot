class Context {

    constructor(bot, manager, states, config) {

        this.bot = bot;
        this.manager = manager;
        this.states = states;
        this.config = config;

        this.targetBlock = null;

        this.busy = false;

    }

}

module.exports = Context;