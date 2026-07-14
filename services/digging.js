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


function isFinished() {

    return finished;

}


function reset() {

    finished = false;

}


function stop() {

    digging = false;
    finished = false;

}


module.exports = {

    start,

    isFinished,

    reset,

    stop

};