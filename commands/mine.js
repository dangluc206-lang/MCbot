const manager = require("../core/manager");

module.exports = {

    name: "mine",

    async execute(message) {

        if (!manager.start("mine")) {
            return message.reply("⚠️ Bot đang bận.");
        }

        await message.reply("⛏️ Bắt đầu đào.");

    }

};