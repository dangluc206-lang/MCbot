/**
 * ===========================================
 * Task: Sell
 * ===========================================
 */

const sellOre = require("../services/sellOre");
const sellInventory = require("../services/sellInventory");
const gotoMine = require("../services/gotoMine");

const State = {

    ORE: 0,
    INVENTORY: 1,
    RETURN: 2

};

let state = State.ORE;

module.exports = {

    start() {

        console.log("💰 Sell Started");

        state = State.ORE;

    },

    async update(context) {

        switch (state) {

            case State.ORE:

                await sellOre.start(
                    context.bot
                );

                state = State.INVENTORY;

                break;



            case State.INVENTORY:

                await sellInventory.start(

                    context.bot,

                    context.config.shop

                );

                state = State.RETURN;

                break;



            case State.RETURN:

                await gotoMine.start(

                    context.bot,

                    context.config.mine

                );

                console.log(
                    "⛏️ Back To Mine"
                );

                context.manager.start(
                    "mine"
                );

                break;

        }

    },

    stop() {

        console.log(
            "💰 Sell Finished"
        );

    }

};