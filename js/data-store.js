/**
 * IoT Monitor - 数据存储模块
 * 管理设备数据的内存存储、历史记录和数据统计
 */

const DataStore = {
    // 设备最新数据 { deviceId: dataObject }
    _devices: new Map(),

    // 传感器历史数据 { 'deviceId_sensorType': [{time, value}] }
    _history: new Map(),

    // 实时日志数组
    _logs: [],

    // 告警历史
    _alerts: [],

    // 数据接收计数
    _receivedCount: 0,

    // 历史数据最大条数（每个传感器）
    MAX_HISTORY: 500,

    // 日志最大条数
    MAX_LOGS: 1000,

    // 告警最大条数
    MAX_ALERTS: 200,

    /**
     * 初始化数据存储
     */
    init() {
        this._devices.clear();
        this._history.clear();
        this._logs = [];
        this._alerts = [];
        this._receivedCount = 0;
        console.log('[DataStore] 数据存储初始化完成');
    },

    /**
     * 更新设备数据
     * @param {object} data - 标准化后的设备数据
     * @returns {object} 包含变化信息的结果
     */
    updateDevice(data) {
        const { deviceId } = data;
        const prevData = this._devices.get(deviceId);
        const isNewDevice = !prevData;

        // 存储最新数据
        this._devices.set(deviceId, {
            ...data,
            lastSeen: Date.now(),
            firstSeen: prevData?.firstSeen || Date.now()
        });

        // 更新历史数据
        this._addToHistory(deviceId, data);

        // 增加计数
        this._receivedCount++;

        return {
            isNewDevice,
            prevData,
            currentData: data
        };
    },

    /**
     * 添加历史数据点
     * @param {string} deviceId - 设备ID
     * @param {object} data - 传感器数据
     */
    _addToHistory(deviceId, data) {
        const timestamp = data.timestamp || Date.now();
        const sensors = ['temperature', 'humidity', 'pressure', 'light', 'voltage'];

        sensors.forEach(sensor => {
            const value = data[sensor];
            if (value !== undefined && !isNaN(value)) {
                const key = `${deviceId}_${sensor}`;
                if (!this._history.has(key)) {
                    this._history.set(key, []);
                }
                const history = this._history.get(key);
                history.push({ time: timestamp, value: value });

                // 限制历史数据长度
                if (history.length > this.MAX_HISTORY) {
                    history.splice(0, history.length - this.MAX_HISTORY);
                }
            }
        });
    },

    /**
     * 获取设备的传感器历史数据
     * @param {string} deviceId - 设备ID
     * @param {string} sensorType - 传感器类型
     * @returns {Array} 历史数据数组
     */
    getHistory(deviceId, sensorType) {
        return this._history.get(`${deviceId}_${sensorType}`) || [];
    },

    /**
     * 获取所有设备列表
     * @returns {Array} 设备数组
     */
    getAllDevices() {
        return Array.from(this._devices.values());
    },

    /**
     * 获取单个设备数据
     * @param {string} deviceId - 设备ID
     * @returns {object|null} 设备数据
     */
    getDevice(deviceId) {
        return this._devices.get(deviceId) || null;
    },

    /**
     * 获取在线设备数量
     * @param {number} timeout - 超时毫秒数
     * @returns {number} 在线设备数
     */
    getOnlineCount(timeout = 30000) {
        let count = 0;
        this._devices.forEach(device => {
            if (Utils.isDeviceOnline(device.lastSeen, timeout)) count++;
        });
        return count;
    },

    /**
     * 获取所有设备统计摘要
     * @returns {object} 统计数据
     */
    getSummary() {
        const devices = this.getAllDevices();
        if (devices.length === 0) {
            return {
                totalDevices: 0,
                onlineDevices: 0,
                avgTemp: '--',
                avgHumi: '--',
                avgPressure: '--',
                avgLight: '--',
                totalReceived: this._receivedCount
            };
        }

        const onlineDevices = devices.filter(d => Utils.isDeviceOnline(d.lastSeen));
        const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : null;

        return {
            totalDevices: devices.length,
            onlineDevices: onlineDevices.length,
            avgTemp: avg(devices.map(d => d.temperature).filter(v => !isNaN(v))),
            avgHumi: avg(devices.map(d => d.humidity).filter(v => !isNaN(v))),
            avgPressure: avg(devices.map(d => d.pressure).filter(v => !isNaN(v))),
            avgLight: avg(devices.map(d => d.light).filter(v => !isNaN(v))),
            totalReceived: this._receivedCount
        };
    },

    /**
     * 添加日志条目
     * @param {string} level - 日志级别 'info'|'warn'|'error'|'data'
     * @param {string} message - 日志消息
     * @param {object} detail - 附加详情
     */
    addLog(level, message, detail = null) {
        const log = {
            id: Date.now() + Math.random(),
            time: Date.now(),
            level,
            message,
            detail
        };
        this._logs.unshift(log);
        if (this._logs.length > this.MAX_LOGS) {
            this._logs.pop();
        }
        return log;
    },

    /**
     * 获取日志列表
     * @param {number} limit - 返回条数
     * @param {string} level - 过滤级别，null为全部
     * @returns {Array} 日志数组
     */
    getLogs(limit = 100, level = null) {
        if (level) {
            return this._logs.filter(l => l.level === level).slice(0, limit);
        }
        return this._logs.slice(0, limit);
    },

    /**
     * 添加告警记录
     * @param {object} alert - 告警对象
     */
    addAlert(alert) {
        this._alerts.unshift({
            ...alert,
            id: Date.now() + Math.random(),
            time: Date.now(),
            acknowledged: false
        });
        if (this._alerts.length > this.MAX_ALERTS) {
            this._alerts.pop();
        }
    },

    /**
     * 获取告警列表
     * @param {number} limit - 返回条数
     * @returns {Array} 告警数组
     */
    getAlerts(limit = 50) {
        return this._alerts.slice(0, limit);
    },

    /**
     * 确认告警
     * @param {number} alertId - 告警ID
     */
    acknowledgeAlert(alertId) {
        const alert = this._alerts.find(a => a.id === alertId);
        if (alert) alert.acknowledged = true;
    },

    /**
     * 获取未确认告警数
     * @returns {number} 未确认告警数
     */
    getUnacknowledgedAlertCount() {
        return this._alerts.filter(a => !a.acknowledged).length;
    },

    /**
     * 清除所有历史数据
     */
    clearAll() {
        this._devices.clear();
        this._history.clear();
        this._logs = [];
        this._alerts = [];
        this._receivedCount = 0;
    }
};
