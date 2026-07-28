'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ConfigurationService = require('../services/ConfigurationService');
const Result = require('../core/constants/Result');

test('gameplay persistence omits Discord and SkyBlock password secrets', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcbot-config-'));
    const configPath = path.join(directory, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
        discord: { token: 'legacy-token' },
        skyblock: { loginPassword: 'legacy-password', serverSlot: 12 },
        storage: { guiCheckIntervalMs: 30000 }
    }), 'utf8');

    const config = {
        configPath,
        discord: { token: 'env-token' },
        skyblock: { loginPassword: 'env-password', serverSlot: 12 },
        storage: { guiCheckIntervalMs: 30000 }
    };
    const ctx = {
        bot: null,
        config,
        runtime: { state: {} },
        logger: { error() {} },
        getManager: () => null,
        getService: () => null,
        getMode: () => null
    };

    const service = new ConfigurationService(ctx);
    assert.equal(await service.set('storage.guiCheckIntervalMs', 5000), Result.SUCCESS);

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(persisted.storage.guiCheckIntervalMs, 5000);
    assert.equal('discord' in persisted, false);
    assert.equal('loginPassword' in persisted.skyblock, false);

    fs.rmSync(directory, { recursive: true, force: true });
});
