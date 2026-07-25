'use strict';

const {
    LoggerManager,
    EventManager,
    SchedulerManager,
    ModeManager,
    RecoveryManager,
    WatchdogManager
} = require('../core/managers');

/**
 * Đăng ký toàn bộ Manager.
 *
 * @param {Context} ctx
 */
module.exports = function registerManagers(ctx) {

      // Logger trước
    const logger = new LoggerManager(ctx);

    ctx.setLogger(logger);
    ctx.registerManager(
        `logger`,
        logger
    );

    // Các manager còn lại
    ctx.registerManager(
        'events',
        new EventManager(ctx)
    );

    ctx.registerManager(
        'events',
        new EventManager(ctx)
    );

    ctx.registerManager(
        'scheduler',
        new SchedulerManager(ctx)
    );

    ctx.registerManager(
        'mode',
        new ModeManager(ctx)
    );

    ctx.registerManager(
        'recovery',
        new RecoveryManager(ctx)
    );

    ctx.registerManager(
        'watchdog',
        new WatchdogManager(ctx)
    );

};