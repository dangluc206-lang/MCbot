'use strict';

const DiscordController = require('./DiscordController');

/** Backward-compatible factory used by index.js while Discord is modularized. */
module.exports = async function createDiscordController({ framework }) {
    const controller = new DiscordController(framework.ctx);
    await controller.start();
    controller.client.mcbotController = controller;
    return controller.client;
};
