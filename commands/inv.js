const inventory = require("../services/inventory");


module.exports = {

    name: "inv",

    execute(message, bot) {


        const stone = inventory.countItem(
            bot,
            "stone"
        );


        const full = inventory.isFull(bot);


        message.reply(
            `🎒 Stone: ${stone}\nFull: ${full}`
        );


    }

};