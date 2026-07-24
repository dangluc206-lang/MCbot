'use strict';

const BaseListener = require('../base/BaseListener');
const Result = require('../constants/Result');
const Events = require('../constants/Events');

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

        return Result.SUCCESS;
    }

}

module.exports = ChatListener;