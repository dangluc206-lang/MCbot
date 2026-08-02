'use strict';

const {
    CollectorService,
    ChatService,
    CraftingService,
    ConfigurationService,
    DungeonService,
    FishingService,
    GUIService,
    GuiProbeService,
    InventoryService,
    MiningService,
    MaterialConversionService,
    MinecraftLoginService,
    MovementService,
    PersonalVaultService,
    PlayerService,
    SkyBlockService,
    SmeltingService,
    StorageService,
    ViewService,
    ServerCommandService
} = require('../services');

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
        'crafting',
        new CraftingService(ctx)
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
        'personalVault',
        new PersonalVaultService(ctx)
    );

    ctx.registerService(
        'gui',
        new GUIService(ctx)
    );

    ctx.registerService(
        'guiProbe',
        new GuiProbeService(ctx)
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
        'smelting',
        new SmeltingService(ctx)
    );

    ctx.registerService(
        'materialConversion',
        new MaterialConversionService(ctx)
    );

    ctx.registerService(
        'minecraftLogin',
        new MinecraftLoginService(ctx)
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

    ctx.registerService(
        'serverCommands',
        new ServerCommandService(ctx)
    );
};
