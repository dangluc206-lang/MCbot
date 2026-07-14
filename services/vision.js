function findNearest(bot, blockNames, maxDistance = 32) {

    return bot.findBlock({

        matching: block => blockNames.includes(block.name),

        maxDistance

    });

}


module.exports = {
    findNearest
};