'use strict';

const BaseListener = require('../core/base/BaseListener');
const { itemLabels } = require('../utils/ItemLabels');
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
        this.lastStorageDebugWindow = null;
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
                this._captureStorageGui(this.bot.currentWindow);

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
        // /pv 2 may also be titled as a "kho" by the server. It is not the
        // NPC /kho GUI and must not overwrite the storage capacity snapshot.
        if (this.state.personalVault?.status === 'OPENING') {
            return;
        }
        const title = this._messageToString(window?.title);
        const normalizedTitle = this._normalizeTitleForMatch(title);

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
        const detailSlot = this._storageDetailSlot();
        const detail = this._storageItemSnapshot(window?.slots?.[detailSlot], detailSlot);
        this._logStorageDetailDebug(window, detailSlot, detail);
        const items = (window?.slots || [])
            .slice(0, totalSlots)
            .map((item, slot) => this._storageItemSnapshot(item, slot))
            .filter(item => item && this._isStorageContentItem(item));
        const capacity = detail?.capacity;
        const storage = detail?.storage || this._emptyStorageDetails();
        const capacityFromDetail = capacity
            && Number.isInteger(capacity.filled)
            && Number.isInteger(capacity.total)
            && capacity.total > 0;

        this.state.storage.gui = {
            title,
            rawTitle: this._compactNbt(window.title),
            usedSlots,
            totalSlots,
            filledSegments: capacityFromDetail ? capacity.filled : filledSegments,
            totalSegments: capacityFromDetail ? capacity.total : filledSegments + emptySegments,
            // The resource-pack bar is presentation only.  Slot 49 supplies
            // the server's real numeric capacity and takes precedence.
            full: Number.isFinite(storage.free)
                ? storage.free <= 0
                : (capacityFromDetail
                    ? capacity.filled >= capacity.total
                    : filledSegments > 0 && emptySegments === 0),
            detail: detail || this._emptyStorageDetail(detailSlot),
            items,
            updatedAt: Date.now()
        };
        this.state.storage.full = this.state.storage.gui.full;
        this.emit(Events.Storage.SNAPSHOT, {
            window,
            snapshot: this.state.storage.gui
        });
        return this.state.storage.gui;
    }

    _storageDetailSlot() {
        const configured = Number(this.config.storage?.detailSlot);
        return Number.isInteger(configured) && configured >= 0 && configured <= 53
            ? configured
            : 49;
    }

    _emptyStorageDetail(slot) {
        return {
            slot,
            available: false,
            itemName: null,
            displayName: null,
            lines: [],
            status: null,
            amount: null,
            capacity: null,
            storage: this._emptyStorageDetails(),
            rawNbt: null,
            rawComponents: null
        };
    }

    _storageItemSnapshot(item, slot) {
        if (!item) return null;

        // Keep both the visible GUI lines and the component/NBT labels.  A
        // MinerUA storage entry is often a vanilla carrier item, therefore
        // `item.name` alone cannot identify a refined material.
        const labels = [...new Set([
            ...itemLabels(item),
            ...this._itemTextLines(item)
        ])];
        const lines = labels;
        const text = lines.join('\n');
        const normalized = this._normalizeTitleForMatch(text);
        const status = this._matchStorageValue(text, /trạng\s*thái\s*:\s*([^\n]+)/i);
        const amount = this._readNumberAfterLabel(lines, /so\s*luong\s*:/i)
            ?? this._parseStorageNumber(this._matchStorageValue(normalized, /so\s*luong\s*:\s*([\d.,]+)/i));
        const capacity = this._parseStorageCapacity(normalized);
        const storage = this._parseStorageDetails(text, lines);

        return {
            slot,
            available: true,
            itemName: item.name || null,
            displayName: item.displayName || lines[0] || item.name || null,
            count: Number.isFinite(item.count) ? item.count : 1,
            labels,
            lines,
            status,
            amount,
            capacity,
            storage,
            rawNbt: this._compactNbt(item.nbt),
            rawComponents: this._compactNbt(item.components)
        };
    }

    _emptyStorageDetails() {
        return {
            total: null,
            used: null,
            free: null,
            usedPercent: null,
            freePercent: null
        };
    }

    _isStorageContentItem(item) {
        if (!item?.itemName) return false;
        return ![
            'black_stained_glass_pane',
            'gray_stained_glass_pane',
            'chest_minecart',
            'player_head',
            'book'
        ].includes(item.itemName);
    }

    _itemTextLines(item) {
        const values = [];
        if (item.displayName) values.push(item.displayName);
        if (item.customName) this._collectNbtText(item.customName, values);
        if (item.customLore) this._collectNbtText(item.customLore, values);
        this._collectNbtText(item.nbt, values);
        // Minecraft 1.20.5+ stores display/lore as data components, not NBT.
        // Mineflayer exposes both the raw component array and `customLore`.
        this._collectNbtText(item.components, values);
        if (item.componentMap instanceof Map) {
            for (const component of item.componentMap.values()) {
                this._collectNbtText(component?.data, values);
            }
        }
        return [...new Set(values
            .map(value => String(value || '').replace(/[\r\n\t]+/g, ' ').trim())
            .filter(value => value && !value.startsWith('minecraft:')))]
            .slice(0, 24);
    }

    _logStorageDetailDebug(window, slot, detail) {
        if (this.config.storage?.guiDebug !== true || this.lastStorageDebugWindow === window) return;
        this.lastStorageDebugWindow = window;
        const item = window?.slots?.[slot];
        this.info(
            `[Storage slot ${slot}] name=${item?.name || '(trống)'} `
            + `display=${JSON.stringify(item?.displayName || null)} `
            + `customLore=${this._compactNbt(item?.customLore)} `
            + `components=${this._compactNbt(item?.components)} `
            + `nbt=${this._compactNbt(item?.nbt)} `
            + `parsed=${JSON.stringify(detail?.storage || null)}`
        );
    }

    _collectNbtText(value, values, depth = 0) {
        if (depth > 32 || value === null || value === undefined) return;
        if (typeof value === 'string') {
            const text = value.trim();
            if (!text) return;
            if ((text.startsWith('{') || text.startsWith('[')) && text.length <= 20000) {
                try {
                    const component = JSON.parse(text);
                    const rendered = this._extractTextComponent(component);
                    if (rendered) values.push(rendered);
                    else this._collectNbtText(component, values, depth + 1);
                    return;
                } catch (_) {
                    // A normal NBT string may happen to start with a brace.
                }
            }
            values.push(text);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(entry => this._collectNbtText(entry, values, depth + 1));
            return;
        }
        // Mineflayer can expose 1.20.5+ data components as a Map rather than
        // the array used by older protocol adapters. JSON.stringify(Map)
        // hides these entries, which made several /kho item amounts appear
        // unknown even though their tooltip was present.
        if (value instanceof Map) {
            value.forEach(entry => this._collectNbtText(entry, values, depth + 1));
            return;
        }
        if (typeof value !== 'object') return;

        // prismarine-chat components occasionally arrive as class instances.
        // Their rendered lore is available only through a custom toString(),
        // not as enumerable `text`/`value` fields.
        if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
            try {
                const rendered = value.toString();
                if (rendered && !/^\[object\s.+\]$/.test(rendered)) {
                    this._collectNbtText(rendered, values, depth + 1);
                }
            } catch (_) {
                // Keep traversing ordinary fields if a component refuses to render.
            }
        }
        // Some protocol adapters expose component collections as an iterable
        // wrapper rather than a native Map/Array.
        if (typeof value[Symbol.iterator] === 'function') {
            try {
                for (const entry of value) this._collectNbtText(entry, values, depth + 1);
                return;
            } catch (_) {
                // Fall through to enumerable fields.
            }
        }
        if (value.type === 'string') {
            this._collectNbtText(value.value, values, depth + 1);
            return;
        }
        if (value.type === 'list' || value.type === 'compound') {
            this._collectNbtText(value.value, values, depth + 1);
            return;
        }
        if (Object.prototype.hasOwnProperty.call(value, 'value') && Object.keys(value).length <= 3) {
            this._collectNbtText(value.value, values, depth + 1);
            return;
        }
        Object.values(value).forEach(entry => this._collectNbtText(entry, values, depth + 1));
    }

    _matchStorageValue(text, expression) {
        const match = expression.exec(String(text || ''));
        return match?.[1]?.trim() || null;
    }

    _parseStorageNumber(value) {
        if (!value) return null;
        const parsed = Number(String(value).replace(/[.,]/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    }

    /**
     * Resource-pack lore often separates a label, color, and number into
     * different chat components: `Số lượng:` → `yellow` → `47,782`.
     * Reads the first numeric component after the semantic label.
     */
    _readNumberAfterLabel(lines, label) {
        const values = Array.isArray(lines) ? lines : [];
        const index = values.findIndex(line => label.test(this._normalizeTitleForMatch(line)));
        if (index < 0) return null;
        for (let offset = 1; offset <= 6 && index + offset < values.length; offset += 1) {
            const match = /([\d][\d.,]*)/.exec(String(values[index + offset] || ''));
            const parsed = this._parseStorageNumber(match?.[1]);
            if (Number.isFinite(parsed)) return parsed;
        }
        return null;
    }

    _parseStorageCapacity(normalizedText) {
        const match = /(?:dung\s*luong|suc\s*chua|kho)\s*:?\s*(\d+)\s*\/\s*(\d+)/i.exec(normalizedText);
        if (!match) return null;
        const filled = Number(match[1]);
        const total = Number(match[2]);
        return Number.isInteger(filled) && Number.isInteger(total) && filled >= 0 && total > 0
            ? { filled, total }
            : null;
    }

    /**
     * Reads the authoritative numbers from the information item in slot 49.
     * Example server lore:
     * - Dung luong: 800,000
     * - Da su dung: 453,724 / 56.72%
     * - Con trong: 346,276 / 43.28%
     *
     * @param {String} text
     * @returns {{total:Number|null, used:Number|null, free:Number|null, usedPercent:Number|null, freePercent:Number|null}}
     * @private
     */
    _parseStorageDetails(text, lines = []) {
        const normalized = this._normalizeTitleForMatch(text);
        const details = this._emptyStorageDetails();
        const integer = expression => this._parseStorageNumber(expression.exec(normalized)?.[1]);
        const percent = expression => {
            const value = expression.exec(normalized)?.[1];
            if (!value) return null;
            const parsed = Number(String(value).replace(',', '.'));
            return Number.isFinite(parsed) ? parsed : null;
        };

        // Do not mistake the legacy `4/8` cosmetic title format for an
        // absolute capacity.  Real capacity has no slash after the number.
        details.total = integer(/dung\s*luong\s*:?\s*([\d.,]+)(?!\s*\/)/i)
            ?? this._readNumberAfterLabel(lines, /dung\s*luong\s*:/i);
        details.used = integer(/da\s*su\s*dung\s*:?\s*([\d.,]+)/i)
            ?? this._readNumberAfterLabel(lines, /da\s*su\s*dung\s*:/i);
        details.free = integer(/con\s*trong\s*:?\s*([\d.,]+)/i)
            ?? this._readNumberAfterLabel(lines, /con\s*trong\s*:/i);
        details.usedPercent = percent(/da\s*su\s*dung\s*:?\s*[\d.,]+\s*\/\s*([\d.,]+)\s*%/i);
        details.freePercent = percent(/con\s*trong\s*:?\s*[\d.,]+\s*\/\s*([\d.,]+)\s*%/i);

        if (!Number.isFinite(details.free) && Number.isFinite(details.total) && Number.isFinite(details.used)) {
            details.free = Math.max(0, details.total - details.used);
        }
        if (!Number.isFinite(details.total) && Number.isFinite(details.used) && Number.isFinite(details.free)) {
            details.total = details.used + details.free;
        }
        return details;
    }

    /**
     * Normalizes ordinary Vietnamese text and the small-cap glyphs used by the
     * server resource pack. Unicode normalization alone does not turn
     * `ᴋʜᴏ` into `kho`, which previously made the real /kho GUI invisible.
     *
     * @param {*} title
     * @returns {String}
     * @private
     */
    _normalizeTitleForMatch(title) {
        const smallCaps = {
            'ᴋ': 'k',
            'ʜ': 'h',
            'ᴏ': 'o',
            'ᴄ': 'c',
            'ᴜ': 'u',
            'ѕ': 's',
            'ʀ': 'r',
            'ᴇ': 'e',
            'ɴ': 'n',
            'ɪ': 'i',
            'ᴍ': 'm',
            'ᴀ': 'a'
        };

        return String(title || '')
            .replace(/[ᴋʜᴏᴄᴜѕʀᴇɴɪᴍᴀ]/g, character => smallCaps[character] || character)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
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
            const serializable = value instanceof Map ? [...value.entries()] : value;
            const text = JSON.stringify(serializable).replace(/[\r\n]+/g, ' ');
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
