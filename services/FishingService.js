'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const { Vec3 } = require('vec3');

class FishingService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'FishingService';
        this.running = false;
        this.starting = false;
        this.paused = false;
        this.casting = false;
        this.fishingTask = null;
        this.water = null;
        this.rod = null;
        this.afkSlot = null;
        this.directFallbackActive = false;
    }

    async start() {
        if (this.running) return Result.ALREADY_DONE;
        this.running = true;
        this.starting = true;
        this.paused = false;
        this.state.fishing.running = true;
        this.state.fishing.state = 'OPENING_AFK';

        try {
            const settings = this.config.fishing || {};
            const gui = this.service('gui');
            const previousWindow = gui.window();
            const command = settings.command || '/afk';
            this.info(`Đang gửi ${command}.`);
            this.bot.chat(command);
            const afkWindow = await this.waitForWindow(gui, previousWindow, settings.guiTimeoutMs ?? 10000);
            await new Promise(resolve => setTimeout(resolve, settings.afkMenuDelayMs ?? 1000));

            const slots = settings.afkSlots || [11, 13, 15];
            let teleported = false;
            for (const slot of slots) {
                this.info(`Đang thử slot AFK ${slot}.`);
                const beforePosition = this.bot.entity?.position?.clone?.() || null;
                const clicked = await gui.click(slot);
                if (clicked !== Result.SUCCESS) continue;
                teleported = await this.waitForTeleport(beforePosition, settings.slotTeleportTimeoutMs ?? 5000);
                if (teleported) {
                    this.afkSlot = slot;
                    break;
                }
                this.warn(`Slot AFK ${slot} không teleport được (có thể đã đầy); thử slot tiếp theo.`);
            }
            if (!teleported) throw new Error(`Không thể vào AFK qua các slot: ${slots.join(', ')}.`);

            await this.prepareFishing();
            this.success('Đã vào khu AFK, cầm cần câu và đang câu cá.');
            return Result.SUCCESS;
        }
        catch (error) {
            this.service('movement').stop();
            this.running = false;
            this.state.fishing.running = false;
            this.state.fishing.state = 'IDLE';
            this.error(`Không thể bắt đầu câu cá: ${error.message}`);
            return Result.FAILED;
        }
        finally {
            this.starting = false;
        }
    }

    async stop() {
        this.running = false;
        this.starting = false;
        this.paused = false;
        this.casting = false;
        this.fishingTask = null;
        this.water = null;
        this.rod = null;
        this.afkSlot = null;
        this.releaseDirectWalk();
        this.state.fishing.running = false;
        this.state.fishing.state = 'STOPPED';
        this.service('movement').stop();
        return Result.SUCCESS;
    }

    async tick() {
        if (!this.running) return Result.NO_ACTION;
        if (this.starting) return Result.PENDING;
        if (this.paused) return Result.NO_ACTION;
        if (!this.water) return Result.FAILED;

        if (!this.isAtFishingTarget()) {
            this.state.fishing.state = 'MOVING_TO_WATER';
            return Result.PENDING;
        }

        if (!this.casting) this.cast();
        return Result.SUCCESS;
    }

    async pause() {
        if (!this.running) return Result.MODE_NOT_RUNNING;
        this.paused = true;
        this.releaseDirectWalk();
        this.service('movement').stop();
        if (this.casting && typeof this.bot.activateItem === 'function') {
            this.bot.activateItem();
        }
        this.casting = false;
        this.state.fishing.state = 'PAUSED';
        this.info('Đã tạm dừng câu cá và rút cần câu.');
        return Result.SUCCESS;
    }

    async resume() {
        if (!this.running) return Result.MODE_NOT_RUNNING;
        this.paused = false;
        this.state.fishing.state = 'MOVING_TO_WATER';
        if (this.water) {
            this.prepareNoDigMovement();
            const settings = this.config.fishing || {};
            if (settings.forceDirectSprintJump) {
                this.directFallbackActive = true;
                await this.walkDirectlyToTarget(this.water.position, settings);
            }
            else {
                await this.service('movement').moveTo(
                    this.water.position,
                    settings.targetReachDistance ?? 1
                );
            }
        }
        this.info('Đã tiếp tục câu cá.');
        return Result.SUCCESS;
    }

    async prepareFishing() {
        const settings = this.config.fishing || {};
        const rod = this.findRod(settings);
        if (!rod) throw new Error('Không tìm thấy cần câu (fishing_rod) trong inventory.');
        if (typeof this.bot.equip !== 'function') throw new Error('Mineflayer không hỗ trợ equip cần câu.');

        this.rod = rod;
        await this.equipRod();
        this.water = this.slotTarget(settings, this.afkSlot);
        if (!this.water) {
            throw new Error(`Chưa cấu hình tọa độ câu cho slot AFK ${this.afkSlot}.`);
        }

        this.state.fishing.state = 'MOVING_TO_WATER';
        this.info(`Slot AFK ${this.afkSlot}; đi tới điểm câu ${this.water.position.x}, ${this.water.position.y}, ${this.water.position.z}.`);
        this.prepareNoDigMovement();
        if (settings.forceDirectSprintJump) {
            this.info('Chạy nhảy trực tiếp qua dải đất nung tới điểm câu.');
            this.service('movement').stop();
            this.directFallbackActive = true;
            await this.walkDirectlyToTarget(this.water.position, settings);
            return Result.SUCCESS;
        }
        const moved = await this.service('movement').moveTo(
            this.water.position,
            settings.targetReachDistance ?? 1
        );
        if (moved !== Result.SUCCESS) throw new Error(`Không thể đi tới nước: ${moved}`);
        await this.waitForArrival(this.water.position, settings.moveTimeoutMs ?? 90000);
        return Result.SUCCESS;
    }

    isAtFishingTarget() {
        const position = this.bot.entity?.position;
        const target = this.water?.position;
        const reach = (this.config.fishing || {}).targetReachDistance ?? 1;
        return Boolean(position && target && position.distanceTo(target) <= reach);
    }

    waitForArrival(target, timeout) {
        if (this.isAtFishingTarget()) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const events = this.ctx.getManager('events');
            const settings = this.config.fishing || {};
            const progressTimeout = settings.moveProgressTimeoutMs ?? 8000;
            const logInterval = settings.moveLogIntervalMs ?? 3000;
            const retryLimit = settings.moveRetryCount ?? 2;
            let retries = 0;
            let lastDistance = Infinity;
            let lastProgressAt = Date.now();
            let lastLogAt = 0;

            const sameTarget = candidate => candidate
                && candidate.x === target.x
                && candidate.y === target.y
                && candidate.z === target.z;
            const cleanup = () => {
                clearInterval(interval);
                clearTimeout(timer);
                events?.off(Events.Movement.FAILED, onPathFailed);
            };
            const fail = message => {
                cleanup();
                reject(new Error(message));
            };
            const onPathFailed = failedTarget => {
                if (!sameTarget(failedTarget)) return;
                const position = this.bot.entity?.position;
                const current = position
                    ? `${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`
                    : 'unknown';
                const distance = position ? position.distanceTo(target).toFixed(1) : 'unknown';
                const directLimit = settings.directFallbackMaxDistance ?? 24;
                if (!position || position.distanceTo(target) > directLimit) {
                    fail(`Pathfinder không tìm được đường tới điểm câu; bot=${current}, còn ${distance} block.`);
                    return;
                }
                if (this.directFallbackActive) return;
                this.directFallbackActive = true;
                this.service('movement').stop();
                this.warn(`Pathfinder không có đường; đi thẳng tới điểm câu từ ${current}, còn ${distance} block.`);
                this.walkDirectlyToTarget(target, settings)
                    .then(() => {
                        cleanup();
                        this.success(`Đã tới điểm câu ${target.x}, ${target.y}, ${target.z}.`);
                        resolve();
                    })
                    .catch(error => fail(error.message));
            };
            const interval = setInterval(() => {
                if (!this.running || this.paused) {
                    fail('Di chuyển tới điểm câu đã bị dừng.');
                    return;
                }
                if (this.isAtFishingTarget()) {
                    cleanup();
                    this.success(`Đã tới điểm câu ${target.x}, ${target.y}, ${target.z}.`);
                    resolve();
                    return;
                }
                if (this.directFallbackActive) return;

                const position = this.bot.entity?.position;
                if (!position) return;
                const distance = position.distanceTo(target);
                if (distance < lastDistance - 0.25) {
                    lastDistance = distance;
                    lastProgressAt = Date.now();
                }
                if (Date.now() - lastLogAt >= logInterval) {
                    lastLogAt = Date.now();
                    this.info(`Đang đi tới điểm câu | bot=${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)} | còn ${distance.toFixed(1)} block.`);
                }
                if (Date.now() - lastProgressAt >= progressTimeout) {
                    if (retries >= retryLimit) {
                        fail(`Bot bị kẹt khi tới điểm câu; còn ${distance.toFixed(1)} block sau ${retries} lần thử lại.`);
                        return;
                    }
                    retries += 1;
                    lastProgressAt = Date.now();
                    this.warn(`Không tiến gần điểm câu trong ${progressTimeout} ms; tính lại đường (${retries}/${retryLimit}).`);
                    this.service('movement').moveTo(
                        target,
                        settings.targetReachDistance ?? 1
                    ).catch(error => this.warn(`Không thể thử lại đường đi: ${error.message}`));
                }
            }, 250);
            const timer = setTimeout(() => {
                fail(`Không tới được điểm câu ${target.x}, ${target.y}, ${target.z} trong ${timeout} ms.`);
            }, timeout);
            events?.on(Events.Movement.FAILED, onPathFailed);
        });
    }

    walkDirectlyToTarget(target, settings) {
        if (typeof this.bot.setControlState !== 'function' || typeof this.bot.lookAt !== 'function') {
            return Promise.reject(new Error('Mineflayer không hỗ trợ điều khiển đi thẳng tới điểm câu.'));
        }
        const timeout = settings.directFallbackTimeoutMs ?? 15000;
        const stuckTimeout = settings.directFallbackStuckMs ?? 4000;
        const unstuckLimit = settings.directFallbackUnstuckAttempts ?? 3;
        return new Promise((resolve, reject) => {
            let lastDistance = Infinity;
            let lastProgressAt = Date.now();
            let lastLookAt = 0;
            let forcedMoves = 0;
            let unstuckAttempts = 0;
            let unsticking = false;
            const onForcedMove = () => {
                forcedMoves += 1;
                if (forcedMoves !== 1 && forcedMoves % 5 !== 0) return;
                const position = this.bot.entity?.position;
                const current = position
                    ? `${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`
                    : 'unknown';
                this.warn(`Server đã ép cập nhật vị trí (${forcedMoves} lần) khi đang đi thẳng; bot=${current}.`);
            };
            const cleanup = () => {
                clearInterval(interval);
                clearTimeout(timer);
                this.bot.removeListener('forcedMove', onForcedMove);
                this.releaseDirectWalk();
            };
            const finish = error => {
                cleanup();
                if (error) reject(error);
                else resolve();
            };
            const interval = setInterval(() => {
                if (!this.running || this.paused) {
                    finish(new Error('Di chuyển thẳng tới điểm câu đã bị dừng.'));
                    return;
                }
                if (this.isAtFishingTarget()) {
                    finish();
                    return;
                }
                if (unsticking) return;
                const position = this.bot.entity?.position;
                if (!position) return;
                const distance = position.distanceTo(target);
                if (distance < lastDistance - 0.15) {
                    lastDistance = distance;
                    lastProgressAt = Date.now();
                }
                if (Date.now() - lastProgressAt >= stuckTimeout) {
                    if (unstuckAttempts < unstuckLimit) {
                        unstuckAttempts += 1;
                        unsticking = true;
                        lastProgressAt = Date.now();
                        this.warn(`Bot kẹt không có block phía trước; thử tự gỡ kẹt (${unstuckAttempts}/${unstuckLimit}).`);
                        this.performUnstuckManeuver()
                            .catch(error => this.warn(`Không thể tự gỡ kẹt: ${error.message}`))
                            .finally(() => {
                                unsticking = false;
                                lastDistance = Infinity;
                                lastProgressAt = Date.now();
                            });
                        return;
                    }
                    const velocity = this.bot.entity?.velocity;
                    const motion = velocity
                        ? `velocity=${velocity.x.toFixed(2)},${velocity.y.toFixed(2)},${velocity.z.toFixed(2)}`
                        : 'velocity=unknown';
                    finish(new Error(`Đi thẳng vẫn bị kẹt; bot=${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}, còn ${distance.toFixed(1)} block, serverCorrections=${forcedMoves}, ${motion}. ${this.blockedPathDiagnostic(target)}`));
                    return;
                }
                if (Date.now() - lastLookAt >= 500) {
                    lastLookAt = Date.now();
                    Promise.resolve(this.bot.lookAt(new Vec3(target.x, position.y + 1.5, target.z), true)).catch(() => {});
                }
                this.bot.setControlState('forward', true);
                this.bot.setControlState('sprint', true);
                this.bot.setControlState(
                    'jump',
                    target.y > position.y + 0.6
                    || settings.forceDirectSprintJump
                    || this.hasObstacleAhead(target)
                    || this.hasHazardousGroundAhead(target)
                );
            }, 100);
            const timer = setTimeout(() => finish(new Error(`Đi thẳng không tới được điểm câu trong ${timeout} ms.`)), timeout);
            this.bot.on('forcedMove', onForcedMove);
        });
    }

    async performUnstuckManeuver() {
        if (typeof this.bot.setControlState !== 'function') return;
        const set = (control, value) => this.bot.setControlState(control, value);
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

        set('forward', false);
        set('back', true);
        set('sprint', true);
        await wait(300);
        if (!this.directFallbackActive || !this.running || this.paused) return;
        set('back', false);
        set('left', true);
        set('forward', true);
        set('jump', true);
        await wait(550);
        if (!this.directFallbackActive || !this.running || this.paused) return;
        set('left', false);
        set('right', true);
        await wait(700);
        if (!this.directFallbackActive || !this.running || this.paused) return;
        set('right', false);
        set('jump', false);
    }

    hasObstacleAhead(target) {
        const position = this.bot.entity?.position;
        if (!position || typeof this.bot.blockAt !== 'function') return false;
        const dx = target.x - position.x;
        const dz = target.z - position.z;
        const length = Math.hypot(dx, dz);
        if (!length) return false;
        const ahead = new Vec3(
            Math.floor(position.x + dx / length),
            Math.floor(position.y),
            Math.floor(position.z + dz / length)
        );
        const block = this.bot.blockAt(ahead);
        return Boolean(block && block.boundingBox === 'block');
    }

    hasHazardousGroundAhead(target) {
        const position = this.bot.entity?.position;
        if (!position || typeof this.bot.blockAt !== 'function') return false;
        const dx = target.x - position.x;
        const dz = target.z - position.z;
        const length = Math.hypot(dx, dz);
        if (!length) return false;
        const y = Math.floor(position.y) - 1;
        const ground = [
            new Vec3(Math.floor(position.x), y, Math.floor(position.z)),
            new Vec3(
                Math.floor(position.x + dx / length),
                y,
                Math.floor(position.z + dz / length)
            )
        ];
        const hazards = (this.config.fishing || {}).jumpOverGroundBlocks || ['cyan_terracotta', 'blue_terracotta'];
        return ground.some(blockPosition => hazards.includes(this.bot.blockAt(blockPosition)?.name));
    }

    blockedPathDiagnostic(target) {
        const position = this.bot.entity?.position;
        if (!position || typeof this.bot.blockAt !== 'function') return 'Không đọc được block xung quanh.';
        const dx = target.x - position.x;
        const dz = target.z - position.z;
        const length = Math.hypot(dx, dz) || 1;
        const forwardX = dx / length;
        const forwardZ = dz / length;
        const leftX = -forwardZ;
        const leftZ = forwardX;
        const y = Math.floor(position.y);
        const point = (x, yOffset, z) => new Vec3(Math.floor(x), y + yOffset, Math.floor(z));
        const describe = (label, blockPosition) => {
            const block = this.bot.blockAt(blockPosition);
            return `${label}=${block?.name || 'unloaded'}@${blockPosition.x},${blockPosition.y},${blockPosition.z}`;
        };
        const aheadX = position.x + forwardX;
        const aheadZ = position.z + forwardZ;
        return [
            describe('ahead-feet', point(aheadX, 0, aheadZ)),
            describe('ahead-head', point(aheadX, 1, aheadZ)),
            describe('left', point(position.x + leftX, 0, position.z + leftZ)),
            describe('right', point(position.x - leftX, 0, position.z - leftZ)),
            describe('below', point(position.x, -1, position.z))
        ].join(' | ');
    }

    releaseDirectWalk() {
        if (typeof this.bot.setControlState === 'function') {
            this.bot.setControlState('forward', false);
            this.bot.setControlState('back', false);
            this.bot.setControlState('left', false);
            this.bot.setControlState('right', false);
            this.bot.setControlState('jump', false);
            this.bot.setControlState('sprint', false);
        }
        this.directFallbackActive = false;
    }

    slotTarget(settings, slot) {
        const defaults = {
            11: [74, 70, 90],
            13: [1, 64, 3],
            15: [1, 64, 3]
        };
        const raw = settings.slotTargets?.[slot] || defaults[slot];
        if (!raw) return null;
        const point = Array.isArray(raw)
            ? { x: raw[0], y: raw[1], z: raw[2] }
            : raw;
        if (![point.x, point.y, point.z].every(Number.isFinite)) return null;
        return { position: new Vec3(point.x, point.y, point.z), synthetic: true };
    }

    findRod(settings) {
        const names = settings.rodItems || ['fishing_rod'];
        return this.bot.inventory?.items()?.find(item => names.includes(item.name)) || null;
    }

    async equipRod() {
        const rod = this.findRod(this.config.fishing || {});
        if (!rod) throw new Error('Cần câu không còn trong inventory.');
        if (this.bot.heldItem?.name === rod.name) return;
        await this.bot.equip(rod, 'hand');
        this.info(`Đã cầm đúng cần câu: ${rod.displayName || rod.name}.`);
    }

    prepareNoDigMovement() {
        const movement = this.service('movement');
        movement.preparePathfinder();
        if (!this.bot.pathfinder) return;
        const mcData = require('minecraft-data')(this.bot.version);
        const { Movements } = require('mineflayer-pathfinder');
        const safeMovements = new Movements(this.bot, mcData);
        safeMovements.canDig = false;
        safeMovements.canPlace = false;
        safeMovements.allow1by1towers = false;
        const hazards = (this.config.fishing || {}).avoidGroundBlocks || [];
        for (const name of hazards) {
            const id = mcData.blocksByName[name]?.id;
            if (Number.isInteger(id)) safeMovements.blocksToAvoid.add(id);
        }
        this.bot.pathfinder.setMovements(safeMovements);
        movement.pathfinder = this.bot.pathfinder;
    }

    cast() {
        if (this.casting || !this.isAtFishingTarget() || typeof this.bot.fish !== 'function') return;
        this.casting = true;
        let caught = false;
        this.state.fishing.state = 'FISHING';
        this.fishingTask = Promise.resolve()
            .then(async () => {
                await this.equipRod();
                if (typeof this.bot.lookAt === 'function') {
                    await this.bot.lookAt(this.water.position.offset(0.5, 0.5, 0.5), true);
                }
                return this.bot.fish();
            })
            .then(() => {
                caught = true;
                this.success('Đã câu thành công; sẽ thả cần lại.');
            })
            .catch(error => this.warn(`Không thể thả cần: ${error.message}`))
            .finally(() => {
                this.casting = false;
                this.fishingTask = null;
                if (caught && this.running && !this.paused && this.water) {
                    setTimeout(() => {
                        if (this.running && !this.paused && this.water && !this.casting) this.cast();
                    }, 250);
                }
            });
    }

    waitForWindow(gui, previousWindow, timeout) {
        if (gui.window() && gui.window() !== previousWindow) return Promise.resolve(gui.window());
        return new Promise((resolve, reject) => {
            const events = this.ctx.getManager('events');
            const handler = window => {
                if (window === previousWindow) return;
                clearTimeout(timer);
                events.off('gui.open', handler);
                resolve(window);
            };
            const timer = setTimeout(() => {
                events.off('gui.open', handler);
                reject(new Error(`GUI /afk không mở sau ${timeout} ms.`));
            }, timeout);
            events.on('gui.open', handler);
        });
    }

    waitForTeleport(beforePosition, timeout) {
        return new Promise(resolve => {
            let done = false;
            const finish = result => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                this.bot.removeListener('forcedMove', forcedMove);
                resolve(result);
            };
            const forcedMove = () => finish(true);
            const timer = setTimeout(() => {
                const currentPosition = this.bot.entity?.position;
                const moved = beforePosition && currentPosition
                    ? beforePosition.distanceTo(currentPosition) >= 4
                    : false;
                finish(moved);
            }, timeout);
            this.bot.once('forcedMove', forcedMove);
        });
    }
}

module.exports = FishingService;
