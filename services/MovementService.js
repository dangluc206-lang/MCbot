'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const TimeoutError = require('../core/errors/TimeoutError');
const { goals: { GoalNear, GoalFollow } } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
/**
 * ============================================================================
 * MovementService
 * ============================================================================
 *
 * Quản lý di chuyển Bot.
 *
 * Trách nhiệm:
 * - Điều khiển pathfinder.
 * - Di chuyển tới vị trí.
 * - Theo dõi trạng thái movement.
 * - Phát hiện stuck.
 *
 * Không:
 * - Chứa workflow Collector/Mining/Dungeon.
 * - Tự quyết định mục tiêu.
 * - Điều khiển Mode.
 *
 * ============================================================================
 */
class MovementService extends BaseService {

    constructor(ctx) {
        super(ctx);
        this.scheduler = ctx.getManager('scheduler');

        this.name = 'MovementService';

        this.events = ctx.getManager('events');

        /**
         * Pathfinder instance.
         *
         * Có thể null nếu chưa load plugin.
         */
        this.pathfinder = null;

        /**
         * Movement hiện tại.
         *
         * @private
         */
        this.target = null;

        this.moving = false;

        this.startedAt = null;
    }


    /**
     * Initialize.
     *
     * @returns {Promise<String>}
     */
    async initialize() {

        await super.initialize();

        this.loadPathfinder();

        this.bindEvents();

        return Result.SUCCESS;

    }


    /**
     * Load Pathfinder plugin.
     */
    loadPathfinder() {

        if (!this.bot) {
            return;
        }


        if (this.bot.pathfinder) {

            this.pathfinder =
                this.bot.pathfinder;

        }

    }


    /**
     * Bind movement events.
     */
    bindEvents() {

        if (!this.bot) {
            return;
        }


        this.bind(this.bot, 'goal_reached', () => {

            this.moving = false;


            this.emit(
                Events.Movement.ARRIVED,
                this.target
            );


            this.target = null;

        });


        this.bind(this.bot, 'path_update', result => {

            if (
                result &&
                result.status === 'noPath'
            ) {

                const failedTarget = this.target;

                this.moving = false;
                this.target = null;

                this.emit(
                    Events.Movement.FAILED,
                    failedTarget,
                    result
                );

            }

        });

    }
    preparePathfinder() {

        if (!this.bot?.pathfinder) {
            return false;
        }

        if (this._movementPrepared) {
            return true;
        }
 
        const mcData = require('minecraft-data')(this.bot.version);

        this.bot.pathfinder.setMovements(
            new (require('mineflayer-pathfinder').Movements)(
                this.bot,
                mcData
            )
        );

        this._movementPrepared = true;

        return true;
    }

    /**
     * Di chuyển tới vị trí.
     *
     * @param {Object} position
     *
     * @returns {Promise<String>}
     */
    async moveTo(position, range = 1) {

        if (!this.bot) {
            return Result.FAILED;
        }


        if (!position) {
            return Result.MOVEMENT_FAILED;
        }


        if (!this.pathfinder) {

            this.loadPathfinder();

        }


        if (!this.pathfinder) {

            return Result.NO_PATH;

        }


        try {

            this.target = position;

            this.moving = true;

            this.startedAt = Date.now();


            this.emit(
                Events.Movement.START,
                position
            );
            this.preparePathfinder();
            this.pathfinder =
                this.bot.pathfinder;
            if(!this.pathfinder) {
                return Result.NO_PATH;
            }
            this.pathfinder.setGoal(
                new GoalNear(
                    position.x,
                    position.y,
                    position.z,
                    range
                )
            );


            return Result.SUCCESS;

        }
        catch (error) {

            this.error(error);

            return Result.MOVEMENT_FAILED;

        }

    }


