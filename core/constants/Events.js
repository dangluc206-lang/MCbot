'use strict';

/**
 * ============================================================================
 * Events
 * ============================================================================
 *
 * Trung tâm quản lý toàn bộ Event Name của Framework.
 *
 * Quy tắc:
 * - Không hardcode tên Event.
 * - Chỉ chứa hằng số.
 * - Không chứa logic.
 * - Không import module khác.
 * - Event sử dụng định dạng:
 *
 *     <domain>.<action>
 *
 * Ví dụ:
 *
 *     player.spawn
 *     connection.connected
 *     gui.open
 * ============================================================================
 */

const Connection = Object.freeze({
    CONNECTING: 'connection.connecting',
    CONNECTED: 'connection.connected',
    DISCONNECTED: 'connection.disconnected',
    RECONNECTING: 'connection.reconnecting',
    RESOURCE_PACK: 'connection.resourcePack',
    READY: 'connection.ready',
    AUTHENTICATED: 'connection.authenticated',
    KICKED: 'connection.kicked',
    ENDED: 'connection.ended',
    ERROR: 'connection.error'
});

const Player = Object.freeze({
    SPAWN: 'player.spawn',
    LOGIN: 'player.login',
    DEATH: 'player.death',
    RESPAWN: 'player.respawn',
    HEALTH: 'player.health',
    FOOD: 'player.food',
    POSITION: 'player.position',
    MOVED: 'player.moved',
    TELEPORT: 'player.teleport',
    CHAT: 'player.chat',
    MESSAGE: 'player.message',
    ACTION_BAR: 'player.actionBar',
    EXPERIENCE: 'player.experience'
});

const Inventory = Object.freeze({
    UPDATE: 'inventory.update',
    FULL: 'inventory.full',
    EMPTY: 'inventory.empty',
    SLOT: 'inventory.slot',
    ITEM_ADD: 'inventory.itemAdd',
    ITEM_REMOVE: 'inventory.itemRemove'
});

const GUI = Object.freeze({
    OPEN: 'gui.open',
    CLOSE: 'gui.close',
    UPDATE: 'gui.update',
    SLOT: 'gui.slot',
    CLICK: 'gui.click',
    TIMEOUT: 'gui.timeout'
});

const Movement = Object.freeze({
    START: 'movement.start',
    STOP: 'movement.stop',
    TARGET: 'movement.target',
    ARRIVED: 'movement.arrived',
    STUCK: 'movement.stuck',
    FAILED: 'movement.failed'
});

const SkyBlock = Object.freeze({
    LOGIN: 'skyblock.login',
    LOGGED: 'skyblock.logged',
    JOIN: 'skyblock.join',
    JOINED: 'skyblock.joined',
    LEAVE: 'skyblock.leave'
});

const Collector = Object.freeze({
    START: 'collector.start',
    STOP: 'collector.stop',
    PAUSE: 'collector.pause',
    RESUME: 'collector.resume',
    ITEM_COLLECTED: 'collector.itemCollected',
    INVENTORY_FULL: 'collector.inventoryFull',
    STUCK: 'collector.stuck'
});

const Storage = Object.freeze({
    START: 'storage.start',
    STOP: 'storage.stop',
    SNAPSHOT: 'storage.snapshot',
    SELL_INVENTORY: 'storage.sellInventory',
    SELL_STORAGE: 'storage.sellStorage',
    FINISHED: 'storage.finished',
    FAILED: 'storage.failed'
});

const Mining = Object.freeze({
    START: 'mining.start',
    STOP: 'mining.stop',
    EQUIP: 'mining.equip',
    UNEQUIP: 'mining.unequip',
    ORE_CHANGE: 'mining.oreChange'
});

const Dungeon = Object.freeze({
    START: 'dungeon.start',
    STOP: 'dungeon.stop',
    ENTER: 'dungeon.enter',
    EXIT: 'dungeon.exit',
    DEATH: 'dungeon.death',
    RESPAWN: 'dungeon.respawn',
    RESUME: 'dungeon.resume'
});

const Mode = Object.freeze({
    REGISTER: 'mode.register',
    START: 'mode.start',
    STOP: 'mode.stop',
    PAUSE: 'mode.pause',
    RESUME: 'mode.resume',
    SWITCH: 'mode.switch',
    RECOVER: 'mode.recover'
});

const Engine = Object.freeze({
    START: 'engine.start',
    STOP: 'engine.stop',
    TICK: 'engine.tick',
    STATE_CHANGE: 'engine.stateChange',
    ERROR: 'engine.error'
});

const Watchdog = Object.freeze({
    WARNING: 'watchdog.warning',
    RECOVER: 'watchdog.recover',
    FAILED: 'watchdog.failed'
});

const Scheduler = Object.freeze({
    TASK_START: 'scheduler.taskStart',
    TASK_STOP: 'scheduler.taskStop',
    TASK_FINISH: 'scheduler.taskFinish'
});

const Discord = Object.freeze({
    READY: 'discord.ready',
    COMMAND: 'discord.command',
    BUTTON: 'discord.button'
});

module.exports = Object.freeze({
    Connection,
    Player,
    Inventory,
    GUI,
    Movement,
    SkyBlock,
    Collector,
    Storage,
    Mining,
    Dungeon,
    Mode,
    Engine,
    Watchdog,
    Scheduler,
    Discord
});
