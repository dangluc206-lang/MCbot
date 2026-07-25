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

    ctx.registerManager(
        'logger',
        new LoggerManager(ctx)
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