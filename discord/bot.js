const { Client, GatewayIntentBits } = require("discord.js");
const config = require("../config.json");
const fs = require("fs");
const path = require("path");

module.exports = (bot) => {

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });

    const commands = new Map();

    const files = fs.readdirSync(path.join(__dirname, "../commands"));

    for (const file of files) {
        const command = require(`../commands/${file}`);
        commands.set(command.name, command);
    }

    client.once("ready", () => {
        console.log(`🤖 ${client.user.tag} Online`);
    });

    client.on("messageCreate", async (message) => {

        if (message.author.bot) return;

        if (!message.content.startsWith("!")) return;

        const args = message.content.slice(1).split(" ");
        const commandName = args.shift().toLowerCase();

        const command = commands.get(commandName);

        if (!command) return;

        command.execute(message, bot);
    });

    client.login(config.discord.token);
};