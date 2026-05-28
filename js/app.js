/**
 * IoT Monitor - 主应用模块
 * 统一管理所有子模块，处理UI更新和用户交互
 */

const App = {
    // 当前选中的设备ID
    _currentDeviceId: null,

    // 当前选中的图表传感器类型
    _currentSensor: 'temperature',

    // UI更新定时器
    _uiTimer: null,

    // 设备状态检查定时器
    _deviceCheckTimer: null,

    // 当前活动面板
    _activePanel: 'dashboard',

    /**
     * 应用初始化入口
     */
    init() {
        console.log('[App] IoT Monitor 启动中...');

        // 初始化各模块
        DataStore.init();
        AlertManager.init();
        ChartManager.init();

        // 初始化MQTT（不自动连接）
        MqttHandler.init({}, {
            onConnect: () => this._onMqttConnect(),
            onDisconnect: () => this._onMqttDisconnect(),
            onMessage: (topic, data) => this._onMqttMessage(topic, data),
            onError: (err) => this._onMqttError(err),
            onReconnecting: (count) => this._onMqttReconnecting(count)
        });

        // 初始化演示数据模块
        DemoData.init((data) => this._onDemoData(data));

        // 绑定UI事件
        this._bindEvents();

        // 启动UI更新循环
        this._startUILoop();

        // 启动设备状态检查
        this._startDeviceCheck();

        // 恢复上次的连接配置到UI
        this._restoreConfig();

        // 更新时钟
        this._updateClock();
        setInterval(() => this._updateClock(), 1000);

        console.log('[App] 初始化完成');
        DataStore.addLog('info', '系统启动完成，等待MQTT连接...');
    },

    // ==================== 事件绑定 ====================

    /**
     * 绑定所有UI事件
     */
    _bindEvents() {
        // MQTT连接按钮
        const connectBtn = document.getElementById('btnConnect');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => this._handleConnect());
        }

        // 断开连接按钮
        const disconnectBtn = document.getElementById('btnDisconnect');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this._handleDisconnect());
        }

        // 演示模式按钮
        const demoBtn = document.getElementById('btnDemo');
        if (demoBtn) {
            demoBtn.addEventListener('click', () => this._toggleDemo());
        }

        // 模拟异常按钮
        const anomalyBtn = document.getElementById('btnAnomaly');
        if (anomalyBtn) {
            anomalyBtn.addEventListener('click', () => DemoData.simulateAnomaly());
        }

        // 设备选择下拉
        const deviceSelect = document.getElementById('deviceSelect');
        if (deviceSelect) {
            deviceSelect.addEventListener('change', (e) => {
                this._currentDeviceId = e.target.value;
                this._updateAllUI();
            });
        }

        // 传感器类型切换按钮
        document.querySelectorAll('.sensor-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.sensor-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this._currentSensor = e.target.dataset.sensor;
            });
        });

        // 面板切换（日志/告警/历史）
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const panel = e.target.dataset.panel;
                this._switchPanel(panel);
            });
        });

        // 阈值设置按钮
        const thresholdBtn = document.getElementById('btnThreshold');
        if (thresholdBtn) {
            thresholdBtn.addEventListener('click', () => this._openThresholdModal());
        }

        // 阈值保存按钮
        const saveThresholdBtn = document.getElementById('btnSaveThreshold');
        if (saveThresholdBtn) {
            saveThresholdBtn.addEventListener('click', () => this._saveThresholds());
        }

        // 清除日志按钮
        const clearLogBtn = document.getElementById('btnClearLog');
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', () => {
                DataStore._logs = [];
                this._updateLogPanel();
            });
        }

        // 导出数据按钮
        const exportBtn = document.getElementById('btnExport');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this._exportData());
        }

        // 模态框关闭
        document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal-close')) {
                    this._closeAllModals();
                }
            });
        });

        // 窗口尺寸变化
        window.addEventListener('resize', Utils.debounce(() => {
            ChartManager.resizeAll();
        }, 300));
    },

    // ==================== MQTT连接处理 ====================

    /**
     * 处理MQTT连接按钮点击
     */
    _handleConnect() {
        const broker = document.getElementById('inputBroker').value.trim();
        const topic = document.getElementById('inputTopic').value.trim();
        const username = document.getElementById('inputUsername').value.trim();
        const password = document.getElementById('inputPassword').value.trim();

        if (!broker) {
            this._showToast('请输入MQTT服务器地址', 'warning');
            return;
        }
        if (!topic) {
            this._showToast('请输入订阅主题', 'warning');
            return;
        }

        // 更新配置
        MqttHandler.updateConfig({ broker, topic, username, password });

        // 更新UI状态
        this._setConnectionStatus('connecting');

        // 连接
        MqttHandler.connect();
    },

    /**
     * 处理断开连接
     */
    _handleDisconnect() {
        MqttHandler.disconnect();
        DemoData.stop();
        this._setConnectionStatus('disconnected');
        this._showToast('已断开连接', 'info');
    },

    /**
     * MQTT连接成功回调
     */
    _onMqttConnect() {
        this._setConnectionStatus('connected');
        this._showToast('MQTT连接成功', 'success');
    },

    /**
     * MQTT断开连接回调
     */
    _onMqttDisconnect() {
        this._setConnectionStatus('disconnected');
    },

    /**
     * MQTT消息回调
     */
    _onMqttMessage(topic, data) {
        // 更新设备选择器
        this._updateDeviceSelect();

        // 如果没有选中设备，自动选择第一个
        if (!this._currentDeviceId) {
            this._currentDeviceId = data.deviceId;
            document.getElementById('deviceSelect').value = data.deviceId;
        }

        // 检测告警
        const alerts = AlertManager.check(data);
        if (alerts.length > 0) {
            AlertManager.trigger(alerts);
        }

        // 更新UI
        this._updateAllUI();
    },

    /**
     * MQTT错误回调
     */
    _onMqttError(err) {
        this._setConnectionStatus('error');
        this._showToast(`连接错误: ${err.message}`, 'error');
    },

    /**
     * MQTT重连中回调
     */
    _onMqttReconnecting(count) {
        this._setConnectionStatus('reconnecting');
        const statusText = document.getElementById('statusText');
        if (statusText) statusText.textContent = `重连中(${count})`;
    },

    /**
     * 演示数据回调
     */
    _onDemoData(data) {
        this._updateDeviceSelect();
        if (!this._currentDeviceId) {
            this._currentDeviceId = data.deviceId;
        }
        this._updateAllUI();
    },

    // ==================== 演示模式 ====================

    /**
     * 切换演示模式
     */
    _toggleDemo() {
        const btn = document.getElementById('btnDemo');
        if (DemoData.isRunning()) {
            DemoData.stop();
            btn.textContent = '演示模式';
            btn.classList.remove('active');
            this._setConnectionStatus('disconnected');
            this._showToast('演示模式已关闭', 'info');
        } else {
            // 停止MQTT连接
            MqttHandler.disconnect();
            this._setConnectionStatus('demo');
            DemoData.start(2000);
            btn.textContent = '停止演示';
            btn.classList.add('active');
            this._showToast('演示模式已启动，模拟数据生成中', 'success');
        }
    },

    // ==================== UI更新 ====================

    /**
     * 启动UI更新循环
     */
    _startUILoop() {
        this._uiTimer = setInterval(() => {
            this._updateStatusBar();
            this._updateLogPanel();
            this._updateAlertPanel();
        }, 1000);
    },

    /**
     * 启动设备在线状态检查
     */
    _startDeviceCheck() {
        this._deviceCheckTimer = setInterval(() => {
            this._updateDeviceStatus();
        }, 5000);
    },

    /**
     * 更新所有UI组件
     */
    _updateAllUI() {
        if (!this._currentDeviceId) return;

        const device = DataStore.getDevice(this._currentDeviceId);
        if (!device) return;

        // 更新数据卡片
        this._updateDataCards(device);

        // 更新仪表盘
        ChartManager.updateGauges(device);

        // 更新实时图表
        ChartManager.updateRealtimeChart(this._currentDeviceId);

        // 更新设备状态面板
        this._updateDeviceStatus();
    },

    /**
     * 更新数据卡片
     * @param {object} device - 设备数据
     */
    _updateDataCards(device) {
        const cards = [
            { id: 'valTemp', sensor: 'temperature', value: device.temperature, unit: '°C', icon: '🌡' },
            { id: 'valHumi', sensor: 'humidity', value: device.humidity, unit: '%', icon: '💧' },
            { id: 'valPressure', sensor: 'pressure', value: device.pressure, unit: 'hPa', icon: '🔵' },
            { id: 'valLight', sensor: 'light', value: device.light, unit: 'lux', icon: '☀' },
            { id: 'valVoltage', sensor: 'voltage', value: device.voltage, unit: 'V', icon: '🔋' }
        ];

        cards.forEach(card => {
            const el = document.getElementById(card.id);
            if (el) {
                const formatted = Utils.formatNumber(card.value, card.sensor === 'pressure' ? 0 : 1);
                el.textContent = formatted;

                // 更新状态样式
                const cardEl = el.closest('.data-card');
                if (cardEl) {
                    cardEl.className = 'data-card ' + AlertManager.getStatusClass(card.sensor, card.value);
                }
            }
        });

        // 更新RSSI
        const rssiEl = document.getElementById('valRssi');
        if (rssiEl && !isNaN(device.rssi)) {
            rssiEl.textContent = `${device.rssi} dBm`;
        }

        // 更新设备状态指示
        const deviceStatusEl = document.getElementById('deviceStatus');
        if (deviceStatusEl) {
            const isOnline = Utils.isDeviceOnline(device.lastSeen);
            deviceStatusEl.className = `device-status-indicator ${isOnline ? 'online' : 'offline'}`;
            deviceStatusEl.querySelector('.status-label').textContent = isOnline ? '在线' : '离线';
        }
    },

    /**
     * 更新状态栏信息
     */
    _updateStatusBar() {
        const summary = DataStore.getSummary();

        // 更新接收计数
        const countEl = document.getElementById('receivedCount');
        if (countEl) countEl.textContent = summary.totalReceived;

        // 更新在线设备数
        const onlineEl = document.getElementById('onlineCount');
        if (onlineEl) onlineEl.textContent = `${summary.onlineDevices}/${summary.totalDevices}`;

        // 更新平均值
        const avgTempEl = document.getElementById('avgTemp');
        if (avgTempEl) avgTempEl.textContent = Utils.formatNumber(summary.avgTemp);

        const avgHumiEl = document.getElementById('avgHumi');
        if (avgHumiEl) avgHumiEl.textContent = Utils.formatNumber(summary.avgHumi);
    },

    /**
     * 更新设备选择下拉框
     */
    _updateDeviceSelect() {
        const select = document.getElementById('deviceSelect');
        if (!select) return;

        const devices = DataStore.getAllDevices();
        const currentValue = select.value;

        // 保留已有选项，添加新设备
        const existingIds = new Set();
        Array.from(select.options).forEach(opt => existingIds.add(opt.value));

        devices.forEach(device => {
            if (!existingIds.has(device.deviceId)) {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = `${device.deviceId} (${device.status || 'online'})`;
                select.appendChild(option);
            }
        });

        // 保持当前选择
        if (currentValue && existingIds.has(currentValue)) {
            select.value = currentValue;
        }
    },

    /**
     * 更新设备状态面板
     */
    _updateDeviceStatus() {
        const container = document.getElementById('deviceStatusList');
        if (!container) return;

        const devices = DataStore.getAllDevices();
        if (devices.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无设备数据</div>';
            return;
        }

        container.innerHTML = devices.map(device => {
            const isOnline = Utils.isDeviceOnline(device.lastSeen);
            return `
                <div class="device-item ${isOnline ? 'online' : 'offline'}" data-device="${device.deviceId}">
                    <div class="device-item-indicator ${isOnline ? 'online' : 'offline'}"></div>
                    <div class="device-item-info">
                        <div class="device-item-id">${device.deviceId}</div>
                        <div class="device-item-meta">
                            ${isOnline ?
                                `温度 ${Utils.formatNumber(device.temperature)}°C · ${Utils.timeAgo(device.lastSeen)}` :
                                `离线 · ${Utils.timeAgo(device.lastSeen)}`
                            }
                        </div>
                    </div>
                    <div class="device-item-rssi">${!isNaN(device.rssi) ? device.rssi + 'dBm' : '--'}</div>
                </div>
            `;
        }).join('');

        // 绑定设备项点击事件
        container.querySelectorAll('.device-item').forEach(item => {
            item.addEventListener('click', () => {
                const deviceId = item.dataset.device;
                document.getElementById('deviceSelect').value = deviceId;
                this._currentDeviceId = deviceId;
                this._updateAllUI();
            });
        });
    },

    /**
     * 更新日志面板
     */
    _updateLogPanel() {
        const container = document.getElementById('logContainer');
        if (!container || this._activePanel !== 'logs') return;

        const logs = DataStore.getLogs(80);
        if (logs.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无日志</div>';
            return;
        }

        container.innerHTML = logs.map(log => `
            <div class="log-entry log-${log.level}">
                <span class="log-time">${Utils.formatTime(log.time, 'time')}</span>
                <span class="log-level log-level-${log.level}">${log.level.toUpperCase()}</span>
                <span class="log-message">${log.message}</span>
            </div>
        `).join('');
    },

    /**
     * 更新告警面板
     */
    _updateAlertPanel() {
        const container = document.getElementById('alertContainer');
        if (!container || this._activePanel !== 'alerts') return;

        AlertManager.renderAlertPanel(container);
    },

    /**
     * 切换底部面板
     * @param {string} panel - 面板名称
     */
    _switchPanel(panel) {
        this._activePanel = panel;

        // 更新标签样式
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.panel === panel);
        });

        // 显示/隐藏面板内容
        document.querySelectorAll('.panel-content').forEach(content => {
            content.style.display = content.dataset.panel === panel ? 'block' : 'none';
        });

        // 刷新当前面板
        if (panel === 'logs') this._updateLogPanel();
        if (panel === 'alerts') this._updateAlertPanel();
        if (panel === 'history') this._updateHistoryPanel();
    },

    /**
     * 更新历史数据面板
     */
    _updateHistoryPanel() {
        const container = document.getElementById('historyContainer');
        if (!container || !this._currentDeviceId) return;

        const history = DataStore.getHistory(this._currentDeviceId, this._currentSensor);
        if (history.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无历史数据</div>';
            return;
        }

        const recent = history.slice(-50).reverse();
        const sensorName = {
            temperature: '温度', humidity: '湿度', pressure: '气压',
            light: '光照', voltage: '电压'
        }[this._currentSensor] || this._currentSensor;

        container.innerHTML = `
            <table class="history-table">
                <thead>
                    <tr>
                        <th>时间</th>
                        <th>${sensorName}</th>
                    </tr>
                </thead>
                <tbody>
                    ${recent.map(item => `
                        <tr>
                            <td>${Utils.formatTime(item.time, 'full')}</td>
                            <td>${Utils.formatNumber(item.value)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    // ==================== 状态管理 ====================

    /**
     * 设置连接状态显示
     * @param {string} status - 状态类型
     */
    _setConnectionStatus(status) {
        const indicator = document.getElementById('connectionIndicator');
        const statusText = document.getElementById('statusText');
        const connectBtn = document.getElementById('btnConnect');

        const statusMap = {
            connected: { class: 'connected', text: '已连接', btnText: '已连接' },
            disconnected: { class: 'disconnected', text: '未连接', btnText: '连接' },
            connecting: { class: 'connecting', text: '连接中...', btnText: '连接中...' },
            reconnecting: { class: 'connecting', text: '重连中...', btnText: '重连中...' },
            error: { class: 'error', text: '连接失败', btnText: '重试' },
            demo: { class: 'demo', text: '演示模式', btnText: '已连接' }
        };

        const config = statusMap[status] || statusMap.disconnected;

        if (indicator) indicator.className = `connection-indicator ${config.class}`;
        if (statusText) statusText.textContent = config.text;
        if (connectBtn) {
            connectBtn.textContent = config.btnText;
            connectBtn.disabled = status === 'connecting' || status === 'connected';
        }
    },

    /**
     * 更新时钟显示
     */
    _updateClock() {
        const clockEl = document.getElementById('systemClock');
        if (clockEl) {
            clockEl.textContent = Utils.getCurrentTime();
        }
    },

    /**
     * 恢复上次保存的配置
     */
    _restoreConfig() {
        const config = MqttHandler.getConfig();
        const brokerInput = document.getElementById('inputBroker');
        const topicInput = document.getElementById('inputTopic');
        const usernameInput = document.getElementById('inputUsername');
        const passwordInput = document.getElementById('inputPassword');

        if (brokerInput) brokerInput.value = config.broker;
        if (topicInput) topicInput.value = config.topic;
        if (usernameInput) usernameInput.value = config.username || '';
        if (passwordInput) passwordInput.value = config.password || '';
    },

    // ==================== 弹窗和提示 ====================

    /**
     * 显示提示消息
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型 'success'|'error'|'warning'|'info'
     */
    _showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = Utils.createElement('div', { className: `toast toast-${type}` });
        toast.innerHTML = `
            <span class="toast-icon">${{ success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || 'ℹ'}</span>
            <span class="toast-message">${message}</span>
        `;

        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('toast-show'));

        setTimeout(() => {
            toast.classList.remove('toast-show');
            toast.classList.add('toast-hide');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    /**
     * 打开阈值设置模态框
     */
    _openThresholdModal() {
        const modal = document.getElementById('thresholdModal');
        if (!modal) return;

        const thresholds = AlertManager.getThresholds();
        Object.entries(thresholds).forEach(([key, config]) => {
            const minInput = document.getElementById(`threshold_${key}_min`);
            const maxInput = document.getElementById(`threshold_${key}_max`);
            if (minInput) minInput.value = config.min;
            if (maxInput) maxInput.value = config.max;
        });

        modal.classList.add('show');
    },

    /**
     * 保存阈值设置
     */
    _saveThresholds() {
        const sensors = ['temperature', 'humidity', 'pressure', 'light', 'voltage'];
        const newThresholds = {};

        sensors.forEach(sensor => {
            const minInput = document.getElementById(`threshold_${sensor}_min`);
            const maxInput = document.getElementById(`threshold_${sensor}_max`);
            if (minInput && maxInput) {
                newThresholds[sensor] = {
                    min: parseFloat(minInput.value),
                    max: parseFloat(maxInput.value)
                };
            }
        });

        AlertManager.updateThresholds(newThresholds);
        this._closeAllModals();
        this._showToast('告警阈值已更新', 'success');
    },

    /**
     * 关闭所有模态框
     */
    _closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('show');
        });
    },

    /**
     * 导出数据为JSON
     */
    _exportData() {
        const devices = DataStore.getAllDevices();
        const exportData = {
            exportTime: new Date().toISOString(),
            devices: devices,
            alertThresholds: AlertManager.getThresholds()
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `iot_data_${Utils.formatTime(new Date(), 'date')}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this._showToast('数据已导出', 'success');
    }
};

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
