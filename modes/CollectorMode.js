'use strict';

const BaseMode = require('../core/base/BaseMode');
const Result = require('../core/constants/Result');

const DEFAULT_PICKUP_POSITION = Object.freeze({ x: -23996.7, y: 100, z: 19207.3 });

/**
 * Collects island drops and periodically runs the source-aware SHK workflow.
 * GUI work is exclusive: a running `/ks` is never interrupted by `/kho`.
 */
class CollectorMode extends BaseMode {
    constructor(ctx) {
        super(ctx);
        this.name = 'CollectorMode';
        this.nextStorageGuiCheckAt = 0;
        this.nextCraftAttemptAt = 0;
        this.nextPositionCheckAt = 0;
        this.craftingActive = false;
        this.storageSnapshotReady = false;
        this.storageCraftReadiness = null;
        this.starting = false;
        this.guiBackoffUntil = 0;
        this.lastConnectionSessionId = null;
    }

    async start() {
        this.starting = true;
        try {
            const result = await super.start();
            if (result !== Result.SUCCESS) return result;

            const joined = await this.service('skyblock').ensureJoined();
            if (joined !== Result.SUCCESS && joined !== Result.ALREADY_DONE) {
                await super.stop();
                return joined;
            }

            const island = await this.service('skyblock').goToIsland();
            if (island !== Result.SUCCESS) {
                await super.stop();
                return island;
            }

            const started = this.service('collector').start();
            if (started !== Result.SUCCESS) {
                await super.stop();
                return started;
            }

            const now = Date.now();
            this.nextStorageGuiCheckAt = now + this._storageGuiCheckInterval();
            this.nextCraftAttemptAt = now;
            this.nextPositionCheckAt = now + this._positionCheckInterval();
            this.craftingActive = false;
            this.storageSnapshotReady = false;
            this.guiBackoffUntil = 0;
            this.lastConnectionSessionId = this.state.bot.sessionId;

            // Collector must first reach the configured drop location. This
            // avoids opening /pv, /kho, or /ks while it is still in transit
            // from /is, and makes the first SHK preflight run at the pickup
            // point just like all later retries.
            const positioned = await this._goToPickupPosition();
            if (positioned !== Result.SUCCESS) {
                await super.stop();
                return positioned;
            }

            // CraftingService owns the complete inventory -> /pv 2 -> /kho
            // preparation sequence once the bot has reached the pickup point.
            this._startCrafting();

            this.success(this.craftingActive
                ? 'Đang kiểm tra inventory + /pv 2 + /kho để chế tạo SHK.'
                : `Đang nhặt item tại ${this._describePickupPosition()}; sẽ kiểm tra SHK theo chu kỳ.`);
            return Result.SUCCESS;
        } finally {
            this.starting = false;
        }
    }

