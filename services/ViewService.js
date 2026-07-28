'use strict';

const BaseService = require('../core/base/BaseService');
const Result = require('../core/constants/Result');

/** Provides only supported viewer capabilities; it never exposes a private URL. */
class ViewService extends BaseService {
    constructor(ctx) {
        super(ctx);
        this.name = 'ViewService';
    }

    viewerUrl() {
        const url = String(this.config.viewer?.publicUrl || '').trim();
        return /^https:\/\//i.test(url) ? url : null;
    }

    async capture() {
        return { result: Result.FAILED, reason: 'Screenshot chưa được viewer hiện tại hỗ trợ.' };
    }
}

module.exports = ViewService;
