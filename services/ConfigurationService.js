'use strict';

const fs = require('fs');
const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');

const EDITABLE_ROOTS = new Set([
    'minecraft',
    'skyblock',
    'storage',
    'dungeon',
    'fishing',
    'crafting',
    'collector',
    'viewer',
    'logging',
    'guiProbe',
    'serverReset',
    'mine',
    'shop'
]);

const PROTECTED_PATHS = new Set([
    'skyblock.loginPassword'
]);

const OPTIONAL_ROOTS = new Set(['crafting', 'guiProbe']);

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
        // Recipe aliases use numeric GUI slots, e.g.
        // `crafting.materialAliases.32`.  Root segments remain alphabetic,
        // while nested keys may be numeric.
        if (typeof path !== 'string' || !/^[a-zA-Z][\w]*(\.[a-zA-Z0-9_]+){1,2}$/.test(path)) return Result.FAILED;
        const root = path.split('.')[0];
        if (!EDITABLE_ROOTS.has(root) || PROTECTED_PATHS.has(path)) return Result.FAILED;
        const keys = path.split('.');
        let target = this.config;
        const createdNodes = [];
        for (const key of keys.slice(0, -1)) {
            if (!target || typeof target !== 'object') return Result.FAILED;
            if (!Object.prototype.hasOwnProperty.call(target, key)) {
                if ((target === this.config && OPTIONAL_ROOTS.has(key)) || OPTIONAL_ROOTS.has(root)) {
                    target[key] = {};
                    createdNodes.push({ target, key });
                }
                else return Result.FAILED;
            }
            if (!target[key] || typeof target[key] !== 'object') return Result.FAILED;
            target = target[key];
        }
        const key = keys.at(-1);
        if (!Object.prototype.hasOwnProperty.call(target, key)) {
            if (!OPTIONAL_ROOTS.has(root)) return Result.FAILED;
            target[key] = value;
            const result = await this.save();
            if (result !== Result.SUCCESS) {
                delete target[key];
                for (const node of createdNodes.reverse()) {
                    if (Object.keys(node.target[node.key] || {}).length === 0) delete node.target[node.key];
                }
            }
            return result;
        }
        if (typeof target[key] !== typeof value && target[key] !== null) return Result.FAILED;
        const previous = target[key];
        target[key] = value;
        const result = await this.save();
        if (result !== Result.SUCCESS) target[key] = previous;
        return result;
    }
}

module.exports = ConfigurationService;
