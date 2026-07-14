const States = require("../core/states");

const vision = require("../services/vision");
const movement = require("../services/movement");
const digging = require("../services/digging");
const inventory = require("../services/inventory");

module.exports = {

    start(context) {

        console.log("⛏️ Mining Started");

        context.targetBlock = null;

        context.manager.setState(States.START);

    },

    update(context) {

        switch (context.manager.getState()) {

            case States.START:

                context.manager.setState(States.SEARCH);

                break;

            case States.SEARCH: {

                if (context.targetBlock) break;

                const block = vision.findNearest(
                    context.bot,
                    context.config.blocks.mine
                );

                if (!block) {

                    console.log("❌ Không tìm thấy block");

                    context.manager.stop();

                    break;

                }

                context.targetBlock = block;

                console.log(
                    `🪨 Found: ${block.name} (${block.position.x}, ${block.position.y}, ${block.position.z})`
                );

                context.manager.setState(States.MOVE);

                break;
            }

            case States.MOVE:

                if (!movement.isFinished()) break;

                movement.start(
                    context.bot,
                    context.targetBlock.position
                );

                console.log("🚶 Moving...");

                context.manager.setState(States.ACTION);

                break;

            case States.ACTION:

                if (!digging.isFinished()) {

                    digging.start(
                        context.bot,
                        context.targetBlock
                    );

                    break;

                }

                console.log(
                    `✅ Đã đào: ${context.targetBlock.name}`
                );

                digging.reset();

                if (inventory.isFull(context.bot)) {

                    console.log("🎒 Túi đầy, dừng Mining.");

                    context.targetBlock = null;

                    context.manager.stop();

                    break;

                }

                context.targetBlock = null;

                context.manager.setState(States.SEARCH);

                break;

            case States.FINISH:

                context.manager.stop();

                break;

        }

    },

    stop(context) {

        context.targetBlock = null;

        movement.stop(context.bot);

        digging.stop();

        console.log("🛑 Mining Stopped");

    }

};