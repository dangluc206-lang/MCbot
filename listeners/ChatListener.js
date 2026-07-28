'use strict';

const BaseListener = require('../core/base/BaseListener');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');

/**
 * ============================================================================
 * ChatListener
 * ============================================================================
 *
 * Đồng bộ Chat từ Mineflayer vào Runtime và Event Bus.
 *
 * Trách nhiệm:
 * - Lắng nghe chat.
 * - Lắng nghe message hệ thống.
 * - Emit Framework Event.
 *
 * Không:
 * - Không parse command.
 * - Không xử lý nghiệp vụ.
 * - Không tự trả lời chat.
 * - Không gọi Mode.
 * - Không gọi Service.
 *
 * ============================================================================
 */

class ChatListener extends BaseListener {

    constructor(ctx) {
        super(ctx);

        this.name = 'ChatListener';
    }

    async register() {

        await super.register();

        /**
         * Chat người chơi.
         */
        this.bind(
            this.bot,
            'chat',
            (username, message) => {

                this.emit(
                    Events.Player.CHAT,
                    {
                        username,
                        message
                    }
                );

            }
        );

        /**
         * Tin nhắn hệ thống.
         */
        this.bind(
            this.bot,
            'messagestr',
            (
                message,
                position,
                sender,
                verified
            ) => {

                this.emit(
                    Events.Player.MESSAGE,
                    {
                        message,
                        position,
                        sender,
                        verified
                    }
                );

            }
        );

        /**
         * Thanh Action Bar (vị trí phía trên hotbar). Server SkyBlock thường
         * dùng kênh này để thông báo đào block, kho đầy, cooldown, v.v.
         *
         * Không xử lý nghiệp vụ tại đây: listener chỉ cập nhật Runtime và emit
         * event để Storage/Mode có thể đăng ký nhận khi đã có mẫu thông báo
         * thực tế từ server.
         */
        this.bind(
            this.bot,
            'actionBar',
            (jsonMsg, verified) => {
                const message = this._messageToString(jsonMsg);

                this.state.player.lastActionBar = {
                    message,
                    receivedAt: Date.now()
                };

                this.emit(
                    Events.Player.ACTION_BAR,
                    {
                        message,
                        jsonMsg,
                        verified
                    }
                );

                if (this.config.logging?.actionBar === true) {
                    this.info(`[ActionBar] ${message || '(trống)'}`);
                }
            }
        );

        return Result.SUCCESS;
    }

    /**
     * Chuyển Minecraft chat component về text an toàn cho log và event.
     *
     * @param {*} jsonMsg
     * @returns {String}
     * @private
     */
    _messageToString(jsonMsg) {
        if (jsonMsg === null || jsonMsg === undefined) {
            return '';
        }

        try {
            return typeof jsonMsg.toString === 'function'
                ? jsonMsg.toString()
                : String(jsonMsg);
        } catch (error) {
            this.warn('Không thể đọc Action Bar từ server.', error.message);
            return '';
        }
    }

}

module.exports = ChatListener;
