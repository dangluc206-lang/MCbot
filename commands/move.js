const movement = require("../services/movement");

module.exports = {

    name: "move",

    execute(message, bot) {

        const pos = bot.entity.position.offset(5, 0, 0);

        movement.start(bot, pos);

        message.reply("🚶 Đang đi test");

    }

};