'use strict';

const {
    CollectorService,
    ChatService,
    ConfigurationService,
    DungeonService,
    FishingService,
    GUIService,
    InventoryService,
    MiningService,
    MovementService,
    PlayerService,
    SkyBlockService,
    StorageService,
    ViewService
} = require('../services');

/**
 * ============================================================================
 * Register Services
 * ============================================================================
 *
 * Khởi tạo và đăng ký toàn bộ Service.
 *
 * ============================================================================
 */

module.exports = function registerServices(ctx) {

    ctx.registerService(
        'configuration',
        new ConfigurationService(ctx)
    );

    ctx.registerService(
        'chat',
        new ChatService(ctx)
    );

    ctx.registerService(
        'player',
        new PlayerService(ctx)
    );

    ctx.registerService(
        'movement',
        new MovementService(ctx)
    );

    ctx.registerService(
        'inventory',
        new InventoryService(ctx)
    );

    ctx.registerService(
        'gui',
        new GUIService(ctx)
    );

    ctx.registerService(
        'collector',
        new CollectorService(ctx)
    );

    ctx.registerService(
        'storage',
        new StorageService(ctx)
    );

    ctx.registerService(
        'skyblock',
        new SkyBlockService(ctx)
    );

    ctx.registerService(
        'mining',
        new MiningService(ctx)
    );

    ctx.registerService(
        'dungeon',
        new DungeonService(ctx)
    );

    ctx.registerService(
        'fishing',
        new FishingService(ctx)
    );

    ctx.registerService(
        'view',
        new ViewService(ctx)
    );

};
