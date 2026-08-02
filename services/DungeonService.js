'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const States = require('../core/constants/States');
const Events = require('../core/constants/Events');
const DungeonScreen = require('../screens/DungeonScreen');

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
        this.events = ctx.getManager('events');

        /**
         * Đang trong Dungeon.
         *
         * @private
         */
        this.running = false;
        this.entering = false;
        this.lastAttackAt = 0;
        this.lastEatAt = 0;
        this.lastMoveAt = 0;
        this.lastWeaponWarningAt = 0;
        this.lastCombatLogAt = 0;
        this.lastInventoryLogAt = 0;
        this.reentryTask = null;
        this.reentryTimer = null;
        this.spawnCheckTimer = null;
        this.storing = false;
        this.ignoreTeleportUntil = 0;
        this.needsReentryAfterDisconnect = false;
        this.needsReentryAfterSkyBlockLeave = false;
        this.autoFarmActive = false;
        this.lastKnownPosition = null;
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
        this.rememberPosition();
        this.bind(this.bot, 'kicked', () => this.handleDisconnect());
        this.bind(this.bot, 'end', () => this.handleDisconnect());
        this.bind(this.bot, 'move', () => this.rememberPosition());
        this.bind(this.bot, 'forcedMove', () => this.checkForSpawnReturn());
        this.bind(this.bot, 'messagestr', message => this.checkSpawnMessage(message));
        this.bind(this.events, Events.SkyBlock.LEAVE, () => this.handleSkyBlockLeave());
        this.bind(this.events, Events.SkyBlock.JOINED, () => this.tryScheduleReentry());

        return Result.SUCCESS;
    }


    /**
     * Destroy Service.
     *
     * @returns {Promise<String>}
     */
    async destroy() {

        this.running = false;
        this.ignoreTeleportUntil = 0;
        this.needsReentryAfterSkyBlockLeave = false;
        this.autoFarmActive = false;
        this.lastKnownPosition = null;
        if (this.reentryTimer) clearTimeout(this.reentryTimer);
        if (this.spawnCheckTimer) clearTimeout(this.spawnCheckTimer);
        this.reentryTimer = null;
        this.spawnCheckTimer = null;
        this.reentryTask = null;

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
        this.rememberPosition();

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
        this.ignoreTeleportUntil = 0;
        this.needsReentryAfterSkyBlockLeave = false;
        this.autoFarmActive = false;
        this.lastKnownPosition = null;
        if (this.reentryTimer) clearTimeout(this.reentryTimer);
        if (this.spawnCheckTimer) clearTimeout(this.spawnCheckTimer);
        this.reentryTimer = null;
        this.spawnCheckTimer = null;
        this.reentryTask = null;

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
        const slot = settings.entrySlot ?? 12;
        const acquired = gui?.acquire?.('dungeon');
        if (acquired && acquired !== Result.SUCCESS) return acquired;

        try {
            this.entering = true;
            this.state.dungeon.state = States.Dungeon.ENTERING;
            if (this.autoFarmActive) {
                this.info('AutoFarm vẫn đang bật; bỏ qua /autofarm và vào lại Dungeon.');
            }
            else {
                await this.enableAutoFarm(gui, settings);
            }

            this.info('Đang gửi lệnh mở Dungeon.');
            const serverCommands = this.service('serverCommands');
            const sent = serverCommands?.openDungeon
                ? await serverCommands.openDungeon()
                : Result.FAILED;
            if (sent !== Result.SUCCESS) throw new Error(`Không thể gửi lệnh Dungeon: ${sent}.`);

            const window = await this.waitForWindow(gui, settings.guiTimeoutMs ?? 10000);
            await this.waitForSlot(gui, slot, settings.slotReadyTimeoutMs ?? 3000);
            this.info(`GUI Dungeon đã mở; click slot ${slot}.`);
            const clicked = await this._screen(gui).clickEntry();
            if (clicked !== Result.SUCCESS) {
                throw new Error(`Không click được slot Dungeon ${slot}: ${clicked}`);
            }

            const teleportDelay = settings.teleportDelayMs ?? 5000;
            this.info(`Đã chọn Dungeon; chờ ${teleportDelay} ms để server teleport.`);
            this.ignoreTeleportUntil = Date.now() + teleportDelay + 10000;
            await this.delay(teleportDelay);

            await this.equipWeapon();
            await this.equipFoodOffhand();
            this.state.dungeon.state = States.Dungeon.RUNNING;

            this.emit(Events.Dungeon.ENTER);
            this.success('Đã vào Dungeon; kiếm tay phải, thức ăn tay trái và AutoFarm đã bật.');

            return Result.SUCCESS;
        }
        catch (error) {
            this.state.dungeon.state = States.Dungeon.IDLE;
            this.error(`Không vào được Dungeon: ${error.message}`);
            return Result.FAILED;
        }
        finally {
            this.entering = false;
            if (acquired === Result.SUCCESS) gui?.release?.('dungeon');
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

        await this.equipWeapon();
        await this.equipFoodOffhand();
        await this.autoEat();
        if (this.service('inventory').isFull()) {
            return this.storeInventory();
        }

        return Result.SUCCESS;
    }

    async pause() {
        if (!this.running) return Result.MODE_NOT_RUNNING;
        this.service('movement').stop();
        this.state.dungeon.state = States.Dungeon.PAUSED;
        this.info('Đã tạm dừng tác vụ Dungeon cục bộ.');
        return Result.SUCCESS;
    }

    async enableAutoFarm(gui, settings) {
        const previousWindow = gui.window();
        const slot = settings.autofarmSlot ?? 21;

        this.info('Đang gửi lệnh mở AutoFarm.');
        const serverCommands = this.service('serverCommands');
        const sent = serverCommands?.openAutofarm
            ? await serverCommands.openAutofarm()
            : Result.FAILED;
        if (sent !== Result.SUCCESS) throw new Error(`Không thể gửi lệnh AutoFarm: ${sent}.`);
        await this.delay(settings.autofarmMenuDelayMs ?? 1000);
        await this.waitForWindow(gui, settings.guiTimeoutMs ?? 10000, previousWindow);
        await this.waitForSlot(gui, slot, settings.slotReadyTimeoutMs ?? 3000);
        this.info(`GUI AutoFarm đã mở; click slot ${slot}.`);
        const clicked = await this._screen(gui).clickAutofarm();
        if (clicked !== Result.SUCCESS) {
            throw new Error(`Không click được slot AutoFarm ${slot}: ${clicked}`);
        }
        // Server có thể gửi cập nhật GUI ngay sau cú click; đợi ngắn rồi mới đóng
        // để cửa sổ AutoFarm không bị giữ lại trên client.
        await this.delay(settings.autofarmCloseDelayMs ?? 1000);
        await gui.close();
        this.autoFarmActive = true;
        this.info('Đã đóng GUI AutoFarm; bot đang treo và chỉ tự ăn.');
    }

    handleDisconnect() {
        if (!this.running) return;
        this.autoFarmActive = false;
        this.needsReentryAfterDisconnect = true;
        this.info('Mất kết nối; AutoFarm đã tắt và sẽ bật lại sau khi reconnect vào SkyBlock.');
    }

    handleSkyBlockLeave() {
        if (!this.running) return;
        // This is not a socket kick, so the server-side AutoFarm selection is
        // preserved. Only wait for SkyBlock recovery, then enter /d again.
        this.needsReentryAfterSkyBlockLeave = true;
        this.state.dungeon.state = States.Dungeon.WAITING_RESPAWN;
        this.info('Đã rời SkyBlock khi Dungeon đang chạy; sẽ vào lại /d sau khi SkyBlock hồi phục.');
    }

    tryScheduleReentry() {
        if ((!this.needsReentryAfterDisconnect && !this.needsReentryAfterSkyBlockLeave)
            || !this.running || !this.state.skyblock.joined) return;
        this.needsReentryAfterDisconnect = false;
        this.needsReentryAfterSkyBlockLeave = false;
        this.scheduleReentry();
    }

    isReentryPending() {
        return Boolean(this.reentryTask || this.needsReentryAfterDisconnect || this.needsReentryAfterSkyBlockLeave);
    }

    scheduleReentry(wait = (this.config.dungeon || {}).reentryDelayMs ?? 300000, reason = 'Đã reconnect vào SkyBlock') {
        if (this.reentryTask) return;

        this.state.dungeon.state = States.Dungeon.WAITING_RESPAWN;
        this.info(`${reason}; chờ ${wait / 1000} giây để vào lại Dungeon.`);
        this.reentryTask = new Promise(resolve => {
            this.reentryTimer = setTimeout(() => {
                this.reentryTimer = null;
                resolve();
            }, wait);
        })
            .then(async () => {
                if (!this.running || !this.state.skyblock.joined) return Result.CANCELLED;
                return this.enter();
            })
            .finally(() => { this.reentryTask = null; });
    }

    checkSpawnMessage(message) {
        if (!this.running || this.entering || typeof message !== 'string') return;
        const patterns = (this.config.dungeon || {}).spawnPatterns || ['spawn'];
        const normalized = message.toLocaleLowerCase();
        if (patterns.some(pattern => normalized.includes(String(pattern).toLocaleLowerCase()))) {
            this.scheduleSpawnReentry(`Server message: ${message}`);
        }
    }

    checkForSpawnReturn() {
        if (!this.running || this.entering || this.spawnCheckTimer) return;
        const forcedMoveDistance = this.distanceFromLastKnownPosition();
        if (Date.now() < this.ignoreTeleportUntil) {
            this.rememberPosition();
            return;
        }
        const delay = (this.config.dungeon || {}).spawnCheckDelayMs ?? 1000;
        this.spawnCheckTimer = setTimeout(() => {
            this.spawnCheckTimer = null;
            if (this.isAtConfiguredSpawn()) {
                this.scheduleSpawnReentry('Bot bị server teleport về vị trí /spawn.');
            } else if ((this.config.dungeon || {}).reenterOnUnexpectedForcedMove !== false
                && forcedMoveDistance >= this.unexpectedTeleportMinDistance()) {
                this.scheduleSpawnReentry(`Bot bị server teleport ${forcedMoveDistance.toFixed(1)} block ra khỏi Dungeon.`);
            }
            this.rememberPosition();
        }, delay);
    }

    rememberPosition() {
        const position = this.bot.entity?.position;
        this.lastKnownPosition = position?.clone?.() || (position
            ? { x: position.x, y: position.y, z: position.z }
            : null);
    }

    distanceFromLastKnownPosition() {
        const before = this.lastKnownPosition;
        const current = this.bot.entity?.position;
        if (!before || !current) return 0;
        return Math.hypot(current.x - before.x, current.y - before.y, current.z - before.z);
    }

    unexpectedTeleportMinDistance() {
        const value = Number((this.config.dungeon || {}).unexpectedTeleportMinDistance);
        return Number.isFinite(value) ? Math.min(Math.max(value, 1), 128) : 12;
    }

    isAtConfiguredSpawn() {
        const settings = this.config.dungeon || {};
        const spawn = settings.spawnPosition;
        const position = this.bot.entity?.position;
        if (!spawn || !position) return false;
        const radius = settings.spawnRadius ?? 8;
        const point = Array.isArray(spawn)
            ? { x: spawn[0], y: spawn[1], z: spawn[2] }
            : spawn;
        return [point.x, point.y, point.z].every(Number.isFinite)
            && Math.hypot(position.x - point.x, position.y - point.y, position.z - point.z) <= radius;
    }

    scheduleSpawnReentry(reason) {
        if (this.reentryTask || !this.running || !this.state.skyblock.joined) return;
        const wait = (this.config.dungeon || {}).spawnReentryDelayMs ?? 2000;
        this.warn(`${reason} Bot sẽ vào lại /d; AutoFarm được giữ nguyên.`);
        this.scheduleReentry(wait, 'Đã xác nhận bot ở /spawn');
    }

    async storeInventory() {
        if (this.storing) return Result.BUSY;

        const gui = this.service('gui');
        const settings = this.config.dungeon || {};
        const acquired = gui?.acquire?.('dungeon-store');
        if (acquired && acquired !== Result.SUCCESS) return acquired;
        const previousWindow = gui.window();
        try {
            this.storing = true;
            this.info('Inventory đầy; đang gửi /pv 2.');
            const command = settings.storageCommand || '/pv 2';
            const serverCommands = this.service('serverCommands');
            const sent = serverCommands?.openDungeonStorage
                ? await serverCommands.openDungeonStorage()
                : Result.FAILED;
            if (sent !== Result.SUCCESS) throw new Error(`Không thể gửi ${command}: ${sent}.`);
            const window = await this.waitForWindow(gui, settings.storageGuiTimeoutMs ?? 10000, previousWindow);

            let moved = 0;
            for (let source = window.inventoryStart; source < window.inventoryEnd; source += 1) {
                if (!window.slots[source]) continue;
                const destination = window.firstEmptySlotRange(0, window.inventoryStart);
                if (destination === null) break;
                await this.bot.moveSlotItem(source, destination);
                moved += 1;
            }

            await gui.close();
            this.info(`Đã chuyển ${moved} stack vào /pv 2 và đóng GUI.`);
            return Result.SUCCESS;
        }
        catch (error) {
            this.warn(`Không thể cất đồ vào /pv 2: ${error.message}`);
            return Result.FAILED;
        }
        finally {
            this.storing = false;
            if (acquired === Result.SUCCESS) gui?.release?.('dungeon-store');
        }
    }

    async autoEat() {
        const settings = this.config.dungeon || {};
        const healthThreshold = settings.eatHealthBelow ?? 12;
        const foodThreshold = settings.eatFoodBelow ?? 12;
        const needsFood = (this.bot.health ?? 20) <= healthThreshold || (this.bot.food ?? 20) <= foodThreshold;

        if (!needsFood || this.bot.usingHeldItem || Date.now() - this.lastEatAt < 1500) {
            return Result.NO_ACTION;
        }

        const food = this.offHandItem();
        if (!food || typeof this.bot.activateItem !== 'function') {
            return Result.NO_FOOD;
        }

        try {
            this.lastEatAt = Date.now();
            this.bot.activateItem(true);
            this.debug(`Đang ăn ${food.name} từ tay trái.`);
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
        if (this.bot.usingHeldItem || !this.bot.entity) {
            return Result.NO_ACTION;
        }

        const range = settings.attackRange ?? 3.2;
        const target = this.bot.nearestEntity?.(entity => this.isCombatTarget(entity));

        const weaponResult = await this.equipWeapon();
        if (weaponResult !== Result.SUCCESS) return weaponResult;

        if (!target || typeof this.bot.attack !== 'function') {
            this.state.dungeon.state = States.Dungeon.RUNNING;
            this.logNearbyEntities();
            return Result.NO_ACTION;
        }

        try {
            this.state.dungeon.state = States.Dungeon.FIGHTING;
            const distance = target.position.distanceTo(this.bot.entity.position);
            if (distance > range) {
                if (Date.now() - this.lastMoveAt >= 500) {
                    this.lastMoveAt = Date.now();
                    this.info(`Đang tới mục tiêu ${this.entityLabel(target)} (${distance.toFixed(1)} block).`);
                    await this.service('movement').moveTo(target.position);
                }
                return Result.PENDING;
            }

            if (Date.now() - this.lastAttackAt < attackInterval) {
                return Result.NO_ACTION;
            }

            this.service('movement').stop();
            this.lastAttackAt = Date.now();
            if (typeof this.bot.lookAt === 'function') {
                await this.bot.lookAt(target.position.offset(0, (target.height || 1) / 2, 0), true);
            }
            this.bot.attack(target);
            if (Date.now() - this.lastCombatLogAt >= 2000) {
                this.lastCombatLogAt = Date.now();
                this.info(`Đang đánh ${this.entityLabel(target)}.`);
            }
            return Result.SUCCESS;
        }
        catch (error) {
            this.warn(`Không thể đánh mob: ${error.message}`);
            return Result.FAILED;
        }
    }

    async equipWeapon() {
        const sword = this.bot.inventory?.items()
            ?.filter(item => this.isWeapon(item))
            .sort((a, b) => this.weaponScore(b.name) - this.weaponScore(a.name))[0];

        if (!sword) {
            if (Date.now() - this.lastWeaponWarningAt >= 5000) {
                this.lastWeaponWarningAt = Date.now();
                this.warn('Không tìm thấy kiếm trong inventory.');
                this.logCombatInventory();
            }
            return Result.NO_ACTION;
        }

        if (this.bot.heldItem?.type === sword.type) return Result.SUCCESS;
        if (typeof this.bot.equip !== 'function') return Result.FAILED;

        try {
            await this.bot.equip(sword, 'hand');
            this.info(`Đã cầm kiếm ${sword.name}.`);
            return Result.SUCCESS;
        }
        catch (error) {
            this.warn(`Không thể cầm kiếm: ${error.message}`);
            return Result.FAILED;
        }
    }

    async equipFoodOffhand() {
        const existing = this.offHandItem();
        if (existing && this.isFood(existing)) return Result.SUCCESS;

        const food = this.bot.inventory?.items()?.find(item => this.isFood(item));
        if (!food || typeof this.bot.equip !== 'function') return Result.NO_FOOD;

        try {
            await this.bot.equip(food, 'off-hand');
            this.info(`Đã đặt ${food.name} ở tay trái.`);
            return Result.SUCCESS;
        }
        catch (error) {
            this.warn(`Không thể đặt thức ăn ở tay trái: ${error.message}`);
            return Result.FAILED;
        }
    }

    offHandItem() {
        return this.bot.inventory?.slots?.[45] || null;
    }

    isFood(item) {
        const foodNames = (this.config.dungeon || {}).foodItems || [
            'golden_apple', 'enchanted_golden_apple', 'cooked_beef', 'cooked_porkchop',
            'cooked_chicken', 'cooked_mutton', 'cooked_rabbit', 'bread', 'baked_potato', 'apple'
        ];
        return Boolean(item && foodNames.includes(item.name));
    }

    weaponScore(name) {
        const order = ['wooden', 'golden', 'stone', 'iron', 'diamond', 'netherite'];
        return order.findIndex(material => name.startsWith(material)) + 1;
    }

    isWeapon(item) {
        if (!item) return false;
        const settings = this.config.dungeon || {};
        const explicit = settings.weaponItems || [];
        if (explicit.includes(item.name)) return true;

        const text = `${item.name || ''} ${item.displayName || ''}`.toLowerCase();
        return text.includes('sword') || text.includes('kiếm');
    }

    logCombatInventory() {
        if (Date.now() - this.lastInventoryLogAt < 5000) return;
        this.lastInventoryLogAt = Date.now();
        const items = this.bot.inventory?.items?.() || [];
        const detail = items
            .map(item => `${item.name}${item.displayName ? ` (${item.displayName})` : ''}`)
            .join(', ');
        this.info(`Combat inventory: ${detail || 'empty'}.`);
    }

    isCombatTarget(entity) {
        const searchRange = (this.config.dungeon || {}).targetSearchRange ?? 192;
        return Boolean(
            entity &&
            entity !== this.bot.entity &&
            entity.position &&
            !this.isRealPlayer(entity) &&
            !['object', 'orb', 'global', 'other'].includes(entity.type) &&
            entity.position.distanceTo(this.bot.entity.position) <= searchRange
        );
    }

    isRealPlayer(entity) {
        if (entity.type !== 'player') return false;
        if (!entity.username || entity.username === this.bot.username) return false;
        return this.bot.players?.[entity.username]?.entity === entity;
    }

    entityLabel(entity) {
        return entity.displayName?.toString?.() || entity.username || entity.name || `${entity.type}#${entity.id}`;
    }

    logNearbyEntities() {
        if (Date.now() - this.lastCombatLogAt < 5000 || !this.bot.entity) return;
        this.lastCombatLogAt = Date.now();
        const nearby = Object.values(this.bot.entities || {})
            .filter(entity => entity !== this.bot.entity && entity.position)
            .sort((a, b) => a.position.distanceTo(this.bot.entity.position) - b.position.distanceTo(this.bot.entity.position))
            .map(entity => `${this.entityLabel(entity)} [type=${entity.type ?? 'custom'}, name=${entity.name ?? '-'}, mob=${entity.mobType ?? '-'}, ${entity.position.distanceTo(this.bot.entity.position).toFixed(1)}m]`)
            .slice(0, 10);
        this.info(`Chưa có mục tiêu; entity gần: ${nearby.join(', ') || 'none'}.`);
    }

    _screen(gui) {
        return new DungeonScreen(gui, { config: this.config, events: this.events });
    }

    waitForWindow(gui, timeout, previousWindow = null) {
        if (gui.window() && gui.window() !== previousWindow) return Promise.resolve(gui.window());

        return new Promise((resolve, reject) => {
            const handler = window => {
                if (window === previousWindow) return;
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

    async waitForSlot(gui, slot, timeout) {
        const startedAt = Date.now();
        while (Date.now() - startedAt <= timeout) {
            const item = gui.window()?.slots?.[slot];
            if (item?.type != null || item?.id != null) return item;
            await this.delay(50);
        }

        const title = gui.window()?.title ?? '(không có title)';
        throw new Error(`GUI "${title}" không có item ở slot ${slot} sau ${timeout} ms.`);
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
