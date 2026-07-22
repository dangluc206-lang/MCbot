'use strict';

const BaseService = require('../base/BaseService');
const Result = require('../constants/Result');
const Events = require('../constants/Events');

/**
 * ============================================================================
 * PlayerService
 * ============================================================================
 *
 * Quản lý thông tin Player Runtime.
 *
 * Trách nhiệm:
 * - Theo dõi health.
 * - Theo dõi food.
 * - Theo dõi position.
 * - Theo dõi death/spawn.
 * - Đồng bộ Player State.
 *
 * Không:
 * - Điều phối workflow.
 * - Điều khiển Mode.
 * - Tự Recovery.
 *
 * ============================================================================
 */
class PlayerService extends BaseService {

    constructor(ctx) {
        super(ctx);

        this.name = 'PlayerService';

        this.events = ctx.getManager('events');
    }


    /**
     * Initialize Service.
     *
     * @returns {Promise<String>}
     */
    async initialize() {

        await super.initialize();

        this.bindEvents();

        return Result.SUCCESS;
    }


    /**
     * Đăng ký Mineflayer Events.
     */
    bindEvents() {

        if (!this.bot) {
            return;
        }


        this.bot.on('spawn', () => {

            this.state.player.spawned = true;

            this.state.player.dead = false;

            this.state.player.username =
                this.bot.username || null;


            this.emit(
                Events.Player.SPAWN,
                this.state.player
            );

        });


        this.bot.on('health', () => {

            this.updateHealth();

        });


        this.bot.on('death', () => {

            this.state.player.dead = true;

            this.state.metrics.deaths++;

            this.emit(
                Events.Player.DEATH
            );

        });


        this.bot.on('respawn', () => {

            this.state.player.dead = false;

            this.emit(
                Events.Player.RESPAWN
            );

        });


        this.bot.on('move', () => {

            this.updatePosition();

        });

    }


    /**
     * Update Health/Food.
     *
     * @returns {String}
     */
    updateHealth() {

        if (!this.bot) {
            return Result.FAILED;
        }


        this.state.player.health =
            this.bot.health ?? 20;


        this.state.player.food =
            this.bot.food ?? 20;


        this.emit(
            Events.Player.HEALTH,
            this.state.player.health
        );


        this.emit(
            Events.Player.FOOD,
            this.state.player.food
        );


        return Result.SUCCESS;

    }


    /**
     * Update Position.
     *
     * @returns {String}
     */
    updatePosition() {

        if (!this.bot?.entity) {
            return Result.FAILED;
        }


        const pos = this.bot.entity.position;


        this.state.player.position = {
            x: pos.x,
            y: pos.y,
            z: pos.z
        };


        this.emit(
            Events.Player.POSITION,
            this.state.player.position
        );


        return Result.SUCCESS;

    }


    /**
     * Lấy Player Entity.
     *
     * @returns {*}
     */
    getEntity() {

        if (!this.bot) {
            return null;
        }

        return this.bot.entity || null;

    }


    /**
     * Lấy vị trí hiện tại.
     *
     * @returns {Object|null}
     */
    getPosition() {

        return this.state.player.position;

    }


    /**
     * Kiểm tra chết.
     *
     * @returns {Boolean}
     */
    isDead() {

        return this.state.player.dead;

    }


    /**
     * Máu hiện tại.
     *
     * @returns {Number}
     */
    health() {

        return this.state.player.health;

    }


    /**
     * Food hiện tại.
     *
     * @returns {Number}
     */
    food() {

        return this.state.player.food;

    }


    /**
     * Reset trạng thái death.
     */
    clearDeath() {

        this.state.player.dead = false;

        return Result.SUCCESS;

    }


    /**
     * Emit Event shortcut.
     */
    emit(event, ...args) {

        if (this.events?.emit) {
            this.events.emit(event, ...args);
        }

    }


    /**
     * Destroy.
     *
     * @returns {Promise<String>}
     */
    async destroy() {

        await super.destroy();

        return Result.SUCCESS;

    }

}


module.exports = PlayerService;