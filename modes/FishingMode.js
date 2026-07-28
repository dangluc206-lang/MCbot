'use strict';

const BaseMode = require('../core/base/BaseMode');
const Result = require('../core/constants/Result');

class FishingMode extends BaseMode {
    constructor(ctx) {
        super(ctx);
        this.name = 'FishingMode';
    }

    async start() {
        const result = await super.start();
        if (result !== Result.SUCCESS) return result;

        const joined = await this.service('skyblock').ensureJoined();
        if (joined !== Result.SUCCESS && joined !== Result.ALREADY_DONE) {
            await super.stop();
            return joined;
        }
        const island = await this.service('skyblock').waitForIsland();
        if (island !== Result.SUCCESS) {
            await super.stop();
            return island;
        }
        const started = await this.service('fishing').start();
        if (started !== Result.SUCCESS && started !== Result.ALREADY_DONE) {
            await super.stop();
        }
        return started;
    }

    async tick() {
        if (this.service('player').isDead()) {
            this.requestRecovery('PLAYER_DEAD');
            return Result.PLAYER_DEAD;
        }
        return this.service('fishing').tick();
    }

    async pause() {
        const result = await super.pause();
        if (result !== Result.SUCCESS) return result;
        return this.service('fishing').pause();
    }

    async resume() {
        const result = await this.service('fishing').resume();
        if (result !== Result.SUCCESS) return result;
        return super.resume();
    }

    async stop() {
        await this.service('fishing').stop();
        await this.service('movement').stop();
        return super.stop();
    }
}

module.exports = FishingMode;
