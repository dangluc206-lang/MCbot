'use strict';

const BaseMode = require('../core/base/BaseMode');
const Result = require('../core/constants/Result');

class CollectorMode extends BaseMode {

    constructor(ctx) {
        super(ctx);

        this.name = 'CollectorMode';
    }

    /**
     * Khởi động Collector.
     */
    async start() {

        const result = await super.start();

        if (result !== Result.SUCCESS) {
            return result;
        }

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

        return this.service('collector').start();

    }

    /**
     * Tick chính.
     */
    async tick() {

        // luôn đảm bảo đang ở SkyBlock
        const joined = await this.service('skyblock').ensureJoined();

        if (joined !== Result.SUCCESS && joined !== Result.ALREADY_DONE) {
            return joined;
        }

        // chết -> yêu cầu Recovery
        if (this.service('player').isDead()) {
            this.requestRecovery('PLAYER_DEAD');
            return Result.PLAYER_DEAD;
        }

        // inventory đầy -> bán
        if (this.service('inventory').isFull()) {

            await this.service('storage').sellAll();

            return Result.SUCCESS;
        }

        // thu thập
        return this.service('collector').tick();
    }

    /**
     * Recovery.
     */
    async recover() {

        await this.service('skyblock').ensureJoined();

        await this.service('movement').stop();

        await this.service('collector').resume();

        this.clearRecovery();

        return Result.SUCCESS;

    }

    async pause() {
        const result = await super.pause();
        if (result !== Result.SUCCESS) return result;
        await this.service('movement').stop();
        return Result.SUCCESS;
    }

    async resume() {
        return super.resume();
    }

    /**
     * Dừng Collector.
     */
    async stop() {

        await this.service('collector').stop();

        await this.service('movement').stop();

        return super.stop();

    }

}

module.exports = CollectorMode;
