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
        this.dedupeWindowMs = 1500;
        this._recentMessages = new Map();
        this.entries = [];
    }

    async initialize() {
        await super.initialize();
        const configuredLevel = String(this.config.logging?.level || 'SUCCESS').toUpperCase();
        this.level = this.levels[configuredLevel] ?? this.levels.SUCCESS;
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
        const date = new Date();
        const timeZone = this.config.logging?.timeZone || 'Asia/Ho_Chi_Minh';
        const values = new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(date).reduce((result, part) => {
            if (part.type !== 'literal') result[part.type] = part.value;
            return result;
        }, {});
        return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}.${String(date.getMilliseconds()).padStart(3, '0')}+07:00`;
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

        const messageKey = `${levelName}:${args.map(value => {
            if (typeof value === 'string') return value;
            try { return JSON.stringify(value); }
            catch { return String(value); }
        }).join(' ')}`;
        const now = Date.now();
        const previous = this._recentMessages.get(messageKey);
        if (previous && now - previous < this.dedupeWindowMs) {
            return;
        }
        this._recentMessages.set(messageKey, now);

        if (this._recentMessages.size > 200) {
            for (const [key, timestamp] of this._recentMessages) {
                if (now - timestamp > this.dedupeWindowMs) this._recentMessages.delete(key);
            }
        }

        const prefix = `[${this._timestamp()}] [${levelName}]`;
        const rendered = args.map(value => {
            if (typeof value === 'string') return value;
            try { return JSON.stringify(value); }
            catch { return String(value); }
        }).join(' ');
        this.entries.push({ level: levelName, message: rendered, timestamp: Date.now() });
        if (this.entries.length > 500) this.entries.splice(0, this.entries.length - 500);

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

    recent(level, limit = 20) {
        const max = Math.min(Math.max(Number(limit) || 20, 1), 50);
        return this.entries.filter(entry => !level || entry.level === level).slice(-max).reverse();
    }
}

module.exports = LoggerManager;
