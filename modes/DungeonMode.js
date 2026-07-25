'use strict';

const BaseMode = require('../base/BaseMode');
const Result = require('../constants/Result');

/**
 * ============================================================================
 * DungeonMode
 * ============================================================================
 *
 * Điều phối toàn bộ workflow Dungeon.
 *
 * Trách nhiệm:
 * - Đảm bảo bot đã vào SkyBlock.
 * - Điều phối DungeonService.
 * - Yêu cầu Recovery khi người chơi chết.
 *
 * Không chứa nghiệp vụ.
 * Không thao tác Mineflayer.
 *
 * ============================================================================
 */

class DungeonMode extends BaseMode {

    constructor(ctx) {
        super(ctx);

        this.name = 'DungeonMode';
    }

    /**
     * Khởi động Dungeon.
     *
     * @returns {Promise<String>}
     */
    async start() {

        const result = await super.start();

        if (result !== Result.SUCCESS) {
            return result;
        }

        await this.service('skyblock').ensureJoined();

        await this.service('dungeon').enter();

        return Result.SUCCESS;
    }

    /**
     * Tick.
     *
     * @returns {Promise<String>}
     */
    async tick() {

        await this.service('skyblock').ensureJoined();

        if (this.service('player').isDead()) {

            this.requestRecovery('PLAYER_DEAD');

            return Result.PLAYER_DEAD;

        }

        return Result.SUCCESS;
    }

    /**
     * Recovery.
     *
     * @returns {Promise<String>}
     */
    async recover() {

        await this.service('skyblock').ensureJoined();

        await this.service('movement').stop();

        await this.service('dungeon').respawn();

        await this.service('dungeon').resume();

        this.clearRecovery();

        return Result.SUCCESS;
    }

    /**
     * Dừng Dungeon.
     *
     * @returns {Promise<String>}
     */
    async stop() {

        await this.service('dungeon').stop();

        await this.service('movement').stop();

        await this.service('dungeon').exit();

        return super.stop();
    }

}

module.exports = DungeonMode;