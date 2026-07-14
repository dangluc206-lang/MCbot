const manager = require("../core/manager");

module.exports = {

    name: "farm",

    async execute(message) {

        if (!manager.start("farm")) {
            return message.reply("⚠️ Bot đang bận.");
        }

        await message.reply("🌾 Bắt đầu farm.");

    }

};