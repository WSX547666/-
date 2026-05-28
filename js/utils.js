/**
 * IoT Monitor - 工具函数模块
 * 提供通用工具方法：时间格式化、数据验证、DOM操作等
 */

const Utils = {
    /**
     * 格式化时间戳为可读字符串
     * @param {number|Date} timestamp - 时间戳或Date对象
     * @param {string} format - 格式类型 'full'|'time'|'date'|'short'
     * @returns {string} 格式化后的时间字符串
     */
    formatTime(timestamp, format = 'full') {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        if (isNaN(date.getTime())) return '--';

        const pad = (n) => String(n).padStart(2, '0');
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());

        switch (format) {
            case 'full':
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            case 'time':
                return `${hours}:${minutes}:${seconds}`;
            case 'date':
                return `${year}-${month}-${day}`;
            case 'short':
                return `${month}-${day} ${hours}:${minutes}`;
            default:
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }
    },

    /**
     * 获取当前时间的格式化字符串
     * @returns {string} 当前时间
     */
    getCurrentTime() {
        return this.formatTime(new Date(), 'full');
    },

    /**
     * 数值格式化，保留指定小数位
     * @param {number} value - 数值
     * @param {number} decimals - 小数位数
     * @returns {string} 格式化后的数值
     */
    formatNumber(value, decimals = 1) {
        if (value === null || value === undefined || isNaN(value)) return '--';
        return Number(value).toFixed(decimals);
    },

    /**
     * 验证JSON数据是否符合物联网数据格式
     * @param {object} data - 解析后的JSON对象
     * @returns {boolean} 是否有效
     */
    validateIoTData(data) {
        if (!data || typeof data !== 'object') return false;
        // 至少包含一个传感器数据字段
        const sensorFields = ['temperature', 'humidity', 'pressure', 'light', 'voltage', 'temp', 'humi'];
        return sensorFields.some(field => data[field] !== undefined);
    },

    /**
     * 标准化设备数据格式
     * 支持多种ESP32上传格式的自动适配
     * @param {object} raw - 原始JSON数据
     * @returns {object} 标准化后的数据
     */
    normalizeDeviceData(raw) {
        const now = Date.now();
        return {
            deviceId: raw.device_id || raw.deviceId || raw.id || 'unknown',
            timestamp: raw.timestamp ? (raw.timestamp > 1e12 ? raw.timestamp : raw.timestamp * 1000) : now,
            temperature: parseFloat(raw.temperature ?? raw.temp ?? raw.sensors?.temperature ?? NaN),
            humidity: parseFloat(raw.humidity ?? raw.humi ?? raw.sensors?.humidity ?? NaN),
            pressure: parseFloat(raw.pressure ?? raw.pres ?? raw.sensors?.pressure ?? NaN),
            light: parseFloat(raw.light ?? raw.lux ?? raw.sensors?.light ?? NaN),
            voltage: parseFloat(raw.voltage ?? raw.volt ?? raw.sensors?.voltage ?? NaN),
            status: raw.status || raw.state || 'online',
            rssi: parseInt(raw.rssi ?? raw.signal ?? raw.sensors?.rssi ?? NaN),
            raw: raw
        };
    },

    /**
     * 创建DOM元素
     * @param {string} tag - 标签名
     * @param {object} attrs - 属性对象
     * @param {string} text - 文本内容
     * @returns {HTMLElement} 创建的元素
     */
    createElement(tag, attrs = {}, text = '') {
        const el = document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => {
            if (key === 'className') {
                el.className = value;
            } else if (key === 'dataset') {
                Object.entries(value).forEach(([k, v]) => el.dataset[k] = v);
            } else {
                el.setAttribute(key, value);
            }
        });
        if (text) el.textContent = text;
        return el;
    },

    /**
     * 防抖函数
     * @param {Function} fn - 目标函数
     * @param {number} delay - 延迟毫秒数
     * @returns {Function} 防抖后的函数
     */
    debounce(fn, delay = 300) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /**
     * 节流函数
     * @param {Function} fn - 目标函数
     * @param {number} interval - 间隔毫秒数
     * @returns {Function} 节流后的函数
     */
    throttle(fn, interval = 100) {
        let lastTime = 0;
        return function (...args) {
            const now = Date.now();
            if (now - lastTime >= interval) {
                lastTime = now;
                fn.apply(this, args);
            }
        };
    },

    /**
     * 安全的JSON解析
     * @param {string} str - JSON字符串
     * @returns {object|null} 解析结果
     */
    safeJsonParse(str) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return null;
        }
    },

    /**
     * 生成随机设备ID
     * @returns {string} 设备ID
     */
    generateDeviceId() {
        return 'ESP32_' + Math.random().toString(36).substr(2, 6).toUpperCase();
    },

    /**
     * 计算两个时间戳之间的可读差值
     * @param {number} timestamp - 过去的时间戳
     * @returns {string} 如 "3分钟前"
     */
    timeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 5) return '刚刚';
        if (seconds < 60) return `${seconds}秒前`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
        return `${Math.floor(seconds / 86400)}天前`;
    },

    /**
     * 判断设备是否在线（默认30秒无数据视为离线）
     * @param {number} lastSeen - 最后一次数据时间戳
     * @param {number} timeout - 超时时间（毫秒）
     * @returns {boolean} 是否在线
     */
    isDeviceOnline(lastSeen, timeout = 30000) {
        return (Date.now() - lastSeen) < timeout;
    },

    /**
     * 本地存储封装
     */
    storage: {
        get(key, defaultValue = null) {
            try {
                const value = localStorage.getItem(`iot_${key}`);
                return value ? JSON.parse(value) : defaultValue;
            } catch {
                return defaultValue;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(`iot_${key}`, JSON.stringify(value));
            } catch (e) {
                console.warn('LocalStorage write failed:', e);
            }
        },
        remove(key) {
            localStorage.removeItem(`iot_${key}`);
        }
    }
};

// 冻结工具对象，防止意外修改
Object.freeze(Utils);
