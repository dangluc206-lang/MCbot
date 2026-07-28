'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');
const TimeoutError = require('../core/errors/TimeoutError');

/**
 * ============================================================================
 * SkyBlockService
 * ============================================================================
 *
 * Quản lý trạng thái SkyBlock.
 *
 * Trách nhiệm:
 * - Theo dõi login Hypixel.
 * - Kiểm tra đã vào SkyBlock chưa.
 * - Gửi lệnh join.
 * - Đồng bộ Runtime SkyBlock.
 *
 * Không:
 * - Chứa workflow Mode.
 * - Tự Recovery.
 * - Điều khiển Engine.
 *
 * ============================================================================
 */
class SkyBlockService extends BaseService {

    constructor(ctx) {
        super(ctx);

        this.name = 'SkyBlockService';

        this.events = ctx.getManager('events');

        this.scheduler = ctx.getManager('scheduler');

        this.loginTimeout = 15000;
        this.joinTimeout = 15000;
        this.workflowTask = null;
        this.islandVisitTask = null;
        this.cancelled = false;
        this.postIslandDiagnostics = null;
    }


    /**
     * Initialize.
     *
     * @returns {Promise<String>}
     */
    async initialize() {

        await super.initialize();

        this.bindEvents();
        this.setWorkflow('WAIT_CONNECTION', 'waiting', 'Đang chờ kết nối tới Minecraft server.');

        return Result.SUCCESS;

    }


    /**
     * Bind Bot Events.
     */
    bindEvents() {

        if (!this.bot) {
            return;
        }


        this.bind(this.bot, 'resourcePack', () => this.acceptResourcePack());
        this.bind(this.bot, 'spawn', () => this.onSpawn());
        this.bind(this.bot, 'kicked', reason => this.connectionFailed(
            'CONNECTION_FAILED',
            `Bot bị kick: ${this.formatServerReason(reason)}`
        ));
        this.bind(this.bot, 'end', reason => this.connectionFailed(
            'CONNECTION_ENDED',
            `Kết nối đã đóng: ${this.formatServerReason(reason || 'unknown')}`
        ));
        this.bind(this.bot, 'error', error => this.connectionFailed(
            'CONNECTION_ERROR',
            `Lỗi kết nối: ${error.message}`,
            error
        ));


        this.bind(this.bot, 'message', message => {

            const text =
                message.toString();


            this.detectMessage(text);

        });

    }

    configForWorkflow() {
        return this.config.skyblock || {};
    }

    setWorkflow(step, status, message, error = null) {
        const workflow = this.state.skyblock.workflow;
        workflow.step = step;
        workflow.status = status;
        workflow.message = message;
        workflow.updatedAt = Date.now();
        workflow.error = error ? error.message : null;

        const level = status === 'failed' ? 'error' : status === 'complete' ? 'success' : 'info';
        this[level](`[SkyBlock] ${step}: ${message}`);
    }

    connectionFailed(step, message, error = null) {
        this.cancelled = true;
        this.state.skyblock.joined = false;
        this.state.skyblock.loggedIn = false;
        this.state.skyblock.islandReady = false;
        this.setWorkflow(step, 'failed', message, error);
    }

    formatServerReason(reason) {
        if (typeof reason === 'string') return reason;
        if (reason?.toString && reason.toString() !== '[object Object]') return reason.toString();
        return this.readText(reason) || JSON.stringify(reason);
    }

    status() {
        return { ...this.state.skyblock.workflow, joined: this.state.skyblock.joined };
    }

    acceptResourcePack() {
        this.setWorkflow('ACCEPT_RESOURCE_PACK', 'running', 'Server yêu cầu Resource Pack; đang chấp nhận.');
        if (typeof this.bot.acceptResourcePack !== 'function') {
            this.setWorkflow('ACCEPT_RESOURCE_PACK', 'failed', 'Mineflayer không hỗ trợ chấp nhận Resource Pack.');
            return;
        }

        try {
            this.bot.acceptResourcePack();
            this.state.skyblock.resourcePackAccepted = true;
            this.state.connection.resourcePackAccepted = true;
            this.setWorkflow('WAIT_RESOURCE_PACK', 'waiting', 'Đã chấp nhận Resource Pack; chờ server hoàn tất.');
        } catch (error) {
            this.setWorkflow('ACCEPT_RESOURCE_PACK', 'failed', 'Không thể chấp nhận Resource Pack.', error);
        }
    }

