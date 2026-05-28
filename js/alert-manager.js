/**
 * IoT Monitor - 告警管理模块
 * 处理数据超限告警、弹窗提示、状态变色提醒
 */

const AlertManager = {
    // 告警阈值配置
    _thresholds: {
        temperature: { min: -10, max: 50, unit: '°C', name: '温度' },
        humidity: { min: 10, max: 90, unit: '%', name: '湿度' },
        pressure: { min: 950, max: 1060, unit: 'hPa', name: '气压' },
        light: { min: 0, max: 1500, unit: 'lux', name: '光照' },
        voltage: { min: 2.8, max: 4.2, unit: 'V', name: '电压' }
    },

    // 告警冷却时间（同一设备同一类型告警的最小间隔，毫秒）
    _cooldown: 30000,

    // 最近告警记录 { 'deviceId_sensorType': timestamp }
    _lastAlertTime: {},

    // 告警声音开关
    _soundEnabled: true,

    // 告警弹窗容器
    _popupContainer: null,

    /**
     * 初始化告警管理器
     */
    init() {
        this._popupContainer = document.getElementById('alertPopupContainer');

        // 从本地存储恢复阈值配置
        const savedThresholds = Utils.storage.get('alert_thresholds');
        if (savedThresholds) {
            Object.assign(this._thresholds, savedThresholds);
        }

        console.log('[Alert] 告警管理器初始化完成');
    },

    /**
     * 检测数据是否超限
     * @param {object} data - 标准化设备数据
     * @returns {Array} 告警列表
     */
    check(data) {
        const alerts = [];
        const { deviceId } = data;

        Object.entries(this._thresholds).forEach(([sensor, config]) => {
            const value = data[sensor];
            if (value === undefined || isNaN(value)) return;

            let level = null;
            let message = '';

            if (value > config.max) {
                level = 'danger';
                message = `${config.name}过高: ${Utils.formatNumber(value)}${config.unit} (上限${config.max})`;
            } else if (value < config.min) {
                level = 'warning';
                message = `${config.name}过低: ${Utils.formatNumber(value)}${config.unit} (下限${config.min})`;
            }

            if (level) {
                const alertKey = `${deviceId}_${sensor}`;
                const lastTime = this._lastAlertTime[alertKey] || 0;

                // 冷却检查，避免重复告警刷屏
                if (Date.now() - lastTime > this._cooldown) {
                    this._lastAlertTime[alertKey] = Date.now();
                    alerts.push({
                        deviceId,
                        sensor,
                        sensorName: config.name,
                        level,
                        message,
                        value,
                        threshold: level === 'danger' ? config.max : config.min,
                        unit: config.unit
                    });
                }
            }
        });

        return alerts;
    },

    /**
     * 触发告警处理
     * @param {Array} alerts - 告警列表
     */
    trigger(alerts) {
        alerts.forEach(alert => {
            // 存储告警记录
            DataStore.addAlert(alert);
            DataStore.addLog('warn', `[${alert.deviceId}] ${alert.message}`);

            // 显示弹窗
            this._showPopup(alert);

            // 更新告警计数
            this._updateAlertCount();
        });
    },

    /**
     * 显示告警弹窗
     * @param {object} alert - 告警对象
     */
    _showPopup(alert) {
        if (!this._popupContainer) return;

        const popup = Utils.createElement('div', {
            className: `alert-popup alert-${alert.level}`
        });

        popup.innerHTML = `
            <div class="alert-popup-header">
                <span class="alert-popup-icon">${alert.level === 'danger' ? '⚠' : '⚡'}</span>
                <span class="alert-popup-title">${alert.level === 'danger' ? '严重告警' : '预警提示'}</span>
                <button class="alert-popup-close" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="alert-popup-body">
                <div class="alert-popup-device">${alert.deviceId}</div>
                <div class="alert-popup-message">${alert.message}</div>
                <div class="alert-popup-time">${Utils.getCurrentTime()}</div>
            </div>
        `;

        this._popupContainer.appendChild(popup);

        // 添加弹入动画
        requestAnimationFrame(() => {
            popup.classList.add('alert-popup-show');
        });

        // 自动消失（8秒后）
        setTimeout(() => {
            popup.classList.remove('alert-popup-show');
            popup.classList.add('alert-popup-hide');
            setTimeout(() => popup.remove(), 300);
        }, 8000);
    },

    /**
     * 更新告警计数显示
     */
    _updateAlertCount() {
        const countEl = document.getElementById('alertCount');
        if (countEl) {
            const count = DataStore.getUnacknowledgedAlertCount();
            countEl.textContent = count;
            countEl.style.display = count > 0 ? 'inline-block' : 'none';
        }
    },

    /**
     * 更新告警阈值配置
     * @param {object} newThresholds - 新的阈值配置
     */
    updateThresholds(newThresholds) {
        Object.assign(this._thresholds, newThresholds);
        Utils.storage.set('alert_thresholds', this._thresholds);
        DataStore.addLog('info', '告警阈值已更新');
    },

    /**
     * 获取当前阈值配置
     * @returns {object} 阈值配置
     */
    getThresholds() {
        return { ...this._thresholds };
    },

    /**
     * 设置告警声音开关
     * @param {boolean} enabled - 是否启用
     */
    setSoundEnabled(enabled) {
        this._soundEnabled = enabled;
    },

    /**
     * 获取传感器状态颜色
     * @param {string} sensorType - 传感器类型
     * @param {number} value - 当前值
     * @returns {string} CSS类名
     */
    getStatusClass(sensorType, value) {
        if (value === undefined || isNaN(value)) return 'status-unknown';

        const config = this._thresholds[sensorType];
        if (!config) return 'status-normal';

        if (value > config.max || value < config.min) {
            return 'status-danger';
        }

        // 接近阈值时显示警告（上下限10%范围内）
        const range = config.max - config.min;
        const margin = range * 0.1;
        if (value > config.max - margin || value < config.min + margin) {
            return 'status-warning';
        }

        return 'status-normal';
    },

    /**
     * 渲染告警历史面板
     * @param {HTMLElement} container - 容器元素
     */
    renderAlertPanel(container) {
        if (!container) return;

        const alerts = DataStore.getAlerts(30);
        if (alerts.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无告警记录</div>';
            return;
        }

        container.innerHTML = alerts.map(alert => `
            <div class="alert-item alert-item-${alert.level} ${alert.acknowledged ? 'acknowledged' : ''}">
                <div class="alert-item-header">
                    <span class="alert-item-level">${alert.level === 'danger' ? '严重' : '预警'}</span>
                    <span class="alert-item-device">${alert.deviceId}</span>
                    <span class="alert-item-time">${Utils.formatTime(alert.time, 'short')}</span>
                </div>
                <div class="alert-item-message">${alert.message}</div>
            </div>
        `).join('');
    }
};
