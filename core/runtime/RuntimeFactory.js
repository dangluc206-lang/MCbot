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
            lastActionBar: null,


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

        /** Minecraft command-channel cooldown and diagnostics. */
        chat: {
            lastCommandAt: null,
            lastCommand: null,
            lastGuiClosedAt: null,
            nextCommandAt: null
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

            lastCollectAt: null,

            lastStorageSellAt: null,

            lastStorageSellResult: null,

            guiBackoffUntil: null,

            lastGuiFailure: null
        },

        /**
         * Storage Runtime
         */
        storage: {

            selling: false,

            selectedOres: [],
            sellCommand: '/kho sell',
            lastSell: 0,
            full: false,
            lastGuiProbe: null,
            capacityReservation: {
                status: 'IDLE',
                targets: [],
                additionalStorageUnits: 0,
                requiredFree: null,
                free: null,
                updatedAt: null
            },
            gui: {
                title: null,
                rawTitle: null,
                usedSlots: 0,
                totalSlots: 0,
                filledSegments: 0,
                totalSegments: 0,
                full: false,
                detail: {
                    slot: 49,
                    available: false,
                    itemName: null,
                    displayName: null,
                    lines: [],
                    status: null,
                    amount: null,
                    capacity: null,
                    storage: {
                        total: null,
                        used: null,
                        free: null,
                        usedPercent: null,
                        freePercent: null
                    },
                    rawNbt: null,
                    rawComponents: null
                },
                items: [],
                updatedAt: null
            }
        },

        /** Raw-smelting workflow executed after a successful /kho refresh. */
        smelting: {
            status: 'IDLE',
            pass: 0,
            lastRunAt: null,
            lastError: null,
            lastSkipReason: null
        },

        /** Block-to-ingot workflow executed after a successful /kho refresh. */
        materialConversion: {
            status: 'IDLE',
            direction: null,
            targets: [],
            converted: [],
            current: null,
            lastRunAt: null,
            lastError: null
        },

        /**
         * Personal Vault Runtime (/pv 2)
         */
        personalVault: {
            command: '/pv 2',
            status: 'IDLE',
            items: [],
            updatedAt: null,
            lastError: null,
            lastNotice: null,
            lastWithdrawal: null,
            lastDeposit: null,
            nextCommandAt: null
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

        crafting: {
            active: false,
            status: 'IDLE',
            targetName: null,
            targetItemKey: null,
            targetCount: 0,
            completedActions: 0,
            totalActions: 0,
            currentSlot: null,
            clickRetryCount: 0,
            error: null,
            materials: [],
            materialLedger: {
                updatedAt: null,
                entries: [],
                total: 0
            },
            ledgerUpdatedAt: null,
            existingItems: [],
            personalVaultCheckedAt: null,
            personalVaultWithdrawals: [],
            partial: false,
            deferredActions: [],
            shiftReplanCount: 0,
            inventoryPressureReplanCount: 0,
            lastShiftCraft: null,
            lastPersonalVaultAudit: null,
            lastSuccessfulTargetAt: null,
            nextTargetAttemptAt: null,
            storageCheckedAt: null,
            smeltingPass: 0,
            updatedAt: null
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
