'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const States = require('../core/constants/States');
const Events = require('../core/constants/Events');

/**
 * ============================================================================
 * DungeonService
 * ============================================================================
 *
 * Service quản lý thao tác Dungeon.
 *
 * Trách nhiệm:
 * - Kiểm tra trạng thái Dungeon.
 * - Điều phối thao tác Dungeon cơ bản.
 * - Cập nhật Runtime Dungeon.
 * - Emit Event Dungeon.
 *
 * Không chứa:
 * - Workflow chạy Dungeon.
 * - Combat logic.
 * - Route / Movement.
 * - Recovery.
 *
 * Mode Dungeon sẽ sử dụng Service này.
 *
 * ============================================================================
 */
class DungeonService extends BaseService {

    constructor(ctx) {
        super(ctx);

        this.name = 'DungeonService';

        /**
         * Đang trong Dungeon.
         *
         * @private
         */
        this.running = false;
    }


    /**
     * Initialize Service.
     *
     * @returns {Promise<String>}
     */
    async initialize() {
        await super.initialize();

        this.state.dungeon.state = States.Dungeon.IDLE;
        this.state.dungeon.running = false;
        this.state.dungeon.waitingRespawn = false;

        return Result.SUCCESS;
    }


    /**
     * Destroy Service.
     *
     * @returns {Promise<String>}
     */
    async destroy() {

        this.running = false;

        await super.destroy();

        return Result.SUCCESS;
    }


    /**
     * Bắt đầu Dungeon.
     *
     * Mode gọi hàm này.
     *
     * @returns {Promise<String>}
     */
    async start() {

        if (this.running) {
            return Result.ALREADY_DONE;
        }


        this.running = true;

        this.state.dungeon.running = true;
        this.state.dungeon.state =
            States.Dungeon.ENTERING;


        this.emit(
            Events.Dungeon.START
        );


        this.info('Dungeon started.');

        return Result.SUCCESS;
    }


    /**
     * Dừng Dungeon.
     *
     * @returns {Promise<String>}
     */
    async stop() {

        if (!this.running) {
            return Result.NO_ACTION;
        }


        this.running = false;

        this.state.dungeon.running = false;
        this.state.dungeon.state =
            States.Dungeon.STOPPED;


        this.emit(
            Events.Dungeon.STOP
        );


        this.info('Dungeon stopped.');

        return Result.SUCCESS;
    }


    /**
     * Vào Dungeon.
     *
     * Logic click NPC / party / command
     * sẽ do workflow hoặc service khác xử lý.
     *
     * @returns {Promise<String>}
     */
    async enter() {

        if (!this.running) {
            return Result.MODE_NOT_RUNNING;
        }


        this.state.dungeon.state =
            States.Dungeon.RUNNING;


        this.emit(
            Events.Dungeon.ENTER
        );


        return Result.SUCCESS;
    }


    /**
     * Thoát Dungeon.
     *
     * @returns {Promise<String>}
     */
    async exit() {

        this.state.dungeon.state =
            States.Dungeon.RETURNING;


        this.emit(
            Events.Dungeon.EXIT
        );


        return Result.SUCCESS;
    }


    /**
     * Xử lý Player chết trong Dungeon.
     *
     * Listener sẽ gọi khi nhận event death.
     *
     * @returns {Promise<String>}
     */
    async handleDeath() {

        this.state.dungeon.deaths++;

        this.state.dungeon.waitingRespawn = true;


        this.state.dungeon.state =
            States.Dungeon.WAITING_RESPAWN;


        this.emit(
            Events.Dungeon.DEATH
        );


        return Result.SUCCESS;
    }


    /**
     * Respawn sau khi chết.
     *
     * @returns {Promise<String>}
     */
    async respawn() {

        this.state.dungeon.waitingRespawn = false;


        this.state.dungeon.state =
            States.Dungeon.RESPAWNING;


        this.emit(
            Events.Dungeon.RESPAWN
        );


        return Result.SUCCESS;
    }


    /**
     * Resume Dungeon.
     *
     * Sau Recovery.
     *
     * @returns {Promise<String>}
     */
    async resume() {

        if (!this.running) {
            return Result.MODE_NOT_RUNNING;
        }


        this.state.dungeon.state =
            States.Dungeon.RUNNING;


        this.emit(
            Events.Dungeon.RESUME
        );


        return Result.SUCCESS;
    }


    /**
     * Kiểm tra Dungeon đang chạy.
     *
     * @returns {Boolean}
     */
    isRunning() {
        return this.running;
    }


    /**
     * Lấy trạng thái Dungeon.
     *
     * @returns {String}
     */
    getState() {
        return this.state.dungeon.state;
    }


    /**
     * Emit Event shortcut.
     *
     * BaseService chưa có emit.
     * Dùng EventManager trực tiếp.
     *
     * @private
     */
    emit(event, ...args) {

        const events =
            this.ctx.getManager('events');


        if (events && events.emit) {
            events.emit(
                event,
                ...args
            );
        }
    }

}


module.exports = DungeonService;