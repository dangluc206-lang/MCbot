'use strict';

/**
 * ============================================================================
 * Result
 * ============================================================================
 *
 * Chuẩn hóa giá trị trả về của toàn bộ Framework.
 *
 * Quy tắc:
 *
 * - Không return true/false cho nghiệp vụ.
 * - Không return null.
 * - Không throw Exception cho các trường hợp có thể xử lý.
 *
 * Exception chỉ dành cho:
 * - Programming Error
 * - Fatal Error
 * - Unexpected Error
 *
 * ============================================================================
 */

const Result = Object.freeze({
    /**
     * Thành công.
     */
    SUCCESS: 'SUCCESS',

    /**
     * Thất bại.
     */
    FAILED: 'FAILED',

    /**
     * Hết thời gian chờ.
     */
    TIMEOUT: 'TIMEOUT',

    /**
     * Thao tác bị hủy.
     */
    CANCELLED: 'CANCELLED',

    /**
     * Bỏ qua.
     */
    SKIPPED: 'SKIPPED',

    /**
     * Cần thử lại.
     */
    RETRY: 'RETRY',

    /**
     * Chưa hoàn thành.
     */
    PENDING: 'PENDING',

    /**
     * Không cần thực hiện.
     */
    NO_ACTION: 'NO_ACTION',

    /**
     * Đã hoàn thành trước đó.
     */
    ALREADY_DONE: 'ALREADY_DONE',

    /**
     * Inventory đầy.
     */
    INVENTORY_FULL: 'INVENTORY_FULL',

    /**
     * Inventory trống.
     */
    INVENTORY_EMPTY: 'INVENTORY_EMPTY',

    /**
     * Không tìm thấy Item.
     */
    ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',

    /**
     * Không đủ Item.
     */
    INSUFFICIENT_ITEMS: 'INSUFFICIENT_ITEMS',

    /**
     * Không còn slot trống.
     */
    NO_FREE_SLOT: 'NO_FREE_SLOT',

    /**
     * Không tìm thấy GUI.
     */
    GUI_NOT_FOUND: 'GUI_NOT_FOUND',

    /**
     * GUI mở thất bại.
     */
    GUI_OPEN_FAILED: 'GUI_OPEN_FAILED',

    /**
     * GUI đóng thất bại.
     */
    GUI_CLOSE_FAILED: 'GUI_CLOSE_FAILED',

    /**
     * GUI timeout.
     */
    GUI_TIMEOUT: 'GUI_TIMEOUT',

    /**
     * Click GUI thất bại.
     */
    GUI_CLICK_FAILED: 'GUI_CLICK_FAILED',

    /**
     * Không tìm thấy NPC.
     */
    NPC_NOT_FOUND: 'NPC_NOT_FOUND',

    /**
     * Không thể tới vị trí.
     */
    MOVEMENT_FAILED: 'MOVEMENT_FAILED',

    /**
     * Bot bị kẹt.
     */
    STUCK: 'STUCK',

    /**
     * Không có đường đi.
     */
    NO_PATH: 'NO_PATH',

    /**
     * Chưa kết nối.
     */
    NOT_CONNECTED: 'NOT_CONNECTED',

    /**
     * Mất kết nối.
     */
    DISCONNECTED: 'DISCONNECTED',

    /**
     * Bị Kick.
     */
    KICKED: 'KICKED',

    /**
     * Chưa login.
     */
    NOT_LOGGED_IN: 'NOT_LOGGED_IN',

    /**
     * Chưa vào SkyBlock.
     */
    NOT_IN_SKYBLOCK: 'NOT_IN_SKYBLOCK',

    /**
     * Người chơi đã chết.
     */
    PLAYER_DEAD: 'PLAYER_DEAD',

    /**
     * Máu quá thấp.
     */
    LOW_HEALTH: 'LOW_HEALTH',

    /**
     * Đói.
     */
    LOW_FOOD: 'LOW_FOOD',

    /**
     * Không có đồ ăn.
     */
    NO_FOOD: 'NO_FOOD',

    /**
     * Resource Pack chưa được chấp nhận.
     */
    RESOURCE_PACK_REQUIRED: 'RESOURCE_PACK_REQUIRED',

    /**
     * Chế độ đang chạy.
     */
    MODE_ALREADY_RUNNING: 'MODE_ALREADY_RUNNING',

    /**
     * Chế độ chưa chạy.
     */
    MODE_NOT_RUNNING: 'MODE_NOT_RUNNING',

    /**
     * Framework đang Recovery.
     */
    RECOVERING: 'RECOVERING',

    /**
     * Framework đang bận.
     */
    BUSY: 'BUSY',
    ENGINE_ALREADY_RUNNING: 'ENGINE_ALREADY_RUNNING',
    ENGINE_NOT_RUNNING: 'ENGINE_NOT_RUNNING',
});

module.exports = Object.freeze(Result);