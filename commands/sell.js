const manager = require("../core/manager");

module.exports = {

    name: "sell",

    async execute(message) {

        if (!manager.start("sell")) {
            return message.reply("⚠️ Bot đang bận.");
        }

        await message.reply("💰 Bắt đầu bán.");

    }

};