    onSpawn() {
        if (this.state.skyblock.workflow.status === 'waiting' &&
            this.state.skyblock.workflow.step === 'WAIT_RESOURCE_PACK') {
            this.setWorkflow('WAIT_RESOURCE_PACK', 'complete', 'Resource Pack đã hoàn tất; bot đã spawn.');
        }

        if (this.configForWorkflow().autoJoinOnSpawn === true &&
            !this.state.skyblock.joined && !this.workflowTask) {
            this.startJoin('auto').catch(error => this.error(error));
        }
    }


    /**
     * Detect SkyBlock message.
     *
     * @param {String} message
     */
    detectMessage(message) {

        if (!message) {
            return;
        }


        if (this.postIslandDiagnostics) {
            this.info(`[After slot 19] Server message: ${message}`);
        }

        const lower = message.toLowerCase();
        const settings = this.configForWorkflow();
        const loginPatterns = settings.loginSuccessPatterns || [
            'logged in', 'login successful', 'đăng nhập thành công', 'đã đăng nhập'
        ];
        const joinedPatterns = settings.joinedPatterns || [
            'đã vào skyblock', 'welcome to skyblock', 'skyblock profile', 'your island'
        ];

        if (loginPatterns.some(pattern => lower.includes(pattern.toLowerCase()))) {
            this.state.skyblock.loggedIn = true;
            this.state.skyblock.lastLogin = Date.now();
            this.emit(Events.SkyBlock.LOGGED);
        }


        /**
         * Hypixel SkyBlock join message.
         */
        if (joinedPatterns.some(pattern => lower.includes(pattern.toLowerCase()))) {
            this.confirmJoined('Server xác nhận đã vào SkyBlock.');
        }

    }

    confirmJoined(message) {
        if (this.state.skyblock.joined) return;

        this.state.skyblock.joined = true;
        this.state.skyblock.islandReady = false;
        this.setWorkflow('VERIFY_SKYBLOCK', 'complete', message);
        this.islandVisitTask = this.goToIsland()
            .finally(() => { this.islandVisitTask = null; });
        this.emit(Events.SkyBlock.JOINED);
    }


    /**
     * Kiểm tra đã login.
     *
     * @returns {Boolean}
     */
    isLoggedIn() {

        return this.state.skyblock.loggedIn;

    }


    /**
     * Kiểm tra đang trong SkyBlock.
     *
     * @returns {Boolean}
     */
    isJoined() {

        return this.state.skyblock.joined;

    }


    /**
     * Join SkyBlock.
     *
     * @returns {Promise<String>}
     */
    async join() {

        if (!this.bot) {
            return Result.FAILED;
        }


        if (this.isJoined()) {

            return Result.ALREADY_DONE;

        }


        try {

            this.emit(
                Events.SkyBlock.JOIN
            );


            this.bot.chat(
                '/skyblock'
            );


            return Result.SUCCESS;

        }
        catch (error) {

            this.error(error);

            return Result.FAILED;

        }

    }

    async startJoin(source = 'manual', overrides = {}) {
        if (this.state.skyblock.joined) {
            return Result.ALREADY_DONE;
        }

        if (this.workflowTask) {
            return Result.BUSY;
        }

        this.cancelled = false;
        this.state.skyblock.workflow.startedAt = Date.now();
        this.workflowTask = this.runJoinWorkflow(source, overrides)
            .catch(error => {
                this.setWorkflow(this.state.skyblock.workflow.step, 'failed', error.message, error);
                return Result.FAILED;
            })
            .finally(() => { this.workflowTask = null; });

        return Result.PENDING;
    }

