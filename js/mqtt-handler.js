/**
 * IoT Monitor - MQTT连接管理模块
 * 处理MQTT连接、订阅、消息接收和自动重连
 */

const MqttHandler = {
    // MQTT客户端实例
    _client: null,

    // 连接状态
    _connected: false,

    // 连接配置
    _config: {
        broker: 'wss://iea05920.ala.cn-hangzhou.emqxsl.cn:8084/mqtt',
        topic: 'iot/sensor/data',
        clientId: '',
        username: 'WSX',
        password: 'wsx547',
        keepalive: 60,
        reconnectPeriod: 5000
    },

    // 事件回调
    _callbacks: {
        onConnect: null,
        onDisconnect: null,
        onMessage: null,
        onError: null,
        onReconnecting: null
    },

    // 重连计数
    _reconnectAttempts: 0,

    // 最大重连次数（0为无限）
    _maxReconnectAttempts: 0,

    /**
     * 初始化MQTT处理器
     * @param {object} config - 配置对象
     * @param {object} callbacks - 回调函数集合
     */
    init(config = {}, callbacks = {}) {
        // 合并配置
        Object.assign(this._config, config);

        // 生成唯一客户端ID
        if (!this._config.clientId) {
            this._config.clientId = 'iot_web_' + Math.random().toString(16).substr(2, 8);
        }

        // 注册回调
        Object.assign(this._callbacks, callbacks);

        // 从本地存储恢复上次的配置（仅当外部未传入对应配置时）
        const savedConfig = Utils.storage.get('mqtt_config');
        if (savedConfig) {
            if (!config.broker) this._config.broker = savedConfig.broker || this._config.broker;
            if (!config.topic) this._config.topic = savedConfig.topic || this._config.topic;
            if (!config.username) this._config.username = savedConfig.username || this._config.username;
            if (!config.password) this._config.password = savedConfig.password || this._config.password;
        }

        console.log('[MQTT] 初始化完成，Broker:', this._config.broker);
        return this;
    },

    /**
     * 获取当前配置
     * @returns {object} 配置对象
     */
    getConfig() {
        return { ...this._config };
    },

    /**
     * 更新配置
     * @param {object} newConfig - 新配置
     */
    updateConfig(newConfig) {
        Object.assign(this._config, newConfig);
        // 保存到本地存储
        Utils.storage.set('mqtt_config', {
            broker: this._config.broker,
            topic: this._config.topic,
            username: this._config.username,
            password: this._config.password
        });
    },

    /**
     * 连接MQTT服务器
     */
    connect() {
        if (this._client && this._connected) {
            console.log('[MQTT] 已经处于连接状态');
            return;
        }

        // 断开已有连接
        this.disconnect();

        const options = {
            clientId: this._config.clientId,
            keepalive: this._config.keepalive,
            reconnectPeriod: this._config.reconnectPeriod,
            connectTimeout: 10000,
            clean: true,
            protocolVersion: 4
        };

        // 如果有认证信息
        if (this._config.username) {
            options.username = this._config.username;
        }
        if (this._config.password) {
            options.password = this._config.password;
        }

        console.log('[MQTT] 连接参数:', JSON.stringify({
            broker: this._config.broker,
            clientId: options.clientId,
            username: options.username || '(无)',
            protocolVersion: options.protocolVersion
        }));

        try {
            console.log('[MQTT] 正在连接:', this._config.broker);
            DataStore.addLog('info', `正在连接MQTT服务器: ${this._config.broker}`);

            // 使用mqtt.js库连接
            this._client = mqtt.connect(this._config.broker, options);
            this._setupEventHandlers();
            this._reconnectAttempts = 0;

        } catch (error) {
            console.error('[MQTT] 连接失败:', error);
            DataStore.addLog('error', `连接失败: ${error.message}`);
            if (this._callbacks.onError) {
                this._callbacks.onError(error);
            }
        }
    },

    /**
     * 设置MQTT事件处理器
     */
    _setupEventHandlers() {
        // 连接成功
        this._client.on('connect', () => {
            console.log('[MQTT] 已连接到服务器');
            this._connected = true;
            this._reconnectAttempts = 0;

            DataStore.addLog('info', '已成功连接到MQTT服务器');

            // 订阅主题
            this._subscribeToTopic();

            // 触发回调
            if (this._callbacks.onConnect) {
                this._callbacks.onConnect();
            }
        });

        // 服务器确认连接（可检测认证失败）
        this._client.on('connack', (packet) => {
            console.log('[MQTT] CONNACK 返回码:', packet.returnCode);
            if (packet.returnCode !== 0) {
                const reasonMap = {
                    1: '协议版本不支持',
                    2: '客户端ID被拒绝',
                    3: '服务器不可用',
                    4: '用户名或密码错误',
                    5: '未授权'
                };
                const reason = reasonMap[packet.returnCode] || `未知错误(${packet.returnCode})`;
                console.error('[MQTT] 连接被拒绝:', reason);
                DataStore.addLog('error', `连接被服务器拒绝: ${reason}`);
                if (this._callbacks.onError) {
                    this._callbacks.onError(new Error(reason));
                }
            }
        });

        // 接收消息
        this._client.on('message', (topic, message) => {
            this._handleMessage(topic, message);
        });

        // 断开连接
        this._client.on('close', () => {
            console.log('[MQTT] 连接已断开');
            this._connected = false;
            DataStore.addLog('warn', 'MQTT连接已断开');

            if (this._callbacks.onDisconnect) {
                this._callbacks.onDisconnect();
            }
        });

        // 连接错误
        this._client.on('error', (error) => {
            console.error('[MQTT] 连接错误:', error.message);
            DataStore.addLog('error', `连接错误: ${error.message}`);

            if (this._callbacks.onError) {
                this._callbacks.onError(error);
            }
        });

        // 重连中
        this._client.on('reconnect', () => {
            this._reconnectAttempts++;
            console.log(`[MQTT] 正在重连... (第${this._reconnectAttempts}次)`);
            DataStore.addLog('warn', `正在尝试重连... (第${this._reconnectAttempts}次)`);

            if (this._callbacks.onReconnecting) {
                this._callbacks.onReconnecting(this._reconnectAttempts);
            }
        });

        // 离线
        this._client.on('offline', () => {
            console.log('[MQTT] 客户端离线');
            this._connected = false;
        });
    },

    /**
     * 订阅主题
     */
    _subscribeToTopic() {
        if (!this._client || !this._connected) return;

        const topic = this._config.topic;
        this._client.subscribe(topic, { qos: 0 }, (err) => {
            if (err) {
                console.error('[MQTT] 订阅失败:', err);
                DataStore.addLog('error', `订阅主题失败: ${topic}`);
            } else {
                console.log('[MQTT] 已订阅主题:', topic);
                DataStore.addLog('info', `已订阅主题: ${topic}`);
            }
        });
    },

    /**
     * 处理接收到的MQTT消息
     * @param {string} topic - 主题
     * @param {Buffer} message - 消息内容
     */
    _handleMessage(topic, message) {
        try {
            const payload = message.toString();
            const data = Utils.safeJsonParse(payload);

            if (!data) {
                DataStore.addLog('warn', `非JSON消息: ${payload.substring(0, 100)}`);
                return;
            }

            // 标准化数据格式
            const normalizedData = Utils.normalizeDeviceData(data);

            // 验证数据有效性
            if (!Utils.validateIoTData(normalizedData)) {
                DataStore.addLog('warn', `无效的传感器数据格式`);
                return;
            }

            // 添加到数据存储
            DataStore.updateDevice(normalizedData);
            DataStore.addLog('data',
                `[${normalizedData.deviceId}] 温度:${Utils.formatNumber(normalizedData.temperature)}°C ` +
                `湿度:${Utils.formatNumber(normalizedData.humidity)}% ` +
                `气压:${Utils.formatNumber(normalizedData.pressure, 0)}hPa`,
                { topic, data: normalizedData }
            );

            // 触发消息回调
            if (this._callbacks.onMessage) {
                this._callbacks.onMessage(topic, normalizedData);
            }

        } catch (error) {
            console.error('[MQTT] 消息处理错误:', error);
            DataStore.addLog('error', `消息处理错误: ${error.message}`);
        }
    },

    /**
     * 发布消息到MQTT主题
     * @param {string} topic - 主题
     * @param {string|object} payload - 消息内容
     * @param {object} options - 发布选项
     */
    publish(topic, payload, options = { qos: 0 }) {
        if (!this._client || !this._connected) {
            console.warn('[MQTT] 未连接，无法发布消息');
            return false;
        }

        const message = typeof payload === 'object' ? JSON.stringify(payload) : payload;
        this._client.publish(topic, message, options, (err) => {
            if (err) {
                console.error('[MQTT] 发布失败:', err);
            }
        });
        return true;
    },

    /**
     * 动态订阅新主题
     * @param {string} topic - 新主题
     */
    subscribe(topic) {
        if (!this._client || !this._connected) return;
        this._client.subscribe(topic, { qos: 0 }, (err) => {
            if (!err) {
                DataStore.addLog('info', `已订阅新主题: ${topic}`);
            }
        });
    },

    /**
     * 取消订阅主题
     * @param {string} topic - 主题
     */
    unsubscribe(topic) {
        if (!this._client) return;
        this._client.unsubscribe(topic);
        DataStore.addLog('info', `已取消订阅: ${topic}`);
    },

    /**
     * 断开MQTT连接
     */
    disconnect() {
        if (this._client) {
            this._client.end(true);
            this._client = null;
            this._connected = false;
            console.log('[MQTT] 已断开连接');
            DataStore.addLog('info', '已断开MQTT连接');
        }
    },

    /**
     * 获取连接状态
     * @returns {boolean} 是否已连接
     */
    isConnected() {
        return this._connected;
    },

    /**
     * 获取重连次数
     * @returns {number} 重连次数
     */
    getReconnectAttempts() {
        return this._reconnectAttempts;
    }
};
