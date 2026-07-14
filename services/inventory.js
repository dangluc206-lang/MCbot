function getItems(bot) {

    return bot.inventory.items();

}


function countItem(bot, name) {

    return bot.inventory
        .items()
        .filter(item => item.name === name)
        .reduce(
            (total, item) => total + item.count,
            0
        );

}


function isFull(bot) {

    return bot.inventory.emptySlotCount() === 0;

}


module.exports = {

    getItems,

    countItem,

    isFull

};