    async runJoinWorkflow(source, overrides = {}) {
        const settings = { ...this.configForWorkflow(), ...overrides };
        const gui = this.service('gui');
        const password = settings.loginPassword || process.env.SKYBLOCK_LOGIN_PASSWORD;

        if (!this.state.bot.connected) {
            throw new Error('Bot chưa kết nối tới server.');
        }

        this.setWorkflow('BOT_CONNECTED', 'complete', `Bot đã kết nối (khởi chạy: ${source}).`);
        await this.delay(settings.afterSpawnDelayMs ?? 1000);
        this.throwIfCancelled();

        if (password) {
            this.setWorkflow('LOGIN', 'running', 'Đang gửi /login.');
            this.bot.chat(`/login ${password}`);
            this.setWorkflow('WAIT_LOGIN', 'waiting', 'Đang chờ server xác nhận login thành công.');
            await this.waitForLoggedIn(settings.loginTimeoutMs ?? this.loginTimeout);
            this.setWorkflow('WAIT_LOGIN', 'complete', 'Server đã xác nhận login thành công.');
            await this.delay(settings.afterLoginDelayMs ?? 1000);
        } else {
            this.state.skyblock.loggedIn = true;
            this.setWorkflow('LOGIN', 'skipped', 'Không có SKYBLOCK_LOGIN_PASSWORD; bỏ qua /login.');
        }

        this.throwIfCancelled();
        this.setWorkflow('OPEN_SKYBLOCK_MENU', 'running', 'Đang gửi /skyblock.');
        this.bot.chat('/skyblock');
        const firstWindow = await this.waitForWindow(gui, null, settings.guiTimeoutMs ?? 10000);
        this.setWorkflow('SKYBLOCK_MENU_OPEN', 'complete', this.describeWindow(firstWindow, settings.serverSlot ?? 12));

        this.throwIfCancelled();
        this.setWorkflow('SELECT_SKYBLOCK_SERVER', 'running', `Đang click slot ${settings.serverSlot ?? 12}.`);
        await this.clickRequired(gui, settings.serverSlot ?? 12);
        const secondWindow = await this.waitForWindow(gui, firstWindow, settings.guiTimeoutMs ?? 10000);
        this.setWorkflow('ISLAND_MENU_OPEN', 'complete', this.describeWindow(secondWindow, settings.islandSlot ?? 19));

        this.throwIfCancelled();
        const guiDelay = settings.afterGuiOpenDelayMs ?? 1000;
        this.setWorkflow('WAIT_ISLAND_MENU_READY', 'waiting', `Chờ ${guiDelay} ms để menu đảo sẵn sàng.`);
        await this.delay(guiDelay);
        this.throwIfCancelled();
        await this.selectIsland(gui, secondWindow, settings.islandSlot ?? 19, settings.islandClickAttempts ?? 3);
        this.setWorkflow('WAIT_TELEPORT', 'waiting', 'Đang chờ teleport tới đảo.');
        this.startPostIslandDiagnostics();

        await this.waitForJoined(settings.joinTimeoutMs ?? this.joinTimeout);
        return Result.SUCCESS;
    }

    async clickRequired(gui, slot) {
        const result = await gui.click(slot);
        if (result !== Result.SUCCESS) throw new Error(`Không click được slot ${slot}: ${result}`);
    }

