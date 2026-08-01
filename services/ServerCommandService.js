'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');

class ServerCommandService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'serverCommands';
        this.chatService = ctx.getService('chat');
    }

    async openCraftingMenu(options) {
        const command = this.ctx.config.crafting.command;
        return this.chatService.sendCommand(command, options);
    }

    async openPersonalVault(options) {
        const command = this.ctx.config.crafting.personalVault.command;
        return this.chatService.sendCommand(command, options);
    }

    async openStorage(options) {
        const command = this.ctx.config.storage.guiCommand;
        return this.chatService.sendCommand(command, options);
    }

    async sellStorage(ore, options) {
        const storage = this.ctx.config?.storage;
        const targetItems = storage?.conversion?.targetItems;
        if (
            typeof ore !== 'string' ||
            /[\x00-\x1F\x7F]/.test(ore) ||
            !Array.isArray(targetItems) ||
            !targetItems.includes(ore)
        ) return Result.FAILED;

        const command = storage.sellCommand;
        return this.chatService.sendCommand(`${command} ${ore}`, options);
    }

    async goIsland(options) {
        const command = this.ctx.config.skyblock.islandCommand;
        return this.chatService.sendCommand(command, options);
    }

    async openSkyBlockSelector(options) {
        const serverCommands = this.ctx.config?.serverCommands;
        const skyblock = this.ctx.config?.skyblock;
        const configuredCommand = serverCommands && typeof serverCommands === 'object' &&
            Object.hasOwn(serverCommands, 'skyblockSelector')
            ? serverCommands.skyblockSelector
            : skyblock && typeof skyblock === 'object' && Object.hasOwn(skyblock, 'selectorCommand')
                ? skyblock.selectorCommand
                : '/skyblock';
        const command = this._normalizeCommand(configuredCommand);
        if (!command) return Result.FAILED;
        return this.chatService.sendCommand(command, options);
    }

    _normalizeCommand(command) {
        if (typeof command !== 'string' || /[\x00-\x1F\x7F]/.test(command)) return null;
        const text = command.trim();
        if (!text) return null;
        return text.startsWith('/') ? text : `/${text}`;
    }

    async openDungeon(options) {
        const command = this.ctx.config.dungeon.command;
        return this.chatService.sendCommand(command, options);
    }

    async openAutofarm(options) {
        const command = this.ctx.config.dungeon.autofarmCommand;
        return this.chatService.sendCommand(command, options);
    }

    async openFishingAfk(options) {
        const command = this.ctx.config.fishing.command;
        return this.chatService.sendCommand(command, options);
    }
}

module.exports = ServerCommandService;
