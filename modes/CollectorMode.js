'use strict';

const BaseMode = require('../base/BaseMode');
const Result = require('../constants/Result');

/**
 * ============================================================================
 * CollectorMode
 * ============================================================================
 *
 * Điều phối workflow Collector.
 *
 * Không thao tác Mineflayer.
 * Chỉ gọi Service.
 *
 * ============================================================================
 */

class CollectorMode extends BaseMode {

    constructor(ctx) {
        super(ctx);

        this.name = 'CollectorMode';
    }

    async start() {

        await super.start();

        await this.service('skyblock').ensureJoined();

        return Result.SUCCESS;

    }

    async stop() {

        await this.service('movement').stop();

        return super.stop();

    }

    async tick() {

        const inventory = this.service('inventory');

        if (inventory.isFull()) {

            await this.service('storage').sellAll();

            return Result.SUCCESS;

        }

        await this.service('collector').collect();

        return Result.SUCCESS;

    }

    async recover() {

        await this.service('skyblock').ensureJoined();

        await this.service('movement').stop();

        await this.service('collector').resume();

        this.clearRecovery();

        return Result.SUCCESS;

    }

}

module.exports = CollectorMode;