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

        this.joinTimeout = 15000;
        this.workflowTask = null;
        this.joinRequested = false;
        this.connectionFailureHandled = false;
        this.islandVisitTask = null;
        this.cancelled = false;
        this.postIslandDiagnostics = null;
        this.leaveCheckTimer = null;
        this.leaveRecoveryTimer = null;
        this.joinNotBefore = 0;
        this.leaveMonitorTimer = null;
    }


    /**
     * Initialize.
     *
     * @returns {Promise<String>}
     */
    async initialize() {

        await super.initialize();

        this.bindEvents();
        this.startLeaveMonitor();
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
        this.bind(this.bot, 'login', () => this.onMinecraftConnected());
        this.bind(this.bot, 'spawn', () => this.onSpawn());
        this.bind(this.bot, 'forcedMove', () => this.scheduleLeaveCheck('server teleport'));
        this.bind(this.bot, 'respawn', () => this.scheduleLeaveCheck('respawn'));
        this.bind(this.bot, 'scoreboardPosition', () => this.scheduleLeaveCheck('scoreboard update'));
        this.bind(this.bot, 'scoreboardTitleChanged', () => this.scheduleLeaveCheck('scoreboard title update'));
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
        // Mineflayer normally emits kicked/error and then end for the same
        // socket loss. Keep the first, useful reason instead of overwriting it
        // with a second noisy CONNECTION_ENDED entry.
        if (this.connectionFailureHandled) return;
        this.connectionFailureHandled = true;
        this.cancelled = true;
        // `error` is emitted before `end` for a timed-out socket. Make the
        // runtime offline immediately so modes cannot start a stale join.
        this.state.bot.connected = false;
        this.clearLeaveRecovery();
        this.state.skyblock.joined = false;
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

    /** True only while an explicit SkyBlock workflow is expected to finish. */
    isJoinRequested() {
        return this.joinRequested;
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

    /** Resets per-connection login state after Mineflayer establishes TCP/login. */
    onMinecraftConnected() {
        this.cancelled = false;
        this.connectionFailureHandled = false;
        this.clearLeaveRecovery();
        this.state.skyblock.joined = false;
        this.state.skyblock.islandReady = false;
    }

    /**
     * Sends /login once for the current Minecraft connection. It is invoked
     * from spawn and can be awaited by a SkyBlock workflow, but never repeats
     * merely because joining SkyBlock needs another attempt.
     */
    async startConnectionLogin(source = 'connection', overrides = {}) {
        const login = this.service('minecraftLogin');
        return login?.start ? login.start() : Result.FAILED;

        // Login is allowed only from a fresh Mineflayer `spawn`. SkyBlock
        // join, retries and ensureJoined() may wait for it, but never send it.
        if (source !== 'spawn') return Result.NO_ACTION;
        if (!this.state.bot.connected) return Result.NOT_CONNECTED;
        if (this.isLoggedIn()) return Result.ALREADY_DONE;
        if (this.loginTask) return this.loginTask;
        if (this.loginAttemptedForConnection) return Result.NOT_LOGGED_IN;

        const connectionGeneration = this.connectionGeneration;
        this.loginAttemptedForConnection = true;
        this.loginTask = (async () => {
            const settings = { ...this.configForWorkflow(), ...overrides };
            const password = settings.loginPassword;
            if (!password) {
                if (!this.isCurrentConnection(connectionGeneration)) return Result.DISCONNECTED;
                this.state.skyblock.loggedIn = true;
                this.state.skyblock.lastLogin = Date.now();
                this.emit(Events.SkyBlock.LOGGED);
                this.setWorkflow('LOGIN', 'skipped', 'Không có SKYBLOCK_LOGIN_PASSWORD; bỏ qua /login.');
                return Result.SUCCESS;
            }

            await this.delay(settings.afterSpawnDelayMs ?? 1000);
            if (!this.isCurrentConnection(connectionGeneration)) return Result.DISCONNECTED;
            this.setWorkflow('LOGIN', 'running', `Đang gửi /login (${source}).`);
            const sent = await this.service('minecraftLogin').start();
            if (sent !== Result.SUCCESS) throw new Error(`Không thể gửi /login: ${sent}.`);
            this.setWorkflow('WAIT_LOGIN', 'waiting', 'Đang chờ server xác nhận login thành công.');
            await this.waitForLoggedIn(settings.loginTimeoutMs ?? this.loginTimeout);
            this.setWorkflow('WAIT_LOGIN', 'complete', 'Server đã xác nhận login thành công.');
            await this.delay(settings.afterLoginDelayMs ?? 1000);
            return Result.SUCCESS;
        })().catch(error => {
            if (this.cancelled || !this.state.bot.connected) return Result.DISCONNECTED;
            this.setWorkflow('WAIT_LOGIN', 'failed', `Login Minecraft thất bại: ${error.message}`, error);
            return Result.FAILED;
        });

        return this.loginTask;
    }

    isCurrentConnection(connectionGeneration) {
        return !this.cancelled &&
            this.state.bot.connected === true &&
            this.connectionGeneration === connectionGeneration;
    }

    async waitForLifecycleLogin(settings = this.configForWorkflow()) {
        const login = this.service('minecraftLogin');
        if (!login?.waitForAuthentication) return Result.NOT_LOGGED_IN;
        try {
            return await login.waitForAuthentication(settings.loginTimeoutMs ?? this.joinTimeout);
        } catch (_) {
            return Result.NOT_LOGGED_IN;
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

        /**
         * Hypixel SkyBlock join message.
         */
        if (joinedPatterns.some(pattern => lower.includes(pattern.toLowerCase()))) {
            this.confirmJoined('Server xác nhận đã vào SkyBlock.');
        }

    }

    confirmJoined(message) {
        if (this.state.skyblock.joined) return;

        this.clearLeaveRecovery();
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


            const serverCommands = this.service('serverCommands');
            return serverCommands?.openSkyBlockSelector
                ? serverCommands.openSkyBlockSelector()
                : Result.FAILED;

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

        // A forced return from SkyBlock must cool down before an automatic
        // retry. An explicit operator action may still start immediately.
        if (Date.now() < this.joinNotBefore && !this.isManualJoinSource(source)) {
            return Result.PENDING;
        }

        if (this.workflowTask) {
            return Result.BUSY;
        }

        const gui = this.service('gui');
        const acquired = gui?.acquire?.('skyblock');
        if (acquired && acquired !== Result.SUCCESS) return acquired;

        this.cancelled = false;
        this.joinRequested = true;
        this.state.skyblock.workflow.startedAt = Date.now();
        this.workflowTask = this.runJoinWorkflow(source, overrides)
            .catch(error => {
                if (this.cancelled || !this.state.bot.connected) return Result.DISCONNECTED;
                this.setWorkflow(this.state.skyblock.workflow.step, 'failed', error.message, error);
                return Result.FAILED;
            })
            .finally(() => {
                this.workflowTask = null;
                this.joinRequested = false;
                if (acquired === Result.SUCCESS) gui?.release?.('skyblock');
            });

        return Result.PENDING;
    }

    async runJoinWorkflow(source, overrides = {}) {
        const settings = { ...this.configForWorkflow(), ...overrides };
        const gui = this.service('gui');

        if (!this.state.bot.connected) {
            this.setWorkflow('WAIT_CONNECTION', 'waiting', 'Đang chờ Minecraft kết nối trước khi vào SkyBlock.');
            await this.waitForConnection(settings.connectionTimeoutMs ?? 30000);
        }

        this.setWorkflow('BOT_CONNECTED', 'complete', `Bot đã kết nối (khởi chạy: ${source}).`);
        const loginResult = Result.SUCCESS;
        if (loginResult !== Result.SUCCESS && loginResult !== Result.ALREADY_DONE) {
            throw new Error(`Minecraft chưa login: ${loginResult}.`);
        }

        let attempt = 0;
        while (!this.isJoined()) {
            this.throwIfCancelled();
            attempt += 1;
            try {
                await this.runJoinAttempt(gui, settings, attempt);
                return Result.SUCCESS;
            } catch (error) {
                this.throwIfCancelled();
                if (!this.state.bot.connected) throw error;

                const retryDelay = this.joinRetryDelayMs(settings);
                this.setWorkflow(
                    'RETRY_SKYBLOCK_JOIN',
                    'waiting',
                    `Lần ${attempt} chưa vào được SkyBlock (${error.message}); thử lại sau ${Math.ceil(retryDelay / 1000)} giây. Không gửi lại /login.`
                );
                await this.closeJoinWindow(gui);
                await this.delay(retryDelay);
            }
        }
        return Result.SUCCESS;
    }

    /** Executes exactly one /skyblock → server → island GUI attempt. */
    async runJoinAttempt(gui, settings, attempt) {
        this.throwIfCancelled();
        this.setWorkflow('OPEN_SKYBLOCK_MENU', 'running', `Đang gửi /skyblock (lần ${attempt}).`);
        const selectorSlot = this.selectorSlot();
        const islandSlot = this.islandSlot();
        let firstWaiting;
        const serverCommands = this.service('serverCommands');
        const sent = serverCommands?.openSkyBlockSelector
            ? await serverCommands.openSkyBlockSelector({
                beforeSend: () => { firstWaiting = this.waitForWindow(gui, null, settings.guiTimeoutMs ?? 10000); }
            })
            : Result.FAILED;
        if (sent !== Result.SUCCESS) {
            firstWaiting?.cancel();
            throw new Error(`Không thể gửi /skyblock: ${sent}.`);
        }
        if (!firstWaiting) throw new Error('Không thể đăng ký chờ selector SkyBlock.');
        const firstWindow = await firstWaiting.promise;
        this.setWorkflow('SKYBLOCK_MENU_OPEN', 'complete', this.describeWindow(firstWindow, selectorSlot));

        this.throwIfCancelled();
        this.setWorkflow('SELECT_SKYBLOCK_SERVER', 'running', `Đang click slot ${selectorSlot}.`);
        const secondWaiting = this.waitForWindow(gui, firstWindow, settings.guiTimeoutMs ?? 10000);
        if (!secondWaiting) throw new Error('Không thể đăng ký chờ menu đảo.');
        try {
            await this.clickRequired(gui, selectorSlot);
        } catch (error) {
            secondWaiting.cancel();
            throw error;
        }
        const secondWindow = await secondWaiting.promise;
        this.setWorkflow('ISLAND_MENU_OPEN', 'complete', this.describeWindow(secondWindow, islandSlot));

        this.throwIfCancelled();
        const guiDelay = settings.afterGuiOpenDelayMs ?? 1000;
        this.setWorkflow('WAIT_ISLAND_MENU_READY', 'waiting', `Chờ ${guiDelay} ms để menu đảo sẵn sàng.`);
        await this.delay(guiDelay);
        this.throwIfCancelled();
        await this.selectIsland(gui, secondWindow, islandSlot, settings.islandClickAttempts ?? 3);
        this.setWorkflow('WAIT_TELEPORT', 'waiting', 'Đang chờ teleport tới đảo.');
        this.startPostIslandDiagnostics();
        await this.waitForJoined(settings.joinTimeoutMs ?? this.joinTimeout);
    }

    /** Clears a stale GUI before retrying /skyblock. */
    async closeJoinWindow(gui) {
        if (!gui?.isOpen?.()) return;
        try {
            await gui.close();
        } catch (error) {
            this.warn(`[SkyBlock] Không thể đóng GUI cũ trước khi retry: ${error.message}`);
        }
    }

    waitForConnection(timeout) {
        if (this.state.bot.connected) return Promise.resolve(Result.SUCCESS);
        return new Promise((resolve, reject) => {
            const onConnected = () => finish(Result.SUCCESS);
            const finish = result => {
                clearTimeout(timer);
                this.events.off(Events.Connection.CONNECTED, onConnected);
                resolve(result);
            };
            const timer = setTimeout(() => {
                this.events.off(Events.Connection.CONNECTED, onConnected);
                reject(new TimeoutError('Minecraft connection', timeout));
            }, Math.max(1000, Number(timeout) || 30000));
            this.events.on(Events.Connection.CONNECTED, onConnected);
        });
    }

    joinRetryDelayMs(settings = this.configForWorkflow()) {
        const value = Number(settings.joinRetryDelayMs);
        return Number.isFinite(value) ? Math.min(Math.max(value, 1000), 60000) : 5000;
    }

    selectorSlot() {
        return configuredSlot(this.config.guiLayouts?.skyblock?.selectorSlot, this.config.skyblock?.serverSlot, 12);
    }

    islandSlot() {
        return configuredSlot(this.config.guiLayouts?.skyblock?.islandSlot, this.config.skyblock?.islandSlot, 19);
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
        if (gui.window() && gui.window() !== previousWindow) {
            return { promise: Promise.resolve(gui.window()), cancel: () => {} };
        }
        let cleanup;
        const promise = new Promise((resolve, reject) => {
            const handler = window => {
                if (window === previousWindow) return;
                cleanup();
                resolve(window);
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new TimeoutError('SkyBlock GUI', timeout));
            }, timeout);
            cleanup = () => {
                clearTimeout(timer);
                this.events.off(Events.GUI.OPEN, handler);
            };
            this.events.on(Events.GUI.OPEN, handler);
        });
        return { promise, cancel: () => cleanup?.() };
    }

    waitForJoined(timeout) {
        if (this.isJoined()) return Promise.resolve(Result.SUCCESS);
        return new Promise((resolve, reject) => {
            let closeConfirmTimer = null;
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
                clearTimeout(closeConfirmTimer);
                closeConfirmTimer = setTimeout(() => {
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
                clearTimeout(closeConfirmTimer);
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
                clearTimeout(closeConfirmTimer);
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
                cleanup();
                resolve(Result.SUCCESS);
            };
            const disconnected = reason => {
                cleanup();
                reject(new Error(`Minecraft connection ended before login${reason ? `: ${this.formatServerReason(reason)}` : '.'}`));
            };
            const cleanup = () => {
                clearTimeout(timer);
                this.events.off(Events.SkyBlock.LOGGED, handler);
                this.events.off(Events.Connection.ENDED, disconnected);
                this.events.off(Events.Connection.KICKED, disconnected);
                this.events.off(Events.Connection.ERROR, disconnected);
            };
            const timer = setTimeout(() => {
                cleanup();
                reject(new TimeoutError('login confirmation', timeout));
            }, timeout);
            this.events.on(Events.SkyBlock.LOGGED, handler);
            this.events.on(Events.Connection.ENDED, disconnected);
            this.events.on(Events.Connection.KICKED, disconnected);
            this.events.on(Events.Connection.ERROR, disconnected);
        });
    }

    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    throwIfCancelled() {
        if (this.cancelled) throw new Error('Đã hủy tiến trình vào SkyBlock.');
    }

    cancelJoin() {
        if (!this.workflowTask) return Result.NO_ACTION;
        this.cancelled = true;
        this.joinRequested = false;
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


        if (!this.state.bot.connected) return Result.NOT_CONNECTED;

        // A mode must not fire a bare /skyblock command and immediately fail
        // while the actual GUI workflow is still in progress. Await the shared
        // retrying workflow until the server confirms SkyBlock.
        const started = await this.startJoin('ensure-joined');
        if (started === Result.PENDING && !this.workflowTask) return Result.PENDING;
        if (started !== Result.PENDING && started !== Result.BUSY) return started;
        const workflow = this.workflowTask;
        if (workflow) await workflow;
        return this.isJoined() ? Result.SUCCESS : Result.FAILED;

    }

    async goToIsland() {
        if (!this.state.bot.connected || !this.isJoined()) {
            return Result.NOT_IN_SKYBLOCK;
        }

        const settings = this.configForWorkflow();
        const delay = settings.islandTeleportDelayMs ?? 1000;

        this.info('[SkyBlock] Đang gửi lệnh về đảo sau khi vào SkyBlock.');
        const serverCommands = this.service('serverCommands');
        const sent = serverCommands?.goIsland
            ? await serverCommands.goIsland()
            : Result.FAILED;
        if (sent !== Result.SUCCESS) return sent;
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
    async waitJoined(timeout = this.joinTimeout) {

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
    leave(reason = 'Server đưa bot ra khỏi SkyBlock') {

        if (!this.state.skyblock.joined) {
            return Result.NO_ACTION;
        }

        this.state.skyblock.joined = false;
        this.state.skyblock.islandReady = false;
        this.setWorkflow('LEFT_SKYBLOCK', 'waiting', `${reason}.`);

        this.emit(
            Events.SkyBlock.LEAVE,
            reason
        );

        return Result.SUCCESS;

    }

    /**
     * Debounces a presence check after a server teleport or scoreboard update.
     * A teleport alone is not proof because joining an island also teleports.
     */
    scheduleLeaveCheck(source) {
        if (!this.state.skyblock.joined || !this.state.bot.connected || this.leaveCheckTimer) return;
        const delay = this.leaveDetectionDelayMs();
        this.leaveCheckTimer = setTimeout(() => {
            this.leaveCheckTimer = null;
            this.evaluateSkyBlockPresence(source);
        }, delay);
        this.leaveCheckTimer.unref?.();
    }

    /**
     * Emits SkyBlock.LEAVE only when a non-empty scoreboard no longer matches
     * the configured SkyBlock markers. Empty/stale scoreboard data is ignored.
     */
    evaluateSkyBlockPresence(source = 'periodic scoreboard check') {
        if (!this.state.skyblock.joined || !this.state.bot.connected || this.workflowTask) {
            return Result.NO_ACTION;
        }

        const scoreboard = this.scoreboardText();
        if (!scoreboard || this.matchesSkyBlock(scoreboard)) return Result.NO_ACTION;

        const result = this.leave(`Xác nhận rời SkyBlock qua ${source}: ${scoreboard}`);
        if (result === Result.SUCCESS) this.scheduleLeaveRecovery();
        return result;
    }

    startLeaveMonitor() {
        if (this.leaveMonitorTimer) return;
        this.leaveMonitorTimer = setInterval(() => {
            this.evaluateSkyBlockPresence('periodic scoreboard check');
        }, this.leaveCheckIntervalMs());
        this.leaveMonitorTimer.unref?.();
    }

    scheduleLeaveRecovery() {
        if (this.leaveRecoveryTimer || !this.state.bot.connected) return;
        const delay = this.leaveRecoveryDelayMs();
        this.joinNotBefore = Date.now() + delay;
        this.info(`[SkyBlock] Rời SkyBlock nhưng vẫn còn kết nối; chờ ${Math.ceil(delay / 1000)} giây trước khi vào lại.`);
        this.leaveRecoveryTimer = setTimeout(() => {
            this.leaveRecoveryTimer = null;
            this.joinNotBefore = 0;
            if (!this.state.bot.connected || this.state.skyblock.joined) return;
            this.manager('recovery').request('SKYBLOCK_LEFT');
        }, delay);
        this.leaveRecoveryTimer.unref?.();
    }

    clearLeaveRecovery() {
        if (this.leaveCheckTimer) clearTimeout(this.leaveCheckTimer);
        if (this.leaveRecoveryTimer) clearTimeout(this.leaveRecoveryTimer);
        this.leaveCheckTimer = null;
        this.leaveRecoveryTimer = null;
        this.joinNotBefore = 0;
    }

    leaveDetectionDelayMs() {
        const value = Number(this.configForWorkflow().leaveDetectionDelayMs);
        return Number.isFinite(value) ? Math.min(Math.max(value, 0), 10000) : 1500;
    }

    leaveRecoveryDelayMs() {
        const value = Number(this.configForWorkflow().leaveRecoveryDelayMs);
        return Number.isFinite(value) ? Math.min(Math.max(value, 1000), 60000) : this.joinRetryDelayMs();
    }

    leaveCheckIntervalMs() {
        const value = Number(this.configForWorkflow().leaveCheckIntervalMs);
        return Number.isFinite(value) ? Math.min(Math.max(value, 1000), 60000) : 5000;
    }

    isManualJoinSource(source) {
        return ['manual', 'discord-panel'].includes(String(source));
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
        this.clearLeaveRecovery();
        if (this.leaveMonitorTimer) clearInterval(this.leaveMonitorTimer);
        this.leaveMonitorTimer = null;
        await super.destroy();

        return Result.SUCCESS;

    }

}


function configuredSlot(primary, legacy, fallback) {
    const value = primary ?? legacy ?? fallback;
    return Number.isInteger(value) && value >= 0 ? value : fallback;
}


module.exports = SkyBlockService;