    async tick() {
        if (this.starting) return Result.PENDING;
        this._resetGuiBackoffAfterReconnect();

        const joined = await this.service('skyblock').ensureJoined();
        if (joined !== Result.SUCCESS && joined !== Result.ALREADY_DONE) return joined;
        if (this.service('player').isDead()) {
            this.requestRecovery('PLAYER_DEAD');
            return Result.PLAYER_DEAD;
        }

        if (!this.craftingActive && this._adoptActiveCraftRun()) return this._tickCrafting();
        // Never probe or sell storage while `/ks` is active. Opening `/kho`
        // would close the recipe GUI and may invalidate the current plan.
        if (this.craftingActive) return this._tickCrafting();

        const now = Date.now();
        if (this.service('inventory').isFull()) {
            // A SHK batch can expand stored B1 blocks into many raw ingots or
            // gems.  Do not let the inventory-full guard prevent the normal
            // `/kho` maintenance that packs those B1 materials back into
            // blocks and sells configured ores.  This check must happen
            // before pausing collection, otherwise a full NPC store and a
            // full player inventory deadlock each other.
            if (now >= this.nextStorageGuiCheckAt) {
                const maintenance = await this._checkAndSellStorage();
                if (maintenance === Result.SUCCESS && !this.service('inventory').isFull()) {
                    this.service('collector').resume();
                    this.state.collector.state = 'COLLECTING';
                    this.info('Đã nén/bán kho sau lượt SHK; inventory đã có chỗ trống, tiếp tục nhặt.');
                    return Result.PENDING;
                }
            }
            if (this.state.collector.state !== 'INVENTORY_FULL') {
                this.warn('Inventory đầy sau khi đã chạy nén/bán /kho; tạm ngừng nhặt để bảo vệ SHK và item từ /pv 2.');
            }
            this.state.collector.state = 'INVENTORY_FULL';
            this.service('collector').pause();
            return Result.INVENTORY_FULL;
        }

        if (now >= this.nextStorageGuiCheckAt) return this._checkAndSellStorage();
        if (this._superAlloyEnabled() && now >= this.nextCraftAttemptAt) return this._startCrafting();

        if (now >= this.nextPositionCheckAt) {
            this.nextPositionCheckAt = now + this._positionCheckInterval();
            const returned = await this._returnToPickupPosition();
            if (returned !== Result.SUCCESS && returned !== Result.NO_ACTION) {
                this.warn(`Không thể trở lại điểm nhặt: ${returned}.`);
            }
            if (returned === Result.SUCCESS) return Result.PENDING;
        }
        return this.service('collector').tick();
    }

    async recover() {
        const joined = await this.service('skyblock').ensureJoined();
        if (joined !== Result.SUCCESS && joined !== Result.ALREADY_DONE) return joined;
        const island = await this.service('skyblock').goToIsland();
        if (island !== Result.SUCCESS) return island;
        await this.service('movement').stop();
        const positioned = await this._goToPickupPosition();
        if (positioned !== Result.SUCCESS) return positioned;
        await this.service('collector').resume();
        this.clearRecovery();
        return Result.SUCCESS;
    }

    async pause() {
        const result = await super.pause();
        if (result !== Result.SUCCESS) return result;
        await this.service('movement').stop();
        this.service('collector').pause();
        if (this.craftingActive) await this.service('crafting').stop();
        this.craftingActive = false;
        return Result.SUCCESS;
    }

    async resume() {
        const result = await super.resume();
        if (result !== Result.SUCCESS) return result;
        this.service('collector').resume();
        this.nextPositionCheckAt = 0;
        return Result.SUCCESS;
    }

    async stop() {
        this.starting = false;
        if (this.craftingActive) await this.service('crafting').stop();
        this.craftingActive = false;
        this.service('collector').stop();
        await this.service('movement').stop();
        return super.stop();
    }

    async _checkAndSellStorage() {
        if (this._isGuiBackoffActive()) return Result.PENDING;
        const storage = this.service('storage');
        let result = await storage.refreshStorageGui();
        let nextDelay = this._storageGuiCheckInterval();

        if (result !== Result.SUCCESS) {
            this.storageSnapshotReady = false;
            this.storageCraftReadiness = null;
            this.warn(`Không cập nhật được /kho: ${result}`);
            if (this._isUnresponsiveGuiResult(result)) {
                this._enterGuiBackoff('/kho', result);
                return result;
            }
        } else {
            // The first read intentionally runs raw smelting and block-to-ingot
            // conversion. Read once more without those mutations so capacity,
            // dashboard data, and the sell decision represent the actual state
            // after the configured /kho maintenance workflow.
            result = await storage.refreshStorageGui({ runPostProcessing: false });
            if (result !== Result.SUCCESS) {
                this.storageSnapshotReady = false;
                this.storageCraftReadiness = null;
                this.warn(`Không đọc lại được /kho sau nung/đổi khối: ${result}`);
                if (this._isUnresponsiveGuiResult(result)) {
                    this._enterGuiBackoff('/kho', result);
                    return result;
                }
                this.nextStorageGuiCheckAt = Date.now() + nextDelay;
                return result;
            }
            this.storageSnapshotReady = true;
            const settings = this.config.crafting || {};
            this.storageCraftReadiness = this.service('crafting').getStorageReadiness(
                settings.targetSlot,
                settings.targetCount
            );
            const free = storage.getStorageStats?.().free;
            if (Number.isFinite(free) && free <= this._autoSellFreeThreshold()) {
                const sold = await storage.sellStorage();
                this.state.collector.lastStorageSellAt = Date.now();
                this.state.collector.lastStorageSellResult = sold;
                if (sold === Result.SUCCESS) {
                    nextDelay = this._postStorageSellDelay();
                    this.info(`Kho NPC còn ${free.toLocaleString('vi-VN')} chỗ; đã bán ore/block được chọn.`);
                } else if (sold !== Result.NO_ACTION) {
                    this.warn(`Kho NPC sắp đầy nhưng chưa bán được: ${sold}.`);
                }
            }
        }
        this.nextStorageGuiCheckAt = Date.now() + nextDelay;
        return result;
    }

