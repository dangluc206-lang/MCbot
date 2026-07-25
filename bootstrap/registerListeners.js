'use strict';

const {
    ConnectionListener,
    PlayerListener,
    InventoryListener,
    GUIListener,
    ChatListener,
    MovementListener,
    
} = require('../listeners');

/**
 * ============================================================================
 * Register Listeners
 * ============================================================================
 *
 * Khởi tạo và đăng ký toàn bộ Listener.
 *
 * ============================================================================
 */

module.exports = async function registerListeners(ctx) {

    const listeners = [

        new ConnectionListener(ctx),

        new PlayerListener(ctx),

        new InventoryListener(ctx),

        new GUIListener(ctx),

        new ChatListener(ctx),

        new MovementListener(ctx),

        

    ];

    ctx.listeners = listeners;

    for (const listener of listeners) {

        await listener.initialize();

    }

    return listeners;

};