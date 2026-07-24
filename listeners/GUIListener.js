'use strict';

const BaseListener = require('../base/BaseListener');
const Result = require('../constants/Result');
const Events = require('../constants/Events');

/**
 * ============================================================================
 * GUIListener
 * ============================================================================
 *
 * Đồng bộ trạng thái GUI từ Mineflayer vào Runtime.
 *
 * Trách nhiệm:
 * - Cập nhật Runtime.
 * - Emit Framework Event.
 *
 * Không:
 * - Không xử lý workflow.
 * - Không click GUI.
 * - Không gọi Service.
 *
 * ============================================================================
 */

class GUIListener extends BaseListener {

    constructor(ctx) {
        super(ctx);

        this.name = 'GUIListener';
    }

    async register() {

        await super.register();

        /**
         * GUI Open
         */
        this.bind(
            this.bot,
            'windowOpen',
            window => {

                this.state.gui.opened = true;
                this.state.gui.window = window;
                this.state.gui.title = window.title;
                this.state.gui.slots = [...window.slots];

                this.emit(
                    Events.GUI.OPEN,
                    window
                );

            }
        );

        /**
         * GUI Close
         */
        this.bind(
            this.bot,
            'windowClose',
            window => {

                this.state.gui.opened = false;
                this.state.gui.window = null;
                this.state.gui.title = null;
                this.state.gui.slots = [];

                this.emit(
                    Events.GUI.CLOSE,
                    window
                );

            }
        );

        /**
         * GUI Slot Update
         */
        this.bind(
            this.bot,
            'windowUpdate',
            (slot, oldItem, newItem) => {

                if (!this.state.gui.opened || !this.bot.currentWindow) {
                    return;
                }

                this.state.gui.slots = [
                    ...this.bot.currentWindow.slots,
                    
                ];
                this.state.gui.lastUpdate = Date.now();

                this.emit(
                    Events.GUI.SLOT,
                    {
                        slot,
                        oldItem,
                        newItem
                    }
                );

                this.emit(
                    Events.GUI.UPDATE,
                    this.state.gui.slots
                );

            }
        );

        return Result.SUCCESS;
    }

}

module.exports = GUIListener;