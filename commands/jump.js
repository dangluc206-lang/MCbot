module.exports = {
    name: "jump",

    async execute(message, bot) {

        bot.setControlState("jump", true);

        setTimeout(() => {
            bot.setControlState("jump", false);
        }, 300);

        message.reply("🏃 Jump");
    }
};