    _shouldStartCrafting() {
        return this._superAlloyEnabled() && !this.craftingActive;
    }

    _startCrafting() {
        if (this._isGuiBackoffActive()) return Result.PENDING;
        if (!this._shouldStartCrafting()) return Result.NO_ACTION;
        const settings = this.config.crafting || {};
        const started = this.service('crafting').start(settings.targetSlot, settings.targetCount, {
            bulkCraftEnabled: false
        });
        if (started !== Result.SUCCESS) {
            if (started === Result.BUSY && this._adoptActiveCraftRun()) return Result.PENDING;
            this.nextCraftAttemptAt = Date.now() + this._superAlloyRetryInterval();
            this.warn(`Chưa thể bắt đầu preflight SHK: ${started}. Sẽ thử lại sau.`);
            return started;
        }
        this.craftingActive = true;
        this.state.mode.state = 'CRAFTING_SHK';
        this.info('Bắt đầu preflight SHK: inventory → /pv 2 → /kho → /ks.');
        return Result.PENDING;
    }

    _adoptActiveCraftRun() {
        const crafting = this.service('crafting');
        if (!crafting?.isActive?.()) return false;
        this.craftingActive = true;
        this.state.mode.state = 'CRAFTING_SHK';
        this.warn('Phát hiện chu kỳ SHK đang dở; tiếp tục thực hiện thay vì tạo kế hoạch mới.');
        return true;
    }

