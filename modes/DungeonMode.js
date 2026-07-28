'use strict';

const BaseMode = require('../core/base/BaseMode');
const Result = require('../core/constants/Result');

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

       const skyblock = this.service('skyblock');
        const dungeon = this.service('dungeon');

        const joined = await skyblock.ensureJoined();
        if (joined !== Result.SUCCESS && joined !== Result.ALREADY_DONE) {
            return joined;
        }

        const island = await skyblock.waitForIsland();
        if (island !== Result.SUCCESS) {
            await super.stop();
            return island;
        }

        const started = await dungeon.start();
        if (started !== Result.SUCCESS && started !== Result.ALREADY_DONE) {
            return started;
        }

        return dungeon.enter();
    }

    /**
     * Tick.
     *
     * @returns {Promise<String>}
     */
    async tick() {

        const joined = await this.service('skyblock').ensureJoined();
        if (joined !== Result.SUCCESS && joined !== Result.ALREADY_DONE) {
            return joined;
        }

        if (this.service('player').isDead()) {
            this.requestRecovery('PLAYER_DEAD');
            return Result.PLAYER_DEAD;
        }

        return this.service('dungeon').tick();
    }

    /**
     * Recovery.
     *
     * @returns {Promise<String>}
     */
    async recover() {

        const dungeon = this.service('dungeon');

        const joined = await this.service('skyblock').ensureJoined();
        if (joined !== Result.SUCCESS && joined !== Result.ALREADY_DONE) {
            return joined;
        }

        await this.service('movement').stop();

        if (!dungeon.isRunning()) {
            const started = await dungeon.start();
            if (started !== Result.SUCCESS && started !== Result.ALREADY_DONE) {
                return started;
            }
        }

        await dungeon.respawn();
        await dungeon.resume();

        this.clearRecovery();

        return Result.SUCCESS;
    }

    async pause() {
        const result = await super.pause();
        if (result !== Result.SUCCESS) return result;
        return this.service('dungeon').pause();
    }

    async resume() {
        const result = await this.service('dungeon').resume();
        if (result !== Result.SUCCESS) return result;
        return super.resume();
    }

    /**
     * Dừng Dungeon.
     *
     * @returns {Promise<String>}
     */
    async stop() {

        await this.service('movement').stop();
        await this.service('dungeon').exit();
        await this.service('dungeon').stop();
        

        return super.stop();
    }

}

module.exports = DungeonMode;
