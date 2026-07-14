module.exports = {
    name: "status",

    async execute(message, bot) {

        const pos = bot.entity.position;

        message.reply(
`🟢 Online

❤ Máu: ${bot.health}
🍗 Đói: ${bot.food}

📍 X:${Math.floor(pos.x)}
📍 Y:${Math.floor(pos.y)}
📍 Z:${Math.floor(pos.z)}`
        );

    }
};