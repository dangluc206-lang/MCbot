'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');

/** Adapter for process-owned connection lifecycle operations requested by controllers. */
class BotLifecycleService extends BaseService {
    constructor(ctx, actions = {}) {
        super(ctx);
        this.name = 'BotLifecycleService';
        this.actions = actions;
    }

    /**
     * Requests a process-owned Minecraft connection attempt.
     * `force` is reserved for the persistent Discord Control Panel: it may
     * replace a delayed post-kick reconnect, but never creates a second
     * simultaneous socket.
     *
     * @param {{force?: Boolean, source?: String}} options
     * @returns {Promise<String>}
     */
    async connect(options = {}) {
        return this.actions.connect ? this.actions.connect(options) : Result.FAILED;
    }

    async restart() {
        return this.actions.restart ? this.actions.restart() : Result.FAILED;
    }

    async shutdown() {
        return this.actions.shutdown ? this.actions.shutdown() : Result.FAILED;
    }
}

module.exports = BotLifecycleService;
