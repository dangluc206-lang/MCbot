'use strict';

module.exports = function formatPosition(position) {
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return 'Chưa có';
    return `${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`;
};
