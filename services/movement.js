/**
 * ===========================================
 * Service: Movement
 * Purpose: Handle bot movement
 * ===========================================
 */

const { goals } = require("mineflayer-pathfinder");

let moving = false;
let finished = false;
let goal = null;

function start(bot, position) {

    if (moving) return;

    goal = new goals.GoalBlock(
        position.x,
        position.y,
        position.z
    );

    moving = true;
    finished = false;

    bot.pathfinder.setGoal(goal);

}

function update(bot) {

    if (!moving) return;

    if (bot.pathfinder.isMoving()) {
        return;
    }

    moving = false;
    finished = true;

}

function isFinished() {

    return finished;

}

function reset() {

    moving = false;
    finished = false;
    goal = null;

}

function stop(bot) {

    bot.pathfinder.setGoal(null);

    reset();

}

module.exports = {

    start,

    update,

    isFinished,

    reset,

    stop

};