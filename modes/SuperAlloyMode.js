'use strict';

const BaseMode = require('../core/base/BaseMode');
const Result = require('../core/constants/Result');

/** Long-running workflow that delegates each /ks interaction to CraftingService. */
class SuperAlloyMode extends BaseMode {
    constructor(ctx) {
        super(ctx);
        this.name = 'SuperAlloyMode';
    }

    async start() {
        const result = await super.start();
        if (result !== Result.SUCCESS) return result;
        if (!this.state.skyblock.joined) {
            await super.stop();
            return Result.NOT_IN_SKYBLOCK;
        }

        const settings = this.config.crafting || {};
        const started = this.service('crafting').start(settings.targetSlot, settings.targetCount);
        if (started !== Result.SUCCESS) {
            await super.stop();
            return started;
        }
        return Result.SUCCESS;
    }

    async tick() {
        const crafting = this.service('crafting');
        const result = await crafting.tick();
        if (crafting.isFinished()) {
            const succeeded = crafting.succeeded();
            if (succeeded) await this._depositCompletedSuperAlloy(crafting.getCompletedTargetDepositRequest?.());
            const finalResult = succeeded ? Result.SUCCESS : result;
            await this.manager('mode').stop();
            return finalResult;
        }
        return result;
    }

    async _depositCompletedSuperAlloy(request) {
        if (!request || this.config.crafting?.personalVault?.depositAfterCraft === false) return Result.NO_ACTION;
        const result = await this.service('personalVault')?.deposit?.([request]);
        if (result !== Result.SUCCESS && result !== Result.NO_ACTION) {
            this.warn(`Đã craft SHK nhưng chưa thể cất vào /pv 2: ${result}. Giữ nguyên trong inventory để tránh mất item.`);
        }
        return result || Result.FAILED;
    }

    async stop() {
        await this.service('crafting').stop();
        return super.stop();
    }
}

module.exports = SuperAlloyMode;
