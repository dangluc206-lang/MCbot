const mineflayer = require("mineflayer");
const config = require("./config.json");

const { pathfinder, Movements } = require("mineflayer-pathfinder");
const minecraftData = require("minecraft-data");
const toolPlugin = require("mineflayer-tool").plugin;

const engine = require("./core/engine");
const Context = require("./core/context");
const manager = require("./core/manager");
const states = require("./core/states");

const bot = mineflayer.createBot({
    host: config.minecraft.host,
    port: config.minecraft.port,
    username: config.minecraft.username,
    version: config.minecraft.version,
    auth: config.minecraft.auth || "offline"
});

bot.loadPlugin(pathfinder);
bot.loadPlugin(toolPlugin);

bot.once("spawn", () => {

    const mcData = minecraftData(bot.version);

    const defaultMove = new Movements(bot, mcData);

    bot.pathfinder.setMovements(defaultMove);

    const context = new Context(
        bot,
        manager,
        states,
        config
    );

    engine.start(context);

    console.log("✅ Bot đã vào server!");

});

bot.on("chat", (username, message) => {

    if (username === bot.username) return;

    console.log(`[CHAT] ${username}: ${message}`);

});

bot.on("kicked", (reason) => {

    console.log("❌ Bị kick:", reason);

});

bot.on("error", (err) => {

    console.error(err);

});

require("./discord/bot")(bot);