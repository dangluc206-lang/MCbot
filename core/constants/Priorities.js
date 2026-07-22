'use strict';

/**
 * ============================================================================
 * Priorities
 * ============================================================================
 *
 * Trung tâm quản lý mức độ ưu tiên của Framework.
 *
 * Quy tắc:
 * - Giá trị càng lớn => độ ưu tiên càng cao.
 * - Không sửa giá trị đã public.
 * - Chỉ được bổ sung thêm nếu thật sự cần.
 *
 * Thứ tự xử lý:
 *
 * CRITICAL
 *     ↓
 * HIGH
 *     ↓
 * NORMAL
 *     ↓
 * LOW
 *     ↓
 * BACKGROUND
 *
 * ============================================================================
 */

const Priority = Object.freeze({
    /**
     * Sự cố nghiêm trọng.
     *
     * Ví dụ:
     * - Disconnect
     * - Kick
     * - Crash
     * - Fatal Error
     */
    CRITICAL: 100,

    /**
     * Recovery hoặc sự kiện quan trọng.
     *
     * Ví dụ:
     * - Respawn
     * - Resource Pack
     * - Login
     */
    HIGH: 75,

    /**
     * Luồng hoạt động bình thường.
     *
     * Ví dụ:
     * - Collector
     * - Dungeon
     * - Storage
     */
    NORMAL: 50,

    /**
     * Tác vụ nền.
     *
     * Ví dụ:
     * - Inventory Update
     * - Runtime Sync
     */
    LOW: 25,

    /**
     * Chạy khi hệ thống rảnh.
     *
     * Ví dụ:
     * - Metrics
     * - Statistics
     * - Cleanup
     */
    BACKGROUND: 0
});

module.exports = Object.freeze(Priority);