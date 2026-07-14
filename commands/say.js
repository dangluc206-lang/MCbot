module.exports = {
    name: "say",

    async execute(message, bot) {

        const text = message.content.split(" ").slice(1).join(" ");

        if (!text)
            return message.reply("Nhập nội dung!");

        bot.chat(text);

        message.reply("✅ Đã gửi.");
    }
};