    /**
     * Dừng di chuyển.
     *
     * @returns {String}
     */
    stop() {

        try {

            if (this.pathfinder) {

                this.pathfinder.setGoal(null);

            }


            this.moving = false;

            this.target = null;


            this.emit(
                Events.Movement.STOP
            );


            return Result.SUCCESS;

        }
        catch (error) {

            this.error(error);

            return Result.MOVEMENT_FAILED;

        }

    }

    async goto(position, range = 1, timeout = 60000) {
        const started = await this.moveTo(position, range);
        if (started !== Result.SUCCESS) return started;
        const safeTimeout = Math.min(Math.max(Number(timeout) || 60000, 1000), 300000);
        const taskId = `movement.goto.${Date.now()}`;
        return new Promise(resolve => {
            let settled = false;
            const finish = result => {
                if (settled) return;
                settled = true;
                this.events.off(Events.Movement.ARRIVED, onArrived);
                this.events.off(Events.Movement.FAILED, onFailed);
                this.scheduler.cancel(taskId);
                resolve(result);
            };
            const onArrived = () => finish(Result.SUCCESS);
            const onFailed = () => finish(Result.NO_PATH);
            this.events.on(Events.Movement.ARRIVED, onArrived);
            this.events.on(Events.Movement.FAILED, onFailed);
            this.scheduler.timeout(taskId, () => {
                this.stop();
                finish(Result.TIMEOUT);
            }, safeTimeout);
        });
    }

    async follow(playerName, range = 2) {
        if (!this.pathfinder) this.loadPathfinder();
        const entity = this.bot?.players?.[playerName]?.entity;
        if (!entity || !this.pathfinder) return Result.FAILED;
        this.moving = true;
        this.target = { playerName, range };
        this.startedAt = Date.now();
        this.preparePathfinder();
        this.pathfinder.setGoal(new GoalFollow(entity, range), true);
        this.emit(Events.Movement.START, this.target);
        return Result.SUCCESS;
    }

    async lookAt(position) {
        if (!position || ![position.x, position.y, position.z].every(Number.isFinite) || !this.bot?.lookAt) return Result.FAILED;
        await this.bot.lookAt(new Vec3(position.x, position.y, position.z), true);
        return Result.SUCCESS;
    }

    jump(duration = 250) {
        if (!this.bot?.setControlState) return Result.FAILED;
        const safeDuration = Math.min(Math.max(Number(duration) || 250, 50), 1000);
        this.bot.setControlState('jump', true);
        this.scheduler.timeout('movement.manualJump', () => {
            this.bot.setControlState('jump', false);
        }, safeDuration);
        return Result.SUCCESS;
    }


    /**
     * Kiểm tra đang di chuyển.
     *
     * @returns {Boolean}
     */
    isMoving() {

        return this.moving;

    }


    /**
     * Lấy target.
     *
     * @returns {Object|null}
     */
    getTarget() {

        return this.target;

    }


    /**
     * Khoảng cách tới target.
     *
     * @returns {Number|null}
     */
    distanceToTarget() {

        if (
            !this.bot?.entity ||
            !this.target
        ) {
            return null;
        }


        const pos =
            this.bot.entity.position;


        return Math.sqrt(

            Math.pow(
                pos.x - this.target.x,
                2
            )

            +

            Math.pow(
                pos.y - this.target.y,
                2
            )

            +

            Math.pow(
                pos.z - this.target.z,
                2
            )

        );

    }


    /**
     * Kiểm tra stuck.
     *
     * @param {Number} timeout
     *
     * @returns {Boolean}
     */
    isStuck(timeout = 10000) {

        if (!this.moving) {
            return false;
        }


        return (
            Date.now() - this.startedAt
        ) > timeout;

    }


    /**
     * Emit Event.
     */
    emit(event, ...args) {

        if (this.events?.emit) {

            this.events.emit(
                event,
                ...args
            );

        }

    }


    /**
     * Destroy.
     *
     * @returns {Promise<String>}
     */
    async destroy() {

        this.stop();

        await super.destroy();

        return Result.SUCCESS;

    }

}


module.exports = MovementService;
