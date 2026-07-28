'use strict';

const States = require('../constants/States');

/**
 * Tạo Runtime mặc định cho toàn bộ Framework.
 *
 * Runtime chỉ chứa state.
 * Không chứa method.
 * Không chứa logic.
 *
 * @returns {Object}
 */
function createRuntime() {
    return {
        /**
         * Thời gian khởi động Framework.
         */
        startedAt: null,

        /**
         * Thời điểm kết nối gần nhất.
         */
        connectedAt: null,

        /**
         * Connection Runtime
         */
        connection: {
            state: States.Connection.DISCONNECTED,
            reconnectCount: 0,
            lastDisconnect: null,
            lastKickReason: null,
            resourcePackAccepted: false
        },

        /**
         * Engine Runtime
         */
        engine: {
            state: States.Engine.IDLE,
            tick: 0,
            running: false,
            lastError: null
        },

        /**
         * Player Runtime
         */
        player: {
            username: null,
            uuid: null,

            entity: null,

            health: 20,
            food: 20,
            experience: 0,
            level: 0,

            position: null,
            rotation: null,
            yaw: 0,
            pitch: 0,


            dead: false,

            spawned: false
        },

        /**
         * SkyBlock Runtime
         */
        skyblock: {
            loggedIn: false,
            joined: false,
            resourcePackAccepted: false,
            lastLogin: 0,
            islandReady: false,
            workflow: {
                step: 'IDLE',
                status: 'idle',
                message: 'Chưa bắt đầu vào SkyBlock.',
                startedAt: null,
                updatedAt: null,
                error: null
            }
        },

        /**
         * GUI Runtime
         */
        gui: {
            opened: false,
            title: null,
            window: null,
            slots: [],
            clickedSlot: null,
            lastUpdate: null
        },

        /**
         * Inventory Runtime
         */
        inventory: {
            items: [],
            emptySlots: 36,
            full: false,
            selectedSlot: 0,
            heldItem: null
        },

        /**
         * Mode Runtime
         */
        mode: {
            current: null,
            previous: null,
            state: States.Mode.IDLE
        },
        recovery: {
            required: false,
            running: false,
            reason: null,
            lastRecovery: null
        },

        watchdog: {
            enabled: true,

            lastTick: 0,

            state: States.Watchdog.HEALTHY,

            lastHeartbeat: null,

            recovering: false
        },
        /**
         * Collector Runtime
         */
        collector: {
            state: States.Collector.IDLE,

            running: false,

            paused: false,

            collected: 0,

            lastCollectAt: null
        },

        /**
         * Storage Runtime
         */
        storage: {

            selling: false,

            selectedOres: [],
            sellCommand: '/kho sell',
            lastSell: 0
        },

        /**
         * Dungeon Runtime
         */
        dungeon: {
            state: States.Dungeon.IDLE,

            running: false,

            deaths: 0,

            waitingRespawn: false
        },

        fishing: {
            state: 'IDLE',
            running: false
        },

        /**
         * Mining Runtime
         */
        mining: {
            state: States.Mining.IDLE,

            holding: null
        },

        /**
         * Task Runtime
         */
        task: {
            id: null,

            name: null,

            state: States.Task.IDLE,

            startedAt: null
        },

        /**
         * Metrics
         */
        metrics: {
            reconnects: 0,

            deaths: 0,

            sells: 0,

            collectedItems: 0,

            runtime: 0
        },
        bot: {
            connected: false,
            reconnecting: false,
            sessionId: 0
        },
        
    };
}

module.exports = createRuntime;
