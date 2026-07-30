'use strict';

const BaseListener = require('../core/base/BaseListener');
const Result = require('../core/constants/Result');

/**
 * ============================================================================
 * InventoryListener
 * ============================================================================
 *
 * Đồng bộ Inventory từ Mineflayer vào Runtime.
 *
 * Trách nhiệm:
 * - Chuyển Mineflayer event sang InventoryService.
 * - Cập nhật metadata runtime của hotbar/tay cầm.
 *
 * Không:
 * - Không xử lý nghiệp vụ.
 * - Không chứa logic inventory riêng.
 * - Không gọi Mode.
 *
 * ============================================================================
 */

class InventoryListener extends BaseListener {

    constructor(ctx) {
        super(ctx);

        this.name = 'InventoryListener';
    }

    async register() {

        await super.register();

        this.bind(
            this.bot,
            'windowUpdate',
            () => this.syncInventory()
        );

        this.bind(
            this.bot,
            'heldItemChanged',
            () => this.syncInventory()
        );

        this.bind(
            this.bot,
            'spawn',
            () => this.syncInventory()
        );

        return Result.SUCCESS;
    }

    /**
     * Đồng bộ Runtime Inventory.
     */
    syncInventory() {

        // InventoryService is the only writer for normalized items. Its
        // snapshot includes hotbar slots and custom item labels. Writing raw
        // Mineflayer items here used to overwrite that data after /pv or a
        // crafting window update.
        const inventory = this.service('inventory');
        if (!inventory?.sync) return Result.FAILED;
        const result = inventory.sync();
        if (result !== Result.SUCCESS) return result;

        this.state.inventory.selectedSlot = this.bot.quickBarSlot;
        this.state.inventory.heldItem =
            this.bot.heldItem ?? null;
        return Result.SUCCESS;

    }

}

module.exports = InventoryListener;
