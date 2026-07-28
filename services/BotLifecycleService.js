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

    async connect() {
        return this.actions.connect ? this.actions.connect() : Result.FAILED;
    }

    async restart() {
        return this.actions.restart ? this.actions.restart() : Result.FAILED;
    }

    async shutdown() {
        return this.actions.shutdown ? this.actions.shutdown() : Result.FAILED;
    }
}

module.exports = BotLifecycleService;
