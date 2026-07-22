'use strict';

const BaseManager = require('../base/BaseManager');
const Result = require('../constants/Result');

/**
 * ============================================================================
 * LoggerManager
 * ============================================================================
 *
 * Logger thống nhất của Framework.
 *
 * Quy tắc:
 * - Không dùng console trực tiếp ngoài LoggerManager.
 * - Hỗ trợ nhiều level.
 * - Có timestamp.
 * - Có tag.
 *
 * ============================================================================
 */
class LoggerManager extends BaseManager {

    constructor(ctx) {
        super(ctx);

        this.name = 'LoggerManager';

        this.levels = Object.freeze({
            DEBUG: 0,
            INFO: 1,
            SUCCESS: 2,
            WARN: 3,
            ERROR: 4,
            SILENT: 5
        });

        this.level = this.levels.INFO;
    }

    async initialize() {
        await super.initialize();
        return Result.SUCCESS;
    }

    /**
     * Đặt mức log.
     *
     * @param {Number} level
     */
    setLevel(level) {
        this.level = level;
    }

    /**
     * Timestamp.
     *
     * @returns {String}
     * @private
     */
    _timestamp() {
        return new Date().toISOString();
    }

    /**
     * Ghi log.
     *
     * @private
     */
    _write(levelName, level, args) {
        if (level < this.level) {
            return;
        }

        const prefix = `[${this._timestamp()}] [${levelName}]`;

        switch (levelName) {
            case 'ERROR':
                console.error(prefix, ...args);
                break;

            case 'WARN':
                console.warn(prefix, ...args);
                break;

            default:
                console.log(prefix, ...args);
                break;
        }
    }

    debug(...args) {
        this._write('DEBUG', this.levels.DEBUG, args);
    }

    info(...args) {
        this._write('INFO', this.levels.INFO, args);
    }

    success(...args) {
        this._write('SUCCESS', this.levels.SUCCESS, args);
    }

    warn(...args) {
        this._write('WARN', this.levels.WARN, args);
    }

    error(...args) {
        this._write('ERROR', this.levels.ERROR, args);
    }
}

module.exports = LoggerManager;