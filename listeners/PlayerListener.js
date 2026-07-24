'use strict';

const BaseListener = require('../base/BaseListener');
const Result = require('../constants/Result');
const Events = require('../constants/Events');

/**
 * ============================================================================
 * PlayerListener
 * ============================================================================
 *
 * Đồng bộ trạng thái Player từ Mineflayer vào Runtime.
 *
 * Trách nhiệm:
 * - Cập nhật Runtime.
 * - Emit Framework Event.
 *
 * Không:
 * - Không xử lý nghiệp vụ.
 * - Không Recovery.
 * - Không gọi Mode.
 * - Không gọi Workflow.
 *
 * ============================================================================
 */

class PlayerListener extends BaseListener {

    constructor(ctx) {
        super(ctx);

        this.name = 'PlayerListener';
    }

    async register() {

        await super.register();

        /**
         * Spawn
         */
        this.bind(this.bot, 'spawn', () => {

            this.state.player.spawned = true;
            this.state.player.dead = false;

            this.state.player.username = this.bot.username ?? null;
            this.state.player.uuid = this.bot.player?.uuid ?? null;
            this.state.player.entity = this.bot.entity ?? null;

            this.emit(Events.Player.SPAWN);

        });

        /**
         * Death
         */
        this.bind(this.bot, 'death', () => {

            this.state.player.dead = true;

            this.emit(Events.Player.DEATH);

        });

        /**
         * Respawn
         */
        this.bind(this.bot, 'respawn', () => {

            this.state.player.dead = false;
            this.state.player.spawned = true;

            this.emit(Events.Player.RESPAWN);

        });

        /**
         * Health / Food
         */
        this.bind(this.bot, 'health', () => {

            this.state.player.health = this.bot.health;
            this.state.player.food = this.bot.food;

            this.emit(
                Events.Player.HEALTH,
                this.bot.health
            );

            this.emit(
                Events.Player.FOOD,
                this.bot.food
            );

        });

        /**
         * Experience
         */
        this.bind(this.bot, 'experience', () => {

            this.state.player.experience = this.bot.experience?.points ?? 0;
            this.state.player.level = this.bot.experience?.level ?? 0;

            this.emit(
                Events.Player.EXPERIENCE,
                this.state.player.experience
            );

        });

        /**
         * Move
         */
        this.bind(this.bot, 'move', () => {

            if (!this.bot.entity) {
                return;
            }

            this.state.player.position = this.bot.entity.position.clone();

            this.emit(
                Events.Player.POSITION,
                this.state.player.position
            );

            this.emit(
                Events.Player.MOVED,
                this.state.player.position
            );

        });

        return Result.SUCCESS;
    }

}

module.exports = PlayerListener;