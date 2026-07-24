'use strict';

const BaseListener = require('../core/base/BaseListener');
const Events = require('../core/constants/Events');
const States = require('../core/constants/States');
const Result = require('../core/constants/Result');

/**
 * ============================================================================
 * ConnectionListener
 * ============================================================================
 *
 * Lắng nghe các sự kiện kết nối Mineflayer.
 *
 * Trách nhiệm:
 * - Đồng bộ Runtime.
 * - Emit Framework Event.
 *
 * Không chứa nghiệp vụ.
 * ============================================================================
 */
class ConnectionListener extends BaseListener {

    constructor(ctx) {
        super(ctx);

        this.name = 'ConnectionListener';
    }

    async register() {

        await super.register();

        this.bind(this.bot, 'login', this.onLogin.bind(this));
        this.bind(this.bot, 'spawn', this.onSpawn.bind(this));
        this.bind(this.bot, 'end', this.onEnd.bind(this));
        this.bind(this.bot, 'kicked', this.onKicked.bind(this));
        this.bind(this.bot, 'error', this.onError.bind(this));

        // mineflayer-resource-pack
        this.bind(
            this.bot,
            'resourcePack',
            this.onResourcePack.bind(this)
        );

        return Result.SUCCESS;
    }

    /**
     * Login thành công.
     */
    onLogin() {

        this.state.bot.connected = true;

        this.state.connection.state = States.Connection.CONNECTED;

        this.runtime.state.connectedAt = Date.now();

        this.emit(Events.Connection.CONNECTED);
    }

    /**
     * Spawn.
     */
    onSpawn() {

        this.state.connection.state = States.Connection.READY;

        this.emit(Events.Connection.READY);
    }

    /**
     * Mất kết nối.
     */
    onEnd(reason) {

        this.state.bot.connected = false;

        this.state.connection.state =
            States.Connection.DISCONNECTED;

        this.state.connection.lastDisconnect = Date.now();

        this.emit(
            Events.Connection.ENDED,
            reason
        );
    }

    /**
     * Bị kick.
     */
    onKicked(reason) {

        this.state.bot.connected = false;

        this.state.connection.state =
            States.Connection.KICKED;

        this.state.connection.lastKickReason = reason;

        this.emit(
            Events.Connection.KICKED,
            reason
        );
    }

    /**
     * Lỗi.
     */
    onError(error) {

        this.emit(
            Events.Connection.ERROR,
            error
        );
    }

    /**
     * Server yêu cầu Resource Pack.
     */
    onResourcePack(url, hash) {

        this.state.connection.state =
            States.Connection.RESOURCE_PACK;

        this.emit(
            Events.Connection.RESOURCE_PACK,
            url,
            hash
        );
    }

}

module.exports = ConnectionListener;