'use strict';

const BaseService = require('../../core/base/BaseService');
const Result = require('../../core/constants/Result');

/**
 * ============================================================================
 * PlayerService
 * ============================================================================
 *
 * Quản lý thao tác liên quan tới Player.
 *
 * Trách nhiệm:
 * - Đọc thông tin player.
 * - Gửi chat / command.
 * - Kiểm tra trạng thái player.
 * - Điều khiển hành động cơ bản.
 *
 * Không:
 * - Quản lý workflow.
 * - Quản lý Mode.
 * - Quản lý reconnect.
 *
 * ============================================================================
 */
class PlayerService extends BaseService {

    constructor(ctx) {
        super(ctx);

        this.name = 'PlayerService';
    }

    /**
     * Initialize Service.
     *
     * @returns {Promise<String>}
     */
    async initialize() {
        await super.initialize();

        this.state.player.username =
            this.bot?.username || null;

        return Result.SUCCESS;
    }

    /**
     * Gửi chat message.
     *
     * @param {String} message
     * @returns {Promise<String>}
     */
    async chat(message) {

        if (!message) {
            throw new Error(
                'PlayerService.chat requires message.'
            );
        }

        if (!this.bot) {
            return Result.NOT_CONNECTED;
        }

        this.bot.chat(message);

        return Result.SUCCESS;
    }

    /**
     * Gửi command.
     *
     * @param {String} command
     * @param {Object} options
     *
     * @returns {Promise<String>}
     */
    async command(command, options = {}) {

        if (!command) {
            throw new Error(
                'PlayerService.command requires command.'
            );
        }

        if (!this.bot) {
            return Result.NOT_CONNECTED;
        }

        const message =
            options.prefix === false
                ? command
                : command.startsWith('/')
                    ? command
                    : `/${command}`;

        this.bot.chat(message);

        return Result.SUCCESS;
    }

    /**
     * Lấy vị trí hiện tại.
     *
     * @returns {Object|null}
     */
    position() {

        if (!this.bot?.entity?.position) {
            return null;
        }

        const pos = this.bot.entity.position;

        return {
            x: pos.x,
            y: pos.y,
            z: pos.z
        };
    }

    /**
     * Lấy entity player.
     *
     * @returns {*}
     */
    entity() {
        return this.bot?.entity || null;
    }

    /**
     * Lấy máu hiện tại.
     *
     * @returns {Number}
     */
    health() {

        if (!this.bot) {
            return 0;
        }

        return this.bot.health || 0;
    }

    /**
     * Lấy food level.
     *
     * @returns {Number}
     */
    food() {

        if (!this.bot) {
            return 0;
        }

        return this.bot.food || 0;
    }

    /**
     * Lấy gamemode.
     *
     * @returns {String|null}
     */
    gamemode() {

        if (!this.bot?.game?.gameMode) {
            return null;
        }

        return this.bot.game.gameMode;
    }

    /**
     * Ping server.
     *
     * @returns {Number}
     */
    ping() {

        if (!this.bot) {
            return 0;
        }

        return this.bot.player?.ping || 0;
    }

    /**
     * Username.
     *
     * @returns {String|null}
     */
    username() {

        return this.bot?.username || null;
    }

    /**
     * Item đang cầm.
     *
     * @returns {*}
     */
    heldItem() {

        if (!this.bot?.heldItem) {
            return null;
        }

        return {
            name: this.bot.heldItem.name,
            count: this.bot.heldItem.count,
            slot: this.bot.heldItem.slot
        };
    }

    /**
     * Nhìn theo yaw pitch.
     *
     * @param {Number} yaw
     * @param {Number} pitch
     *
     * @returns {Promise<String>}
     */
    async look(yaw, pitch) {

        if (!this.bot) {
            return Result.NOT_CONNECTED;
        }

        await this.bot.look(
            yaw,
            pitch
        );

        return Result.SUCCESS;
    }

    /**
     * Swing tay.
     *
     * @returns {Promise<String>}
     */
    async swing() {

        if (!this.bot) {
            return Result.NOT_CONNECTED;
        }

        this.bot.swingArm();

        return Result.SUCCESS;
    }

    /**
     * Jump.
     *
     * @returns {Promise<String>}
     */
    async jump() {

        if (!this.bot) {
            return Result.NOT_CONNECTED;
        }

        await this.bot.setControlState(
            'jump',
            true
        );

        await this.bot.waitForTicks(1);

        await this.bot.setControlState(
            'jump',
            false
        );

        return Result.SUCCESS;
    }

    /**
     * Chờ spawn.
     *
     * @param {Number} timeout
     *
     * @returns {Promise<String>}
     */
    async waitSpawn(timeout = 30000) {

        if (this.state.player.spawned) {
            return Result.ALREADY_DONE;
        }

        return new Promise(resolve => {

            let timer;

            const handler = () => {

                clearTimeout(timer);

                this.bot.removeListener(
                    'spawn',
                    handler
                );

                resolve(Result.SUCCESS);
            };

            this.bot.once(
                'spawn',
                handler
            );

            timer = setTimeout(() => {

                this.bot.removeListener(
                    'spawn',
                    handler
                );

                resolve(Result.TIMEOUT);

            }, timeout);

        });
    }

    /**
     * Chờ respawn.
     *
     * @param {Number} timeout
     *
     * @returns {Promise<String>}
     */
    async waitRespawn(timeout = 30000) {

        return this.waitSpawn(timeout);
    }

    /**
     * Player chết.
     *
     * @returns {Boolean}
     */
    dead() {

        return Boolean(
            this.state.player.dead
        );
    }

    /**
     * Player sống.
     *
     * @returns {Boolean}
     */
    alive() {

        return !this.dead();
    }

}

module.exports = PlayerService;