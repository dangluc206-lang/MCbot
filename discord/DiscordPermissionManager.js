'use strict';

const Permission = require('./constants/DiscordPermission');

const RANK = Object.freeze({
    [Permission.VIEWER]: 1,
    [Permission.MODERATOR]: 2,
    [Permission.ADMIN]: 3,
    [Permission.OWNER]: 4
});

function idSet(value) {
    return new Set(String(value || '').split(',').map(id => id.trim()).filter(Boolean));
}

/** Resolves Discord user and role based permissions on the server side. */
class DiscordPermissionManager {
    constructor(config = {}) {
        const permissions = config.permissions || {};
        this.ownerIds = idSet(config.ownerIds || config.ownerId || permissions.ownerIds);
        this.adminRoleIds = idSet(permissions.adminRoleIds || config.adminRoleIds);
        this.moderatorRoleIds = idSet(permissions.moderatorRoleIds || config.moderatorRoleIds);
        this.viewerRoleIds = idSet(permissions.viewerRoleIds || config.viewerRoleIds);
    }

    levelFor(interaction) {
        const userId = interaction.user?.id;
        if (this.ownerIds.has(userId)) return Permission.OWNER;
        const roleIds = interaction.member?.roles?.cache
            ? new Set(interaction.member.roles.cache.keys())
            : new Set(interaction.member?.roles || []);
        if ([...roleIds].some(id => this.adminRoleIds.has(id))) return Permission.ADMIN;
        if ([...roleIds].some(id => this.moderatorRoleIds.has(id))) return Permission.MODERATOR;
        if ([...roleIds].some(id => this.viewerRoleIds.has(id))) return Permission.VIEWER;
        return null;
    }

    can(interaction, required = Permission.VIEWER) {
        const actual = this.levelFor(interaction);
        return Boolean(actual && RANK[actual] >= RANK[required]);
    }
}

module.exports = DiscordPermissionManager;
