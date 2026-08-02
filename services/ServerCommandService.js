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
        return this._sendConfigured('craftingMenu', this.config?.crafting?.command, '/ks', options, ['crafting']);
    }

    async openSmeltingMenu(options) {
        return this._sendConfigured('smelting', this.config?.storage?.smelting?.command, '/ks', options);
    }

    async openMaterialConversionMenu(options) {
        return this._sendConfigured(
            'materialConversion',
            this.config?.storage?.conversion?.command,
            '/ks',
            options
        );
    }

    async openPersonalVault(options) {
        return this._sendConfigured(
            'personalVault',
            this.config?.crafting?.personalVault?.command,
            '/pv 2',
            options
        );
    }

    async openDungeonStorage(options) {
        return this._sendConfigured(
            'personalVault',
            this.config?.dungeon?.storageCommand,
            '/pv 2',
            options
        );
    }

    async openStorage(options) {
        return this._sendConfigured('storage', this.config?.storage?.guiCommand, '/kho', options);
    }

    async sellStorage(ore, options) {
        const storage = this.config?.storage;
        const targetItems = storage?.conversion?.targetItems ?? storage?.targetItems;
        if (
            typeof ore !== 'string' ||
            /[\x00-\x1F\x7F]/.test(ore) ||
            !ore.trim() ||
            ore !== ore.trim() ||
            !Array.isArray(targetItems) ||
            !targetItems.some(target => typeof target === 'string'
                && target.trim().toUpperCase() === ore.toUpperCase())
        ) return Result.FAILED;

        const command = this._normalizeCommand(
            this._resolveCommand('storageSell', storage?.sellCommand, '/kho sell')
        );
        if (!command) return Result.FAILED;
        return this._sendCommand(`${command} ${ore}`, options);
    }

    async goIsland(options) {
        return this._sendConfigured('island', this.config?.skyblock?.islandCommand, '/is', options);
    }

    async openSkyBlockSelector(options) {
        return this._sendConfigured(
            'skyblockSelector',
            this.config?.skyblock?.selectorCommand,
            '/skyblock',
            options
        );
    }

    async openDungeon(options) {
        return this._sendConfigured('dungeon', this.config?.dungeon?.command, '/d', options);
    }

    async openAutofarm(options) {
        return this._sendConfigured('autofarm', this.config?.dungeon?.autofarmCommand, '/autofarm', options);
    }

    async openFishingAfk(options) {
        return this._sendConfigured('fishingAfk', this.config?.fishing?.command, '/afk', options);
    }

    _sendConfigured(name, legacyCommand, defaultCommand, options, aliases = []) {
        return this._sendCommand(this._resolveCommand(name, legacyCommand, defaultCommand, aliases), options);
    }

    _sendCommand(command, options) {
        const normalized = this._normalizeCommand(command);
        return normalized
            ? this.chatService.sendCommand(normalized, options)
            : Result.FAILED;
    }

    _resolveCommand(name, legacyCommand, defaultCommand, aliases = []) {
        const serverCommands = this.config?.serverCommands;
        if (serverCommands && typeof serverCommands === 'object' && Object.hasOwn(serverCommands, name)) {
            return serverCommands[name];
        }
        for (const alias of aliases) {
            if (serverCommands && typeof serverCommands === 'object' && Object.hasOwn(serverCommands, alias)) {
                return serverCommands[alias];
            }
        }
        return legacyCommand === undefined ? defaultCommand : legacyCommand;
    }

    _normalizeCommand(command) {
        if (typeof command !== 'string' || /[\x00-\x1F\x7F]/.test(command)) return null;
        const text = command.trim();
        if (!text) return null;
        const normalized = text.startsWith('/') ? text : `/${text}`;
        return normalized.length <= 256 ? normalized : null;
    }
}

module.exports = ServerCommandService;
