'use strict';

async function withdrawVaultItems(requests, withdraw, syncInventory, Result) {
    if (!Array.isArray(requests) || requests.length === 0) return Result.NO_ACTION;
    const result = await withdraw?.(requests);
    if (result !== Result.SUCCESS && result !== Result.NO_ACTION) return result || Result.FAILED;
    syncInventory?.({ emit: false });
    return result;
}

module.exports = { withdrawVaultItems };
