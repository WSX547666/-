/**
 * IoT Monitor - ECharts图表管理模块
 * 管理实时曲线图、仪表盘等可视化图表
 */

const ChartManager = {
    // 图表实例集合
    _charts: {},

    // 图表配置模板
    _theme: {
        backgroundColor: 'transparent',
        textStyle: { color: '#8899aa' },
        title: { textStyle: { color: '#c8d6e5' } }
    },

    // 传感器颜色方案
    _colors: {
        temperature: '#ff6b6b',
        humidity: '#4ecdc4',
        pressure: '#45b7d1',
        light: '#f9ca24',
        voltage: '#a29bfe'
    },

    // 传感器中文名称
    _labels: {
        temperature: '温度 (°C)',
        humidity: '湿度 (%)',
        pressure: '气压 (hPa)',
        light: '光照 (lux)',
        voltage: '电压 (V)'
    },

    /**
     * 初始化所有图表
     */
    init() {
        this._initRealtimeChart();
        this._initGauges();
        console.log('[Chart] 图表初始化完成');
    },

    /**
     * 初始化实时趋势曲线图
     */
    _initRealtimeChart() {
        const container = document.getElementById('realtimeChart');
        if (!container) return;

        const chart = echarts.init(container, null, { renderer: 'canvas' });
        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(10, 20, 40, 0.95)',
                borderColor: '#1a3a5c',
                textStyle: { color: '#c8d6e5', fontSize: 12 },
                axisPointer: {
                    type: 'cross',
                    crossStyle: { color: '#1a3a5c' }
                },
                formatter: function (params) {
                    let html = `<div style="font-weight:bold;margin-bottom:4px;">${params[0].axisValue}</div>`;
                    params.forEach(p => {
                        html += `<div style="display:flex;align-items:center;gap:6px;">
                            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};"></span>
                            <span>${p.seriesName}: <b>${p.value !== null && p.value !== undefined ? p.value.toFixed(2) : '--'}</b></span>
                        </div>`;
                    });
                    return html;
                }
            },
            legend: {
                data: ['温度', '湿度', '气压', '光照', '电压'],
                textStyle: { color: '#8899aa', fontSize: 11 },
                top: 0,
                itemGap: 15,
                itemWidth: 14,
                itemHeight: 8
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '40px',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                axisLine: { lineStyle: { color: '#1a3a5c' } },
                axisTick: { show: false },
                axisLabel: { color: '#667788', fontSize: 10 },
                data: []
            },
            yAxis: [
                {
                    type: 'value',
                    name: '温度/湿度',
                    nameTextStyle: { color: '#667788', fontSize: 10 },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { color: 'rgba(26, 58, 92, 0.3)' } },
                    axisLabel: { color: '#667788', fontSize: 10 }
                },
                {
                    type: 'value',
                    name: '气压/光照/电压',
                    nameTextStyle: { color: '#667788', fontSize: 10 },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { show: false },
                    axisLabel: { color: '#667788', fontSize: 10 }
                }
            ],
            series: [
                {
                    name: '温度',
                    type: 'line',
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2, color: this._colors.temperature },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(255, 107, 107, 0.3)' },
                            { offset: 1, color: 'rgba(255, 107, 107, 0.02)' }
                        ])
                    },
                    data: []
                },
                {
                    name: '湿度',
                    type: 'line',
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2, color: this._colors.humidity },
                    areaStyle: {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: 'rgba(78, 205, 196, 0.3)' },
                            { offset: 1, color: 'rgba(78, 205, 196, 0.02)' }
                        ])
                    },
                    data: []
                },
                {
                    name: '气压',
                    type: 'line',
                    yAxisIndex: 1,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2, color: this._colors.pressure },
                    data: []
                },
                {
                    name: '光照',
                    type: 'line',
                    yAxisIndex: 1,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2, color: this._colors.light },
                    data: []
                },
                {
                    name: '电压',
                    type: 'line',
                    yAxisIndex: 1,
                    smooth: true,
                    symbol: 'none',
                    lineStyle: { width: 2, color: this._colors.voltage },
                    data: []
                }
            ],
            animation: true,
            animationDuration: 500
        };

        chart.setOption(option);
        this._charts.realtime = chart;

        // 响应容器尺寸变化
        window.addEventListener('resize', Utils.debounce(() => chart.resize(), 200));
    },

    /**
     * 初始化仪表盘
     */
    _initGauges() {
        const gaugeConfigs = [
            { id: 'gaugeTemp', name: '温度', color: this._colors.temperature, min: -20, max: 60, unit: '°C' },
            { id: 'gaugeHumi', name: '湿度', color: this._colors.humidity, min: 0, max: 100, unit: '%' },
            { id: 'gaugePressure', name: '气压', color: this._colors.pressure, min: 900, max: 1100, unit: 'hPa' },
            { id: 'gaugeLight', name: '光照', color: this._colors.light, min: 0, max: 2000, unit: 'lux' }
        ];

        gaugeConfigs.forEach(config => {
            const container = document.getElementById(config.id);
            if (!container) return;

            const chart = echarts.init(container, null, { renderer: 'canvas' });
            const option = {
                backgroundColor: 'transparent',
                series: [{
                    type: 'gauge',
                    startAngle: 220,
                    endAngle: -40,
                    min: config.min,
                    max: config.max,
                    radius: '90%',
                    center: ['50%', '55%'],
                    progress: {
                        show: true,
                        width: 12,
                        roundCap: true,
                        itemStyle: {
                            color: {
                                type: 'linear',
                                x: 0, y: 0, x2: 1, y2: 0,
                                colorStops: [
                                    { offset: 0, color: config.color },
                                    { offset: 1, color: this._lightenColor(config.color, 0.3) }
                                ]
                            }
                        }
                    },
                    axisLine: {
                        lineStyle: {
                            width: 12,
                            color: [[1, 'rgba(26, 58, 92, 0.4)']]
                        }
                    },
                    axisTick: { show: false },
                    splitLine: { show: false },
                    axisLabel: { show: false },
                    pointer: { show: false },
                    anchor: { show: false },
                    title: {
                        show: true,
                        offsetCenter: [0, '70%'],
                        fontSize: 11,
                        color: '#8899aa',
                        fontWeight: 'normal'
                    },
                    detail: {
                        valueAnimation: true,
                        fontSize: 22,
                        fontWeight: 'bold',
                        color: config.color,
                        offsetCenter: [0, '10%'],
                        formatter: function (value) {
                            return value.toFixed(1) + config.unit;
                        }
                    },
                    data: [{ value: 0, name: config.name }]
                }],
                animation: true,
                animationDuration: 800,
                animationEasing: 'cubicOut'
            };

            chart.setOption(option);
            this._charts[config.id] = chart;

            window.addEventListener('resize', Utils.debounce(() => chart.resize(), 200));
        });
    },

    /**
     * 更新实时趋势图数据
     * @param {string} deviceId - 设备ID
     */
    updateRealtimeChart(deviceId) {
        const chart = this._charts.realtime;
        if (!chart) return;

        const sensors = ['temperature', 'humidity', 'pressure', 'light', 'voltage'];
        const timeLabels = [];
        const seriesData = {};

        sensors.forEach(s => { seriesData[s] = []; });

        // 获取最近50个数据点
        const maxLength = 50;
        sensors.forEach(sensor => {
            const history = DataStore.getHistory(deviceId, sensor);
            const recent = history.slice(-maxLength);

            if (sensor === 'temperature') {
                recent.forEach(item => {
                    timeLabels.push(Utils.formatTime(item.time, 'time'));
                });
            }

            seriesData[sensor] = recent.map(item => item.value);
        });

        // 如果时间标签不够，从其他传感器补充
        if (timeLabels.length === 0) {
            const anyHistory = DataStore.getHistory(deviceId, 'temperature');
            anyHistory.slice(-maxLength).forEach(item => {
                timeLabels.push(Utils.formatTime(item.time, 'time'));
            });
        }

        chart.setOption({
            xAxis: { data: timeLabels },
            series: [
                { data: seriesData.temperature },
                { data: seriesData.humidity },
                { data: seriesData.pressure },
                { data: seriesData.light },
                { data: seriesData.voltage }
            ]
        });
    },

    /**
     * 更新仪表盘数值
     * @param {object} data - 传感器数据
     */
    updateGauges(data) {
        const updates = [
            { id: 'gaugeTemp', value: data.temperature, name: '温度' },
            { id: 'gaugeHumi', value: data.humidity, name: '湿度' },
            { id: 'gaugePressure', value: data.pressure, name: '气压' },
            { id: 'gaugeLight', value: data.light, name: '光照' }
        ];

        updates.forEach(item => {
            const chart = this._charts[item.id];
            if (chart && !isNaN(item.value)) {
                chart.setOption({
                    series: [{
                        data: [{ value: item.value, name: item.name }]
                    }]
                });
            }
        });
    },

    /**
     * 颜色变亮处理
     * @param {string} color - 十六进制颜色
     * @param {number} amount - 变亮程度 0-1
     * @returns {string} 变亮后的颜色
     */
    _lightenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + Math.floor(255 * amount));
        const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + Math.floor(255 * amount));
        const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + Math.floor(255 * amount));
        return `rgb(${r},${g},${b})`;
    },

    /**
     * 获取指定图表实例
     * @param {string} chartId - 图表ID
     * @returns {object} ECharts实例
     */
    getChart(chartId) {
        return this._charts[chartId] || null;
    },

    /**
     * 重置所有图表数据
     */
    resetAll() {
        // 重置实时图
        if (this._charts.realtime) {
            this._charts.realtime.setOption({
                xAxis: { data: [] },
                series: [
                    { data: [] }, { data: [] }, { data: [] },
                    { data: [] }, { data: [] }
                ]
            });
        }

        // 重置仪表盘
        ['gaugeTemp', 'gaugeHumi', 'gaugePressure', 'gaugeLight'].forEach(id => {
            if (this._charts[id]) {
                this._charts[id].setOption({
                    series: [{ data: [{ value: 0, name: '' }] }]
                });
            }
        });
    },

    /**
     * 重置所有图表尺寸（用于布局变化后）
     */
    resizeAll() {
        Object.values(this._charts).forEach(chart => {
            if (chart && chart.resize) {
                chart.resize();
            }
        });
    },

    /**
     * 销毁所有图表
     */
    dispose() {
        Object.values(this._charts).forEach(chart => {
            if (chart && chart.dispose) {
                chart.dispose();
            }
        });
        this._charts = {};
    }
};
