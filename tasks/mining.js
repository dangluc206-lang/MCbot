/**
 * ===========================================
 * Task: Mining
 * ===========================================
 */

const gotoMine = require("../services/gotoMine");
const tool = require("../services/tool");
const look = require("../services/look");
const holdMining = require("../services/holdMining");
const inventory = require("../services/inventory");

const State = {

    GOTO: 0,
    EQUIP: 1,
    LOOK: 2,
    MINE: 3

};

let state = State.GOTO;
let arrived = false;

module.exports = {

    start(context) {

        console.log("⛏️ Mining Started");

        state = State.GOTO;
        arrived = false;

    },

    async update(context) {

        switch (state) {

            case State.GOTO:

                if (!arrived) {

                    arrived = true;

                    await gotoMine.start(

                        context.bot,
                        context.config.mine

                    );

                }

                state = State.EQUIP;

                break;



            case State.EQUIP:

                if (!await tool.equip(
                    context.bot,
                    "pickaxe"
                )) {

                    console.log("❌ Không có pickaxe");

                    context.manager.stop();

                    return;

                }

                state = State.LOOK;

                break;



            case State.LOOK:

                await look.lookStraight(
                    context.bot
                );

                state = State.MINE;

                break;



            case State.MINE:

                if (!holdMining.isMining()) {

                    holdMining.start(
                        context.bot
                    );

                }

                if (inventory.isFull(context.bot)) {

                    holdMining.stop(
                        context.bot
                    );

                    context.manager.start("sell");

                }

                break;

        }

    },

    stop(context) {

        holdMining.stop(
            context.bot
        );

        state = State.GOTO;

        arrived = false;

        console.log("🛑 Mining Stopped");

    }

};