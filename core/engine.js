const registry = require("./registry");

let currentTask = null;
let started = false;

function start(context) {

    if (started) return;

    started = true;

    context.bot.on("physicsTick", () => {
        update(context);
    });

}

function update(context) {

    const manager = context.manager;

    const taskName = manager.getTask();

    // Không có task nào đang chạy
    if (!taskName) {

        if (currentTask) {

            currentTask.stop(context);

            currentTask = null;

        }

        return;

    }

    const task = registry[taskName];

    if (!task) {

        console.log(`❌ Không tìm thấy task: ${taskName}`);

        manager.stop();

        return;

    }

    // Task vừa được đổi
    if (currentTask !== task) {

        if (currentTask) {
            currentTask.stop(context);
        }

        currentTask = task;

        currentTask.start(context);

    }

    currentTask.update(context);

}

module.exports = {
    start
};