    async selectIsland(gui, window, slot, attempts) {
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            this.setWorkflow(
                'SELECT_PLAYER_ISLAND',
                'running',
                `Đang click slot ${slot} (lần ${attempt}/${attempts}).`
            );
            await this.clickRequired(gui, slot);

            if (attempt === attempts) return;

            await this.delay(1000);
            this.throwIfCancelled();
            if (this.isJoined()) return;
            if (gui.window() !== window) {
                this.info('[SkyBlock] Menu đảo đã thay đổi sau click; dừng click lặp.');
                return;
            }

            this.warn(`[SkyBlock] Menu đảo vẫn mở sau lần ${attempt}; thử click lại.`);
        }
    }

    describeWindow(window, slot) {
        const rawTitle = window?.title;
        const title = this.readText(rawTitle) || '(không có title)';
        if (slot < 0) return `GUI "${title}"`;

        const item = window?.slots?.[slot];
        const itemName = item?.displayName || item?.name || '(slot trống)';
        return `GUI "${title}" đã mở; slot ${slot}: ${itemName}.`;
    }

    waitForWindow(gui, previousWindow, timeout) {
        if (gui.window() && gui.window() !== previousWindow) return Promise.resolve(gui.window());
        return new Promise((resolve, reject) => {
            const handler = window => {
                if (window === previousWindow) return;
                clearTimeout(timer);
                this.events.off(Events.GUI.OPEN, handler);
                resolve(window);
            };
            const timer = setTimeout(() => {
                this.events.off(Events.GUI.OPEN, handler);
                reject(new TimeoutError('SkyBlock GUI', timeout));
            }, timeout);
            this.events.on(Events.GUI.OPEN, handler);
        });
    }

    waitForJoined(timeout) {
        if (this.isJoined()) return Promise.resolve(Result.SUCCESS);
        return new Promise((resolve, reject) => {
            const joinedHandler = () => finish(Result.SUCCESS);
            const teleportHandler = () => {
                this.confirmJoined('Server đã teleport bot tới SkyBlock.');
                finish(Result.SUCCESS);
            };
            const scoreboardHandler = () => {
                const text = this.scoreboardText();
                if (this.matchesSkyBlock(text)) {
                    this.confirmJoined(`Scoreboard xác nhận SkyBlock: ${text}`);
                    finish(Result.SUCCESS);
                }
            };
            const closeHandler = () => {
                // Sau click slot đảo, GUI đóng là tín hiệu server đã nhận lựa chọn.
                // Chờ ngắn để ưu tiên teleport/scoreboard nếu chúng đến ngay sau đó.
                setTimeout(() => {
                    if (!this.isJoined() && !this.bot.currentWindow) {
                        this.confirmJoined('GUI chọn đảo đã đóng sau khi chọn đảo.');
                        finish(Result.SUCCESS);
                    }
                }, 250);
            };
            const connectionHandler = reason => finishError(new Error(
                `Mất kết nối khi chờ teleport: ${this.formatServerReason(reason || 'unknown')}`
            ));
            const finish = result => {
                clearTimeout(timer);
                this.events.off(Events.SkyBlock.JOINED, joinedHandler);
                this.bot.removeListener('forcedMove', teleportHandler);
                this.bot.removeListener('scoreboardPosition', scoreboardHandler);
                this.bot.removeListener('scoreboardTitleChanged', scoreboardHandler);
                this.bot.removeListener('kicked', connectionHandler);
                this.bot.removeListener('end', connectionHandler);
                this.events.off(Events.GUI.CLOSE, closeHandler);
                this.stopPostIslandDiagnostics();
                resolve(result);
            };
            const finishError = error => {
                clearTimeout(timer);
                this.events.off(Events.SkyBlock.JOINED, joinedHandler);
                this.bot.removeListener('forcedMove', teleportHandler);
                this.bot.removeListener('scoreboardPosition', scoreboardHandler);
                this.bot.removeListener('scoreboardTitleChanged', scoreboardHandler);
                this.bot.removeListener('kicked', connectionHandler);
                this.bot.removeListener('end', connectionHandler);
                this.events.off(Events.GUI.CLOSE, closeHandler);
                this.stopPostIslandDiagnostics();
                reject(error);
            };
            const timer = setTimeout(() => {
                finishError(new TimeoutError('SkyBlock teleport confirmation', timeout));
            }, timeout);
            this.events.on(Events.SkyBlock.JOINED, joinedHandler);
            this.bot.once('forcedMove', teleportHandler);
            this.bot.on('scoreboardPosition', scoreboardHandler);
            this.bot.on('scoreboardTitleChanged', scoreboardHandler);
            this.bot.once('kicked', connectionHandler);
            this.bot.once('end', connectionHandler);
            this.events.on(Events.GUI.CLOSE, closeHandler);
            scoreboardHandler();
        });
    }

    scoreboardText() {
        const sidebar = this.bot.scoreboard?.sidebar;
        if (!sidebar) return '';
        return [sidebar.title, ...(sidebar.items || []).map(item => item.name || item.displayName || item)]
            .map(value => this.readText(value))
            .join(' ')
            .toLowerCase();
    }

    readText(value) {
        if (typeof value === 'string') return value;
        if (!value) return '';

        const raw = JSON.stringify(value);
        const matches = [
            ...raw.matchAll(/"text"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g),
            ...raw.matchAll(/"text"\s*:\s*\{\s*"type"\s*:\s*"string"\s*,\s*"value"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g)
        ];

        return matches
            .map(match => JSON.parse(`"${match[1]}"`))
            .join('');
    }

    matchesSkyBlock(text) {
        const patterns = this.configForWorkflow().scoreboardPatterns || ['skyblock'];
        return patterns.some(pattern => text.includes(String(pattern).toLowerCase()));
    }

    startPostIslandDiagnostics() {
        this.stopPostIslandDiagnostics();

        const cleanups = [];
        let moveCount = 0;
        const on = (emitter, event, handler) => {
            emitter.on(event, handler);
            cleanups.push(() => emitter.removeListener(event, handler));
        };
        const snapshot = label => {
            const position = this.bot.entity?.position;
            const formattedPosition = position
                ? `${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`
                : 'unknown';
            const window = this.bot.currentWindow;
            const title = window ? this.describeWindow(window, -1) : 'none';
            const scoreboard = this.scoreboardText() || 'none';
            this.info(`[After slot 19] ${label} | position=${formattedPosition} | window=${title} | scoreboard=${scoreboard}`);
        };

        this.postIslandDiagnostics = { cleanups, snapshot };
        snapshot('snapshot immediately after click');

        on(this.bot, 'forcedMove', () => snapshot('forcedMove (server teleport)'));
        on(this.bot, 'respawn', () => snapshot('respawn'));
        on(this.bot, 'windowOpen', window => this.info(
            `[After slot 19] windowOpen: ${this.describeWindow(window, -1)}`
        ));
        on(this.bot, 'windowClose', () => snapshot('windowClose'));
        on(this.bot, 'scoreboardPosition', () => snapshot('scoreboardPosition'));
        on(this.bot, 'scoreboardTitleChanged', () => snapshot('scoreboardTitleChanged'));
        on(this.bot, 'move', () => {
            moveCount += 1;
            if (moveCount <= 3) snapshot(`move #${moveCount}`);
        });

        for (const delay of [1000, 3000, 7000]) {
            const timer = setTimeout(() => {
                if (this.postIslandDiagnostics?.snapshot === snapshot) {
                    snapshot(`snapshot after ${delay} ms`);
                }
            }, delay);
            cleanups.push(() => clearTimeout(timer));
        }
    }

    stopPostIslandDiagnostics() {
        if (!this.postIslandDiagnostics) return;
        this.postIslandDiagnostics.snapshot('final snapshot');
        for (const cleanup of this.postIslandDiagnostics.cleanups) cleanup();
        this.postIslandDiagnostics = null;
    }

    waitForLoggedIn(timeout) {
        if (this.isLoggedIn()) return Promise.resolve(Result.SUCCESS);
        return new Promise((resolve, reject) => {
            const handler = () => {
                clearTimeout(timer);
                this.events.off(Events.SkyBlock.LOGGED, handler);
                resolve(Result.SUCCESS);
            };
            const timer = setTimeout(() => {
                this.events.off(Events.SkyBlock.LOGGED, handler);
                reject(new TimeoutError('login confirmation', timeout));
            }, timeout);
            this.events.on(Events.SkyBlock.LOGGED, handler);
        });
    }

    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    throwIfCancelled() {
        if (this.cancelled) throw new Error('Đã hủy tiến trình vào SkyBlock.');
    }

    cancelJoin() {
        if (!this.workflowTask) return Result.NO_ACTION;
        this.cancelled = true;
        this.setWorkflow(this.state.skyblock.workflow.step, 'cancelled', 'Đã yêu cầu hủy tiến trình.');
        return Result.SUCCESS;
    }


    /**
     * Đảm bảo Bot đã vào SkyBlock.
     *
     * Dùng bởi RecoveryManager.
     *
     * @returns {Promise<String>}
     */
    async ensureJoined() {

        if (this.isJoined()) {

            return Result.ALREADY_DONE;

        }


        if (!this.isLoggedIn()) {

            return Result.NOT_LOGGED_IN;

        }


        return this.join();

    }

    async goToIsland() {
        if (!this.state.bot.connected || !this.isJoined()) {
            return Result.NOT_IN_SKYBLOCK;
        }

        const settings = this.configForWorkflow();
        const command = settings.islandCommand || '/is';
        const delay = settings.islandTeleportDelayMs ?? 1000;

        this.info(`[SkyBlock] Đang gửi ${command} sau khi vào SkyBlock.`);
        this.bot.chat(command);
        await this.delay(delay);
        if (!this.state.bot.connected || !this.isJoined()) {
            return Result.DISCONNECTED;
        }
        this.state.skyblock.islandReady = true;
        this.info(`[SkyBlock] Đã chờ ${delay} ms cho teleport về đảo.`);

        return Result.SUCCESS;
    }

    async waitForIsland() {
        if (this.islandVisitTask) return this.islandVisitTask;
        return this.state.skyblock.islandReady ? Result.SUCCESS : Result.SUCCESS;
    }


    /**
     * Chờ SkyBlock join.
     *
     * @param {Number} timeout
     *
     * @returns {Promise<String>}
     */
    async waitJoined(timeout = this.loginTimeout) {

        if (this.isJoined()) {

            return Result.SUCCESS;

        }


        return new Promise((resolve, reject) => {

            const handler = () => {

                clearTimeout(timer);

                resolve(
                    Result.SUCCESS
                );

            };


            this.events.once(
                Events.SkyBlock.JOINED,
                handler
            );


            const timer = setTimeout(() => {

                this.events.off(
                    Events.SkyBlock.JOINED,
                    handler
                );


                reject(
                    new TimeoutError(
                        'SkyBlock join',
                        timeout
                    )
                );


            }, timeout);

        });

    }


    /**
     * Rời SkyBlock.
     *
     * @returns {String}
     */
    leave() {

        this.state.skyblock.joined = false;


        this.emit(
            Events.SkyBlock.LEAVE
        );


        return Result.SUCCESS;

    }


    /**
     * Emit Event.
     */
    emit(event, ...args) {

        if (this.events?.emit) {

            this.events.emit(
                event,
                ...args
            );

        }

    }


    /**
     * Destroy.
     */
    async destroy() {
        this.cancelJoin();
        this.stopPostIslandDiagnostics();
        await super.destroy();

        return Result.SUCCESS;

    }

}


module.exports = SkyBlockService;
