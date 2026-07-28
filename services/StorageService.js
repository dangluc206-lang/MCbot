'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');

/**
 * Owns reusable storage inspection and selling operations. Modes decide when
 * to inspect or sell; this service performs the configured server commands.
 */
class StorageService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'StorageService';
        this.events = ctx.getManager('events');
        this.inventory = ctx.getService('inventory');
        this.gui = ctx.getService('gui');
        this.checkingGui = false;
    }

    async initialize() {
        await super.initialize();
        this.setSelectedOres(this.config.storage?.selectedOres || this.config.storage?.mine || []);
        return Result.SUCCESS;
    }

    isSelling() {
        return this.state.storage.selling;
    }

    /** Sells the player inventory using the server command configured for it. */
    async sellInventory() {
        if (!this.bot) return Result.FAILED;
        if (this.isSelling()) return Result.BUSY;

        const command = this.config.storage?.inventorySellCommand || this.state.storage.sellCommand;
        this.state.storage.selling = true;
        this.emit(Events.Storage.SELL_INVENTORY);
        try {
            this.bot.chat(command);
            this.state.storage.lastSell = Date.now();
            this.state.metrics.sells++;
            return Result.SUCCESS;
        } catch (error) {
            this.error(`Không thể bán inventory: ${error.message}`);
            return Result.FAILED;
        } finally {
            this.state.storage.selling = false;
        }
    }

    /**
     * Sends one `/kho sell <ore>` command per selected ore/block. Discord only
     * updates selectedOres; it never sends raw Mineflayer chat itself.
     */
    async sellStorage() {
        if (!this.bot) return Result.FAILED;
        if (this.isSelling()) return Result.BUSY;

        const ores = this.getSelectedOres();
        if (ores.length === 0) {
            this.warn('Kho đầy nhưng chưa chọn ore/block để bán.');
            return Result.NO_ACTION;
        }

        const settings = this.config.storage || {};
        const command = settings.sellCommand || this.state.storage.sellCommand;
        const delayMs = Number.isFinite(settings.sellCommandDelayMs)
            ? Math.max(0, settings.sellCommandDelayMs)
            : 350;

        this.state.storage.selling = true;
        this.emit(Events.Storage.SELL_STORAGE);
        try {
            for (const ore of ores) {
                const argument = this._sellArgument(ore);
                if (!argument) continue;

                this.bot.chat(`${command} ${argument}`);
                if (delayMs > 0) await this.manager('scheduler')?.sleep(delayMs);
            }

            this.state.storage.lastSell = Date.now();
            this.state.metrics.sells++;
            this.emit(Events.Storage.FINISHED, ores);
            this.success(`Đã gửi lệnh bán ${ores.length} loại ore/block trong /kho.`);
            return Result.SUCCESS;
        } catch (error) {
            this.emit(Events.Storage.FAILED, error);
            this.error(`Không thể bán kho: ${error.message}`);
            return Result.FAILED;
        } finally {
            this.state.storage.selling = false;
        }
    }

    isStorageFull() {
        const gui = this.state.storage.gui;
        return Boolean(gui?.totalSegments > 0 && gui.filledSegments >= gui.totalSegments);
    }

    /**
     * Opens /kho briefly so GUIListener can capture the title capacity bars.
     * The GUI is always closed before the mode continues.
     */
    async refreshStorageGui() {
        if (!this.bot || !this.gui) return Result.FAILED;
        if (this.checkingGui) return Result.BUSY;

        const settings = this.config.storage || {};
        const command = settings.guiCommand || '/kho';
        const timeout = settings.guiTimeoutMs ?? 5000;

        this.checkingGui = true;
        try {
            if (this.gui.isOpen()) await this.gui.close();

            this.bot.chat(command);
            await this.gui.waitOpen(timeout);

            const snapshot = this.state.storage.gui;
            this.state.storage.full = this.isStorageFull();
            this.success(
                `[Storage GUI] title="${snapshot.title || '(không có)'}" `
                + `slots=${snapshot.usedSlots}/${snapshot.totalSlots} `
                + `capacity=${snapshot.filledSegments}/${snapshot.totalSegments || '?'} `
                + `full=${this.state.storage.full}`
            );

            await this.gui.close();
            return Result.SUCCESS;
        } catch (error) {
            this.warn(`Không thể đọc GUI kho: ${error.message}`);
            return error?.code === 'TIMEOUT' ? Result.GUI_TIMEOUT : Result.FAILED;
        } finally {
            this.checkingGui = false;
        }
    }

    async sellAll() {
        const inventoryResult = await this.sellInventory();
        if (inventoryResult !== Result.SUCCESS) return inventoryResult;

        const storageResult = await this.sellStorage();
        return storageResult === Result.NO_ACTION ? Result.SUCCESS : storageResult;
    }

    hasItems() {
        return Boolean(this.inventory && !this.inventory.isEmpty());
    }

    setSelectedOres(ores = []) {
        const unique = [...new Set(ores.filter(ore => typeof ore === 'string' && ore.trim()))];
        this.state.storage.selectedOres = unique;
        this.config.storage = this.config.storage || {};
        this.config.storage.selectedOres = [...unique];
        return Result.SUCCESS;
    }

    getSelectedOres() {
        return this.state.storage.selectedOres;
    }

    _sellArgument(ore) {
        return typeof ore === 'string' ? ore.trim().toLowerCase() : '';
    }

    emit(event, ...args) {
        this.events?.emit?.(event, ...args);
    }

    async destroy() {
        this.checkingGui = false;
        await super.destroy();
        return Result.SUCCESS;
    }
}

module.exports = StorageService;
