'use strict';

/**
 * ============================================================================
 * States
 * ============================================================================
 *
 * Trung tâm quản lý toàn bộ State của Framework.
 *
 * Quy tắc:
 * - Chỉ chứa hằng số.
 * - Không chứa logic.
 * - Không import bất kỳ module nào.
 * * Khi cần bổ sung State mới, luôn thêm vào đúng namespace.
 * Không sửa tên State đã public để tránh phá vỡ API.
 * ============================================================================
 */

const Engine = Object.freeze({
    IDLE: 'IDLE',
    STARTING: 'STARTING',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    STOPPING: 'STOPPING',
    STOPPED: 'STOPPED',
    RECOVERING: 'RECOVERING',
    ERROR: 'ERROR'
});

const Connection = Object.freeze({
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    RESOURCE_PACK: 'RESOURCE_PACK',
    SPAWNING: 'SPAWNING',
    READY: 'READY',
    KICKED: 'KICKED',
    ENDED: 'ENDED',
    RECONNECTING: 'RECONNECTING'
});

const SkyBlock = Object.freeze({
    NONE: 'NONE',
    LOGIN: 'LOGIN',
    LOGGED: 'LOGGED',
    JOINING: 'JOINING',
    JOINED: 'JOINED'
});

const Mode = Object.freeze({
    IDLE: 'IDLE',
    STARTING: 'STARTING',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    STOPPING: 'STOPPING',
    STOPPED: 'STOPPED',
    RECOVERING: 'RECOVERING',
    ERROR: 'ERROR'
});

const Collector = Object.freeze({
    IDLE: 'IDLE',
    MOVING: 'MOVING',
    COLLECTING: 'COLLECTING',
    WAITING: 'WAITING',
    INVENTORY_FULL: 'INVENTORY_FULL',
    SELLING: 'SELLING',
    RETURNING: 'RETURNING',
    PAUSED: 'PAUSED',
    STOPPED: 'STOPPED'
});

const Storage = Object.freeze({
    IDLE: 'IDLE',
    OPENING_GUI: 'OPENING_GUI',
    SELLING_INVENTORY: 'SELLING_INVENTORY',
    SELLING_STORAGE: 'SELLING_STORAGE',
    RETURNING: 'RETURNING',
    COMPLETED: 'COMPLETED',
    ERROR: 'ERROR'
});

const Dungeon = Object.freeze({
    IDLE: 'IDLE',
    ENTERING: 'ENTERING',
    RUNNING: 'RUNNING',
    FIGHTING: 'FIGHTING',
    WAITING_RESPAWN: 'WAITING_RESPAWN',
    RESPAWNING: 'RESPAWNING',
    RETURNING: 'RETURNING',
    PAUSED: 'PAUSED',
    STOPPED: 'STOPPED'
});

const Mining = Object.freeze({
    IDLE: 'IDLE',
    EQUIPPING: 'EQUIPPING',
    MINING: 'MINING',
    SWITCHING: 'SWITCHING',
    STOPPED: 'STOPPED'
});

const GUI = Object.freeze({
    CLOSED: 'CLOSED',
    OPENING: 'OPENING',
    OPEN: 'OPEN',
    CLICKING: 'CLICKING',
    WAITING: 'WAITING',
    CLOSING: 'CLOSING'
});

const Watchdog = Object.freeze({
    HEALTHY: 'HEALTHY',
    WARNING: 'WARNING',
    STUCK: 'STUCK',
    RECOVERING: 'RECOVERING',
    FAILED: 'FAILED'
});

const Task = Object.freeze({
    IDLE: 'IDLE',
    RUNNING: 'RUNNING',
    PAUSED: 'PAUSED',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED'
});

module.exports = Object.freeze({
    Engine,
    Connection,
    SkyBlock,
    Mode,
    Collector,
    Storage,
    Dungeon,
    Mining,
    GUI,
    Watchdog,
    Task
});