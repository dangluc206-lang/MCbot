const manager = require("../core/manager");

module.exports = {

    name: "stop",

    async execute(message) {

        manager.stop();

        await message.reply("🛑 Đã dừng bot.");

    }

};