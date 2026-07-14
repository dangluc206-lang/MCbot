const { goals } = require("mineflayer-pathfinder");

let goal = null;
let moving = false;

function start(bot, position) {

    if (moving) return;

    goal = new goals.GoalBlock(
        position.x,
        position.y,
        position.z
    );

    moving = true;

    bot.pathfinder.setGoal(goal);

}

function update(bot) {

    if (!moving) return;

    if (bot.pathfinder.isMoving()) return;

    moving = false;

}

function isFinished() {

    return !moving;

}

function stop(bot) {

    moving = false;

    goal = null;

    bot.pathfinder.setGoal(null);

}

module.exports = {

    start,

    update,

    isFinished,

    stop

};