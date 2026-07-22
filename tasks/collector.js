const movement = require("../services/movement");
const storage = require("../services/storage");
const monitor = require("../services/collector/monitor");
const collector = require("../services/collector/return");
const food = require("../services/player/food");

let running = false;

async function start(context) {

    const bot = context.bot;
    const config = context.config;

    running = true;

    console.log("📦 Collector Started");

    await movement.goto(

        bot,

        config.collector.stand,

        0

    );

    await movement.look(

        bot,

        config.collector.yaw,

        config.collector.pitch

    );

}