    async _tickCrafting() {
        const result = await this.service('crafting').tick();
        if (!this.service('crafting').isFinished()) return result;

        const crafting = this.service('crafting');
        const succeeded = crafting.succeeded();
        const partial = crafting.wasPartial?.() === true;
        const craftedTargetCount = crafting.getCraftedTargetCount?.() || 0;
        const depositRequest = crafting.getCompletedTargetDepositRequest?.();
        const recoveryRequests = crafting.getIntermediateRecoveryDepositRequests?.() || [];
        const now = Date.now();
        const createdSuperAlloy = succeeded && craftedTargetCount > 0;

        this.craftingActive = false;
        this.state.mode.state = 'RUNNING';
        this.nextCraftAttemptAt = now + (createdSuperAlloy
            ? this._superAlloyInterval()
            : this._superAlloyRetryInterval());
        this.nextStorageGuiCheckAt = now;
        this.nextPositionCheckAt = 0;
        this.state.crafting.lastSuccessfulTargetAt = createdSuperAlloy
            ? now
            : this.state.crafting.lastSuccessfulTargetAt || null;
        this.state.crafting.nextTargetAttemptAt = this.nextCraftAttemptAt;

        // `/ks` timed out without opening a GUI. The server is generally not
        // responding to any GUI command at this point; do not turn one timeout
        // into `/pv 2` retry + `/kho` retry and then a keepalive disconnect.
        if (this._isUnresponsiveGuiResult(result)) {
            this._enterGuiBackoff('/ks', result);
            return result;
        }

        if (createdSuperAlloy) {
            const depositResult = await this._depositCraftOutputs([depositRequest, ...recoveryRequests].filter(Boolean));
            const moved = this.state.personalVault?.lastDeposit?.moved || [];
            const storedTarget = depositResult === Result.SUCCESS
                && moved.some(item => item.name === depositRequest?.name);
            this.success(storedTarget
                ? `Đã tạo SHK x${craftedTargetCount}; đã cất SHK vào /pv 2 và chờ 1 giờ trước lượt SHK kế tiếp.`
                : `Đã tạo SHK x${craftedTargetCount}; chưa xác nhận cất được SHK vào /pv 2, giữ trong inventory và chờ 1 giờ trước lượt kế tiếp.`);
        } else if (succeeded && partial) {
            await this._depositCraftOutputs(recoveryRequests);
            this.info('Đã hoàn tất các công đoạn SHK khả thi; chưa tạo SHK nên sẽ thử lại theo retry ngắn.');
        } else {
            // A failed run may still have valid B2/B3/B4 products created
            // before the error. Recover them first; the next preflight reads
            // `/pv 2` and uses those materials instead of re-crafting them.
            const recoveryResult = await this._depositCraftOutputs(recoveryRequests);
            if (recoveryResult === Result.SUCCESS) {
                this.info('Đã cất B2/B3/B4 còn lại vào /pv 2 sau lỗi craft để giải phóng inventory.');
            }
            this.warn('Chưa đủ điều kiện chế tạo SHK; tiếp tục nhặt và bán kho.');
        }
        return succeeded ? Result.SUCCESS : result;
    }

    async _depositCraftOutputs(requests = []) {
        if (!requests.length || this.config.crafting?.personalVault?.depositAfterCraft === false) return Result.NO_ACTION;
        const result = await this.service('personalVault')?.deposit?.(requests);
        if (result === Result.SUCCESS || result === Result.NO_ACTION) return result;
        this.warn(`Đã craft nhưng chưa thể cất thành phẩm/dư vào /pv 2: ${result}. Giữ nguyên trong inventory để tránh mất item.`);
        return result || Result.FAILED;
    }

    async _goToPickupPosition() {
        const target = this._pickupPosition();
        if (!target || this._isAtPickupPosition()) return Result.SUCCESS;
        this.state.collector.state = 'MOVING';
        const result = await this.service('movement').goto(target, this._pickupRange(), this._pickupTimeout());
        if (result === Result.SUCCESS) this.state.collector.state = 'COLLECTING';
        return result;
    }

    async _returnToPickupPosition() {
        const target = this._pickupPosition();
        if (!target || this._isAtPickupPosition() || this.service('movement').isMoving()) return Result.NO_ACTION;
        this.state.collector.state = 'MOVING';
        return this.service('movement').moveTo(target, this._pickupRange());
    }

