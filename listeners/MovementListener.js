'use strict';

const BaseListener = require('../base/BaseListener');
const Result = require('../constants/Result');
const Events = require('../constants/Events');

/**
 * ============================================================================
 * MovementListener
 * ============================================================================
 *
 * Theo dõi trạng thái di chuyển của Bot.
 *
 * Trách nhiệm:
 * - Đồng bộ Position vào Runtime.
 * - Phát Movement Events.
 *
 * Không:
 * - Không pathfinding.
 * - Không gọi MovementService.
 * - Không gọi Mode.
 * - Không xử lý workflow.
 *
 * ============================================================================
 */

class MovementListener extends BaseListener {

    constructor(ctx) {
        super(ctx);

        this.name = 'MovementListener';

        /**
         * Vị trí trước đó.
         *
         * @private
         * @type {*}
         */
        this._lastPosition = null;

        /**
         * Đang di chuyển.
         *
         * @private
         * @type {Boolean}
         */
        this._moving = false;
    }

    async register() {

        await super.register();

        this.bind(
            this.bot,
            'move',
            () => this.handleMove()
        );

        return Result.SUCCESS;
    }

    /**
     * Xử lý di chuyển.
     *
     * @private
     */
    handleMove() {

        if (!this.bot.entity) {
            return;
        }

        const position = this.bot.entity.position.clone();

        this.state.player.position = position;
        this.state.player.rotation = {
            yaw: this.bot.entity.yaw,
            pitch: this.bot.entity.pitch
        };
        this.state.player.yaw = this.bot.entity.yaw;
        this.state.player.pitch = this.bot.entity.pitch;

        this.emit(
            Events.Player.POSITION,
            position
        );

        if (!this._lastPosition) {

            this._lastPosition = position;

            return;
        }

        const moved =
            this._lastPosition.distanceTo(position) > 0;

        if (moved && !this._moving) {

            this._moving = true;

            this.emit(
                Events.Movement.START,
                position
            );

        }

        if (!moved && this._moving) {

            this._moving = false;

            this.emit(
                Events.Movement.STOP,
                position
            );

        }

        if (moved) {

            this.emit(
                Events.Player.MOVED,
                position
            );

        }

        this._lastPosition = position;

    }

}

module.exports = MovementListener;