'use strict';

const fs = require('fs');
const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');

/** Safely persists non-sensitive Discord configuration changes. */
class ConfigurationService extends BaseService {
    constructor(ctx) { super(ctx); this.name = 'ConfigurationService'; }

    async save() {
        if (!this.config.configPath) return Result.FAILED;
        fs.writeFileSync(this.config.configPath, `${JSON.stringify(this.config, null, 2)}\n`, 'utf8');
        return Result.SUCCESS;
    }

    async set(path, value) {
        if (!/^(skyblock|storage|dungeon|fishing)\.[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)?$/.test(path)) return Result.FAILED;
        const keys = path.split('.');
        let target = this.config;
        for (const key of keys.slice(0, -1)) { if (!target || typeof target[key] !== 'object') return Result.FAILED; target = target[key]; }
        const key = keys.at(-1);
        if (!Object.prototype.hasOwnProperty.call(target, key)) return Result.FAILED;
        if (typeof target[key] !== typeof value && target[key] !== null) return Result.FAILED;
        target[key] = value;
        return this.save();
    }
}

module.exports = ConfigurationService;