    _isAtPickupPosition() {
        const target = this._pickupPosition();
        const position = this.state.player.position;
        if (!target || !position) return false;
        return Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z) <= this._pickupRange();
    }

    _pickupPosition() {
        const configured = this.config.collector?.pickupPosition;
        if (configured === null || configured === false) return null;
        const source = configured || DEFAULT_PICKUP_POSITION;
        const value = Array.isArray(source)
            ? { x: Number(source[0]), y: Number(source[1]), z: Number(source[2]) }
            : { x: Number(source.x), y: Number(source.y), z: Number(source.z) };
        return [value.x, value.y, value.z].every(Number.isFinite) ? value : null;
    }

    _describePickupPosition() {
        const target = this._pickupPosition();
        return target ? `${target.x}, ${target.y}, ${target.z}` : 'vị trí hiện tại';
    }

    _pickupRange() {
        const value = Number(this.config.collector?.pickupRange);
        return Number.isFinite(value) ? Math.min(Math.max(value, 0.5), 4) : 1;
    }

    _pickupTimeout() {
        const value = Number(this.config.collector?.pickupTimeoutMs);
        return Number.isFinite(value) ? Math.min(Math.max(value, 1000), 300000) : 60000;
    }

    _positionCheckInterval() {
        const value = Number(this.config.collector?.positionCheckIntervalMs);
        return Number.isFinite(value) ? Math.min(Math.max(value, 1000), 60000) : 10000;
    }

    _storageGuiCheckInterval() {
        const configured = Number(this.config.collector?.storageGuiCheckIntervalMs);
        if (Number.isFinite(configured) && configured >= 5000) return configured;
        const legacy = Number(this.config.storage?.guiCheckIntervalMs);
        return Number.isFinite(legacy) && legacy >= 5000 ? legacy : 30000;
    }

    _postStorageSellDelay() {
        const configured = Number(this.config.collector?.afterSellGuiCheckDelayMs);
        if (Number.isFinite(configured) && configured >= 5000) return configured;
        const legacy = Number(this.config.storage?.afterSellGuiCheckDelayMs);
        return Number.isFinite(legacy) && legacy >= 5000
            ? legacy
            : Math.max(10000, this._storageGuiCheckInterval());
    }

    _guiFailureBackoffMs() {
        const value = Number(this.config.collector?.guiFailureBackoffMs);
        return Number.isFinite(value) ? Math.min(Math.max(value, 5000), 60000) : 30000;
    }

    _isGuiBackoffActive(now = Date.now()) {
        return Number(this.guiBackoffUntil) > now;
    }

    _isUnresponsiveGuiResult(result) {
        return result === Result.GUI_TIMEOUT
            || result === Result.NOT_CONNECTED
            || result === Result.DISCONNECTED;
    }

    _enterGuiBackoff(command, result) {
        const until = Date.now() + this._guiFailureBackoffMs();
        this.guiBackoffUntil = Math.max(this.guiBackoffUntil || 0, until);
        this.nextStorageGuiCheckAt = this.guiBackoffUntil;
        this.nextCraftAttemptAt = Math.max(this.nextCraftAttemptAt || 0, this.guiBackoffUntil);
        this.state.collector.guiBackoffUntil = this.guiBackoffUntil;
        this.state.collector.lastGuiFailure = { command, result, at: Date.now() };
        this.warn(
            `${command} không phản hồi (${result}); tạm ngừng toàn bộ lệnh GUI `
            + `đến ${new Date(this.guiBackoffUntil).toLocaleTimeString('vi-VN')} để chờ server/reconnect.`
        );
    }

    _resetGuiBackoffAfterReconnect() {
        const sessionId = this.state.bot.sessionId;
        if (sessionId === this.lastConnectionSessionId) return;
        this.lastConnectionSessionId = sessionId;
        if (this.guiBackoffUntil <= 0) return;
        this.guiBackoffUntil = 0;
        // The previous GUI server may have stopped responding entirely. A
        // successful reconnect creates a fresh protocol session, so let the
        // lightweight storage read run again immediately instead of keeping
        // the old 30-second schedule from the failed session.
        this.nextStorageGuiCheckAt = 0;
        this.state.collector.guiBackoffUntil = null;
        this.info('Đã có session Minecraft mới; bỏ chờ GUI để khôi phục mode.');
    }

    _superAlloyEnabled() {
        return this.config.collector?.superAlloyEnabled !== false;
    }

    _superAlloyInterval() {
        const value = Number(this.config.collector?.superAlloyIntervalMs);
        return Number.isFinite(value) ? Math.min(Math.max(value, 30000), 3600000) : 3600000;
    }

    _superAlloyRetryInterval() {
        const value = Number(this.config.collector?.superAlloyRetryIntervalMs);
        return Number.isFinite(value) ? Math.min(Math.max(value, 30000), 3600000) : 120000;
    }

    _autoSellFreeThreshold() {
        const value = Number(this.config.storage?.autoSellFreeThreshold);
        return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 150000;
    }
}

module.exports = CollectorMode;
