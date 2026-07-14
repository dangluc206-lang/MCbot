class TaskManager {
    constructor() {
        this.task = null;
        this.state = "IDLE";
        this.running = false;
    }

   start(task) {

    if (this.running) return false;

    this.task = task;
    this.state = "START";
    this.running = true;

    return true;

}

    stop() {
        this.task = null;
        this.state = "IDLE";
        this.running = false;
    }

    setState(state) {
        this.state = state;
    }

    getState() {
        return this.state;
    }

    getTask() {
        return this.task;
    }

    isRunning() {
        return this.running;
    }
}

module.exports = new TaskManager();