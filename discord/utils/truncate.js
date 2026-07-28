'use strict';

module.exports = function truncate(value, maxLength = 1024) {
    const text = String(value ?? '');
    return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
};
