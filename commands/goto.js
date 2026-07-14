const { goals } = require("mineflayer-pathfinder");

module.exports = {
    name: "goto",

    async execute(message, bot) {

        const args = message.content.split(" ");

        const x = parseInt(args[1]);
        const y = parseInt(args[2]);
        const z = parseInt(args[3]);

        if (isNaN(x) || isNaN(y) || isNaN(z)) {
            return message.reply("Dùng: !goto <x> <y> <z>");
        }

        bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z));

        message.reply(`🚶 Đang đi đến (${x}, ${y}, ${z})`);
    }
};