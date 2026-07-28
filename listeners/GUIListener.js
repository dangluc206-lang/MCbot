'use strict';

const BaseListener = require('../core/base/BaseListener');
const Result = require('../core/constants/Result');
const Events = require('../core/constants/Events');

/**
 * ============================================================================
 * GUIListener
 * ============================================================================
 *
 * Đồng bộ trạng thái GUI từ Mineflayer vào Runtime.
 *
 * Trách nhiệm:
 * - Cập nhật Runtime.
 * - Emit Framework Event.
 *
 * Không:
 * - Không xử lý workflow.
 * - Không click GUI.
 * - Không gọi Service.
 *
 * ============================================================================
 */

class GUIListener extends BaseListener {

    constructor(ctx) {
        super(ctx);

        this.name = 'GUIListener';
    }

    async register() {

        await super.register();

        /**
         * GUI Open
         */
        this.bind(
            this.bot,
            'windowOpen',
            window => {

                this.state.gui.opened = true;
                this.state.gui.window = window;
                this.state.gui.title = window.title;
                this.state.gui.slots = [...window.slots];
                this._captureStorageGui(window);

                this.emit(
                    Events.GUI.OPEN,
                    window
                );

                if (this.config.logging?.guiSlots === true) {
                    this._logContainerSlots(window);
                }

            }
        );

        /**
         * GUI Close
         */
        this.bind(
            this.bot,
            'windowClose',
            window => {

                this.state.gui.opened = false;
                this.state.gui.window = null;
                this.state.gui.title = null;
                this.state.gui.slots = [];

                this.emit(
                    Events.GUI.CLOSE,
                    window
                );

            }
        );

        /**
         * GUI Slot Update
         */
        this.bind(
            this.bot,
            'windowUpdate',
            (slot, oldItem, newItem) => {

                if (!this.state.gui.opened || !this.bot.currentWindow) {
                    return;
                }

                this.state.gui.slots = [
                    ...this.bot.currentWindow.slots,
                    
                ];
                this.state.gui.lastUpdate = Date.now();

                this.emit(
                    Events.GUI.SLOT,
                    {
                        slot,
                        oldItem,
                        newItem
                    }
                );

                this.emit(
                    Events.GUI.UPDATE,
                    this.state.gui.slots
                );

            }
        );

        return Result.SUCCESS;
    }

    /**
     * In dữ liệu item thô của phần container trong GUI để cấu hình các GUI
     * custom (như /kho) mà resource pack chỉ thay đổi cách hiển thị.
     *
     * Không bao gồm phần inventory cá nhân của bot.
     *
     * @param {*} window
     * @private
     */
    _logContainerSlots(window) {
        if (!window || !Array.isArray(window.slots)) {
            return;
        }

        const containerEnd = Number.isInteger(window.inventoryStart)
            ? window.inventoryStart
            : window.slots.length;
        const slots = [];

        for (let slot = 0; slot < containerEnd; slot++) {
            const item = window.slots[slot];
            if (!item) {
                continue;
            }

            const nbt = this._compactNbt(item.nbt);
            slots.push(
                `#${slot} ${item.name || 'unknown'} x${item.count || 1}`
                + `${item.displayName ? ` (${item.displayName})` : ''}`
                + `${nbt ? ` nbt=${nbt}` : ''}`
            );
        }

        const title = this._messageToString(window.title);
        const rawTitle = this._compactNbt(window.title);

        this.success(
            `[GUI slots] title="${title}"`
            + `${rawTitle ? ` rawTitle=${rawTitle}` : ''} `
            + (slots.length ? slots.join(' | ') : '(không có item trong phần container)')
        );
    }

    /**
     * Lưu snapshot GUI /kho gần nhất để Dashboard Discord hiển thị.
     * Quy tắc "kho đầy" sẽ được xác định từ title/slot server gửi thực tế.
     *
     * @param {*} window
     * @private
     */
    _captureStorageGui(window) {
        const title = this._messageToString(window?.title);
        const normalizedTitle = title
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

        if (!normalizedTitle.includes('kho')) {
            return;
        }

        const totalSlots = Number.isInteger(window.inventoryStart)
            ? window.inventoryStart
            : (window?.slots?.length || 0);
        const usedSlots = (window?.slots || [])
            .slice(0, totalSlots)
            .filter(Boolean)
            .length;
        const filledSegments = (title.match(/▮/g) || []).length;
        const emptySegments = (title.match(/▯/g) || []).length;

        this.state.storage.gui = {
            title,
            rawTitle: this._compactNbt(window.title),
            usedSlots,
            totalSlots,
            filledSegments,
            totalSegments: filledSegments + emptySegments,
            full: filledSegments > 0 && emptySegments === 0,
            updatedAt: Date.now()
        };
        this.state.storage.full = this.state.storage.gui.full;
    }

    /**
     * @param {*} value
     * @returns {String}
     * @private
     */
    _compactNbt(value) {
        if (!value) {
            return '';
        }

        try {
            const text = JSON.stringify(value).replace(/[\r\n]+/g, ' ');
            return text.length > 500 ? `${text.slice(0, 497)}...` : text;
        } catch (error) {
            return '[không thể đọc]';
        }
    }

    /**
     * @param {*} value
     * @returns {String}
     * @private
     */
    _messageToString(value) {
        if (value === null || value === undefined) {
            return '';
        }

        try {
            const rendered = typeof value.toString === 'function' ? value.toString() : String(value);
            if (rendered && rendered !== '[object Object]') {
                return rendered;
            }

            // Một số NBT title của server trả toString() là chuỗi rỗng dù
            // nội dung thực nằm trong compound.extra.
            return this._extractTextComponent(value) || rendered;
        } catch (error) {
            return '';
        }
    }

    /**
     * Đọc ChatMessage/NBT component của các server 1.21. Một số title không
     * có toString() hữu ích và chỉ hiện thành [object Object].
     *
     * @param {*} component
     * @returns {String}
     * @private
     */
    _extractTextComponent(component) {
        if (typeof component === 'string') {
            return component;
        }

        if (Array.isArray(component)) {
            return component.map(value => this._extractTextComponent(value)).join('');
        }

        if (!component || typeof component !== 'object') {
            return '';
        }

        if (component.type === 'string' && typeof component.value === 'string') {
            return component.value;
        }

        if (component.type === 'list') {
            const values = Array.isArray(component.value)
                ? component.value
                : component.value?.value;
            return Array.isArray(values)
                ? values.map(value => this._extractTextComponent(value)).join('')
                : '';
        }

        if (component.type === 'compound' && component.value) {
            const value = component.value;
            return this._extractTextComponent(value.text)
                + this._extractTextComponent(value.extra);
        }

        // prismarine-nbt biểu diễn các phần tử trong compound list thành object
        // thường ({ text: tag, color: tag }), không có type/value bao ngoài.
        if (component.text || component.extra) {
            return this._extractTextComponent(component.text)
                + this._extractTextComponent(component.extra);
        }

        return '';
    }

}

module.exports = GUIListener;
