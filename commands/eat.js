const manager = require("../core/manager");

module.exports = {

    name: "eat",

    async execute(message) {

        if (!manager.start("eat")) {
            return message.reply("⚠️ Bot đang bận.");
        }

        await message.reply("🍖 Bắt đầu ăn.");

    }

};