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
        if (!this.ctx.config.storage.targetItems.includes(ore)) {
            return Result.INVALID_ARGUMENT;
        }
        const command = this.ctx.config.storage.sellCommand;
        return this.chatService.sendCommand(`${command} ${ore}`, options);
    }

    async goIsland(options) {
        const command = this.ctx.config.skyblock.islandCommand;
        return this.chatService.sendCommand(command, options);
    }

    async openSkyBlockSelector(options) {
        const command = this.ctx.config.skyblock.islandCommand || '/skyblock';
        return this.chatService.sendCommand(command, options);
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
