module.exports = {
    name: "ping",

    async execute(message, bot) {
        await message.reply("🏓 Pong!");
    }
};