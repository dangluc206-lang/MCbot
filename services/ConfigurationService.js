'use strict';

const fs = require('fs');
const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');

const EDITABLE_ROOTS = new Set([
    'skyblock',
    'storage',
    'dungeon',
    'fishing',
    'viewer',
    'logging',
    'serverReset',
    'mine',
    'shop'
]);

const PROTECTED_PATHS = new Set([
    'skyblock.loginPassword'
]);

/** Safely persists non-sensitive Discord configuration changes. */
class ConfigurationService extends BaseService {
    constructor(ctx) { super(ctx); this.name = 'ConfigurationService'; }

    async save() {
        if (!this.config.configPath) return Result.FAILED;

        let persisted;
        try {
            persisted = JSON.parse(fs.readFileSync(this.config.configPath, 'utf8'));
        } catch (error) {
            this.error(`Không thể đọc config trước khi lưu: ${error.message}`);
            return Result.FAILED;
        }

        for (const root of EDITABLE_ROOTS) {
            if (Object.prototype.hasOwnProperty.call(this.config, root)) {
                persisted[root] = this.config[root];
            }
        }

        // Legacy Discord config must not survive a gameplay-config save.
        delete persisted.discord;
        if (persisted.skyblock) delete persisted.skyblock.loginPassword;

        try {
            fs.writeFileSync(this.config.configPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
            return Result.SUCCESS;
        } catch (error) {
            this.error(`Không thể lưu config: ${error.message}`);
            return Result.FAILED;
        }
    }

    async set(path, value) {
        if (typeof path !== 'string' || !/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*){1,2}$/.test(path)) return Result.FAILED;
        const root = path.split('.')[0];
        if (!EDITABLE_ROOTS.has(root) || PROTECTED_PATHS.has(path)) return Result.FAILED;
        const keys = path.split('.');
        let target = this.config;
        for (const key of keys.slice(0, -1)) { if (!target || typeof target[key] !== 'object') return Result.FAILED; target = target[key]; }
        const key = keys.at(-1);
        if (!Object.prototype.hasOwnProperty.call(target, key)) return Result.FAILED;
        if (typeof target[key] !== typeof value && target[key] !== null) return Result.FAILED;
        const previous = target[key];
        target[key] = value;
        const result = await this.save();
        if (result !== Result.SUCCESS) target[key] = previous;
        return result;
    }
}

module.exports = ConfigurationService;
