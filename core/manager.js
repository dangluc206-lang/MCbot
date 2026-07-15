/**
 * ===========================================
 * Manager
 * Purpose: Manage current task
 * ===========================================
 */

class TaskManager {

    constructor() {

        this.task = null;

        this.running = false;

    }

    start(task) {

        if (this.running) return false;

        this.task = task;

        this.running = true;

        return true;

    }

    stop() {

        this.task = null;

        this.running = false;

    }

    getTask() {

        return this.task;

    }

    isRunning() {

        return this.running;

    }

}

module.exports = new TaskManager();