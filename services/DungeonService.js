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
        this.entering = false;
        this.lastAttackAt = 0;
        this.lastEatAt = 0;
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

        if (this.entering) {
            return Result.BUSY;
        }

        const settings = this.config.dungeon || {};
        const gui = this.service('gui');
        const command = settings.command || '/d';
        const slot = settings.entrySlot ?? 12;

        try {
            this.entering = true;
            this.state.dungeon.state = States.Dungeon.ENTERING;
            this.info(`Đang gửi ${command}.`);
            this.bot.chat(command);

            const window = await this.waitForWindow(gui, settings.guiTimeoutMs ?? 10000);
            this.info(`GUI Dungeon đã mở; click slot ${slot}.`);
            const clicked = await gui.click(slot);
            if (clicked !== Result.SUCCESS) {
                throw new Error(`Không click được slot Dungeon ${slot}: ${clicked}`);
            }

            const teleportDelay = settings.teleportDelayMs ?? 5000;
            this.info(`Đã chọn Dungeon; chờ ${teleportDelay} ms để server teleport.`);
            await this.delay(teleportDelay);

            this.state.dungeon.state = States.Dungeon.RUNNING;

            this.emit(Events.Dungeon.ENTER);
            this.success('Đã vào Dungeon; auto ăn và auto đánh được bật.');

            return Result.SUCCESS;
        }
        catch (error) {
            this.state.dungeon.state = States.Dungeon.IDLE;
            this.error(`Không vào được Dungeon: ${error.message}`);
            return Result.FAILED;
        }
        finally {
            this.entering = false;
        }
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

    async tick() {
        if (!this.running || this.state.dungeon.state !== States.Dungeon.RUNNING) {
            return Result.NO_ACTION;
        }

        await this.autoEat();
        return this.autoAttack();
    }

    async autoEat() {
        const settings = this.config.dungeon || {};
        const healthThreshold = settings.eatHealthBelow ?? 12;
        const foodThreshold = settings.eatFoodBelow ?? 12;
        const needsFood = (this.bot.health ?? 20) <= healthThreshold || (this.bot.food ?? 20) <= foodThreshold;

        if (!needsFood || this.bot.usingHeldItem || Date.now() - this.lastEatAt < 1500) {
            return Result.NO_ACTION;
        }

        const foodNames = settings.foodItems || [
            'golden_apple', 'enchanted_golden_apple', 'cooked_beef', 'cooked_porkchop',
            'cooked_chicken', 'cooked_mutton', 'cooked_rabbit', 'bread', 'baked_potato', 'apple'
        ];
        const food = this.bot.inventory?.items()?.find(item => foodNames.includes(item.name));
        if (!food || typeof this.bot.equip !== 'function' || typeof this.bot.consume !== 'function') {
            return Result.NO_FOOD;
        }

        try {
            this.lastEatAt = Date.now();
            await this.bot.equip(food, 'hand');
            await this.bot.consume();
            this.info(`Đã ăn ${food.name}.`);
            return Result.SUCCESS;
        }
        catch (error) {
            this.warn(`Không thể ăn: ${error.message}`);
            return Result.FAILED;
        }
    }

    async autoAttack() {
        const settings = this.config.dungeon || {};
        const attackInterval = settings.attackIntervalMs ?? 600;
        if (Date.now() - this.lastAttackAt < attackInterval || this.bot.usingHeldItem || !this.bot.entity) {
            return Result.NO_ACTION;
        }

        const range = settings.attackRange ?? 3.2;
        const target = this.bot.nearestEntity?.(entity =>
            entity !== this.bot.entity &&
            entity.type === 'mob' &&
            entity.position &&
            entity.position.distanceTo(this.bot.entity.position) <= range
        );

        if (!target || typeof this.bot.attack !== 'function') {
            this.state.dungeon.state = States.Dungeon.RUNNING;
            return Result.NO_ACTION;
        }

        try {
            this.state.dungeon.state = States.Dungeon.FIGHTING;
            this.lastAttackAt = Date.now();
            if (typeof this.bot.lookAt === 'function') {
                await this.bot.lookAt(target.position.offset(0, (target.height || 1) / 2, 0), true);
            }
            this.bot.attack(target);
            return Result.SUCCESS;
        }
        catch (error) {
            this.warn(`Không thể đánh mob: ${error.message}`);
            return Result.FAILED;
        }
    }

    waitForWindow(gui, timeout) {
        if (gui.window()) return Promise.resolve(gui.window());

        return new Promise((resolve, reject) => {
            const handler = window => {
                clearTimeout(timer);
                this.ctx.getManager('events').off(Events.GUI.OPEN, handler);
                resolve(window);
            };
            const timer = setTimeout(() => {
                this.ctx.getManager('events').off(Events.GUI.OPEN, handler);
                reject(new Error(`Dungeon GUI timed out after ${timeout} ms.`));
            }, timeout);
            this.ctx.getManager('events').on(Events.GUI.OPEN, handler);
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
