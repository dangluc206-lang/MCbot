'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');

/** High-level Minecraft chat/command gateway for controllers and modes. */
class ChatService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'ChatService';
    }

    send(message) {
        const text = String(message || '').trim();
        if (!text) return Result.FAILED;
        if (!this.state.bot.connected) return Result.NOT_CONNECTED;
        if (text.length > 256) return Result.FAILED;
        this.bot.chat(text);
        return Result.SUCCESS;
    }

    sendCommand(command) {
        const text = String(command || '').trim();
        if (!text || text.length > 256) return Result.FAILED;
        return this.send(text.startsWith('/') ? text : `/${text}`);
    }
}

module.exports = ChatService;
