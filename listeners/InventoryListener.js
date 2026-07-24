'use strict';

const BaseListener = require('../base/BaseListener');
const Result = require('../constants/Result');
const Events = require('../constants/Events');

/**
 * ============================================================================
 * InventoryListener
 * ============================================================================
 *
 * Đồng bộ Inventory từ Mineflayer vào Runtime.
 *
 * Trách nhiệm:
 * - Cập nhật Runtime.
 * - Emit Framework Event.
 *
 * Không:
 * - Không xử lý nghiệp vụ.
 * - Không gọi Service.
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

        return Result.SUCCESS;
    }

    /**
     * Đồng bộ Runtime Inventory.
     */
    syncInventory() {

        const items = this.bot.inventory.items();

        this.state.inventory.items = items;
        this.state.inventory.selectedSlot = this.bot.quickBarSlot;

        this.state.inventory.heldItem =
            this.bot.heldItem ?? null;

        this.state.inventory.emptySlots =
            this.bot.inventory.emptySlotCount();

        this.state.inventory.full =
            this.state.inventory.emptySlots === 0;

        this.emit(
            Events.Inventory.UPDATE,
            items
        );

        if (this.state.inventory.full) {
            this.emit(Events.Inventory.FULL);
        }

        if (items.length === 0) {
            this.emit(Events.Inventory.EMPTY);
        }

    }

}

module.exports = InventoryListener;