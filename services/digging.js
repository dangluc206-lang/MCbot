/**
 * ===========================================
 * Service: Digging
 * Purpose: Handle block digging
 * ===========================================
 */

let digging = false;
let finished = false;

function start(bot, block) {

    if (digging) return;

    digging = true;
    finished = false;

    bot.dig(block)
        .then(() => {

            digging = false;
            finished = true;

            console.log("⛏️ Dig complete");

        })
        .catch(err => {

            digging = false;
            finished = true;

            console.log("❌ Dig error:", err.message);

        });

}

function update() {
    // Không cần xử lý mỗi tick,
    // giữ để thống nhất interface.
}

function isFinished() {

    return finished;

}

function reset() {

    digging = false;
    finished = false;

}

function stop() {

    reset();

}

module.exports = {

    start,

    update,

    isFinished,

    reset,

    stop

};