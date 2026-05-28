/**
 * IoT Monitor - 演示数据生成模块
 * 模拟ESP32设备上传数据，用于在无真实设备时测试系统
 */

const DemoData = {
    // 模拟设备列表
    _devices: [
        { id: 'STM32_001', name: 'STM32-环境监测节点A' },
        { id: 'ESP32_002', name: 'ESP32-温湿度采集B' },
        { id: 'STM32_003', name: 'STM32-气象站C' }
    ],

    // 各设备的基准值（模拟不同环境）
    _baselines: {
        'STM32_001': { temperature: 25, humidity: 55, pressure: 1013, light: 600, voltage: 3.3 },
        'ESP32_002': { temperature: 28, humidity: 45, pressure: 1015, light: 800, voltage: 3.7 },
        'STM32_003': { temperature: 22, humidity: 70, pressure: 1010, light: 400, voltage: 3.1 }
    },

    // 定时器
    _timer: null,

    // 发送间隔（毫秒）
    _interval: 2000,

    // 是否正在运行
    _running: false,

    // 数据发送回调
    _onData: null,

    /**
     * 初始化演示数据模块
     * @param {Function} onData - 数据回调函数
     */
    init(onData) {
        this._onData = onData;
        console.log('[Demo] 演示数据模块初始化完成');
    },

    /**
     * 开始生成演示数据
     * @param {number} interval - 发送间隔（毫秒），默认2000ms
     */
    start(interval = 2000) {
        if (this._running) return;

        this._interval = interval;
        this._running = true;

        DataStore.addLog('info', `演示模式已启动，数据间隔 ${interval}ms`);

        // 立即发送一次
        this._generateAndSend();

        // 定时发送
        this._timer = setInterval(() => {
            this._generateAndSend();
        }, this._interval);

        console.log('[Demo] 演示数据生成已启动');
    },

    /**
     * 停止生成演示数据
     */
    stop() {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        this._running = false;
        DataStore.addLog('info', '演示模式已停止');
        console.log('[Demo] 演示数据生成已停止');
    },

    /**
     * 是否正在运行
     * @returns {boolean}
     */
    isRunning() {
        return this._running;
    },

    /**
     * 生成并发送一条演示数据
     */
    _generateAndSend() {
        // 随机选择一个设备（或全部发送）
        const device = this._devices[Math.floor(Math.random() * this._devices.length)];
        const data = this._generateSensorData(device);

        // 标准化数据
        const normalizedData = Utils.normalizeDeviceData(data);

        // 存储数据
        DataStore.updateDevice(normalizedData);
        DataStore.addLog('data',
            `[DEMO][${normalizedData.deviceId}] 温度:${Utils.formatNumber(normalizedData.temperature)}°C ` +
            `湿度:${Utils.formatNumber(normalizedData.humidity)}%`,
            { topic: 'demo/simulated', data: normalizedData }
        );

        // 检测告警
        const alerts = AlertManager.check(normalizedData);
        if (alerts.length > 0) {
            AlertManager.trigger(alerts);
        }

        // 触发回调
        if (this._onData) {
            this._onData(normalizedData);
        }
    },

    /**
     * 生成模拟传感器数据
     * @param {object} device - 设备信息
     * @returns {object} 模拟数据
     */
    _generateSensorData(device) {
        const baseline = this._baselines[device.id];

        // 使用正弦波+随机噪声模拟真实传感器数据波动
        const time = Date.now() / 1000;
        const noise = () => (Math.random() - 0.5) * 2;

        return {
            device_id: device.id,
            timestamp: Date.now(),
            temperature: baseline.temperature + Math.sin(time / 60) * 3 + noise() * 1.5,
            humidity: baseline.humidity + Math.cos(time / 80) * 8 + noise() * 3,
            pressure: baseline.pressure + Math.sin(time / 120) * 5 + noise() * 2,
            light: Math.max(0, baseline.light + Math.sin(time / 200) * 200 + noise() * 50),
            voltage: baseline.voltage + Math.sin(time / 300) * 0.2 + noise() * 0.1,
            status: Math.random() > 0.02 ? 'online' : 'offline',
            rssi: -30 - Math.floor(Math.random() * 40)
        };
    },

    /**
     * 模拟一个异常数据（用于测试告警）
     * @param {string} sensorType - 传感器类型
     */
    simulateAnomaly(sensorType = 'temperature') {
        const device = this._devices[0];
        const anomalyData = {
            device_id: device.id,
            timestamp: Date.now(),
            temperature: sensorType === 'temperature' ? 65 : 25,
            humidity: sensorType === 'humidity' ? 95 : 55,
            pressure: sensorType === 'pressure' ? 1100 : 1013,
            light: sensorType === 'light' ? 2000 : 600,
            voltage: sensorType === 'voltage' ? 4.5 : 3.3,
            status: 'online',
            rssi: -45
        };

        const normalizedData = Utils.normalizeDeviceData(anomalyData);
        DataStore.updateDevice(normalizedData);
        DataStore.addLog('warn', `[DEMO] 模拟异常数据 - ${sensorType}`);

        const alerts = AlertManager.check(normalizedData);
        if (alerts.length > 0) {
            AlertManager.trigger(alerts);
        }

        if (this._onData) {
            this._onData(normalizedData);
        }
    }
};
