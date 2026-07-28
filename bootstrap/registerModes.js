'use strict';

const {
    CollectorMode,
    DungeonMode,
    FishingMode
} = require('../modes');

/**
 * ============================================================================
 * Register Modes
 * ============================================================================
 *
 * Đăng ký toàn bộ Mode của Framework.
 *
 * ============================================================================
 */

module.exports = function registerModes(ctx) {

    const modeManager = ctx.getManager('mode');

    modeManager.register(
        'collector',
        new CollectorMode(ctx)
    );

    modeManager.register(
        'dungeon',
        new DungeonMode(ctx)
    );

    modeManager.register(
        'fishing',
        new FishingMode(ctx)
    );

};
