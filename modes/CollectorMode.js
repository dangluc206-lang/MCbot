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

        await this.service('skyblock').ensureJoined();

        return Result.SUCCESS;

    }

    /**
     * Tick chính.
     */
    async tick() {

        // luôn đảm bảo đang ở SkyBlock
        await this.service('skyblock').ensureJoined();

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
        await this.service('collector').collect();

        return Result.SUCCESS;
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