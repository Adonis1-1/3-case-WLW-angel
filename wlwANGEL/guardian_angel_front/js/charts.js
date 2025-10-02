/**
 * Chart creation and management functions
 * Separate FHR and UA charts for traditional CTG display
 */

const ChartManager = {
    charts: {},

    /**
     * Create wellbeing donut chart
     */
    createWellbeingChart(canvasId, value) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        
        if (this.charts.wellbeing) {
            this.charts.wellbeing.destroy();
        }

        this.charts.wellbeing = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [value, 100 - value],
                    backgroundColor: ['#2ED47A', '#F0F0F3'],
                    borderWidth: 0,
                    borderRadius: 10,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '75%',
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            },
            plugins: [{
                id: 'centerText',
                afterDraw: function(chart) {
                    const ctx = chart.ctx;
                    ctx.save();
                    
                    const centerX = (chart.chartArea.left + chart.chartArea.right) / 2;
                    const centerY = (chart.chartArea.top + chart.chartArea.bottom) / 2;
                    
                    ctx.font = '800 42px Manrope';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#2C2C3A';
                    ctx.fillText(value, centerX, centerY);
                    
                    ctx.restore();
                }
            }]
        });

        return this.charts.wellbeing;
    },

    /**
     * Create FHR (Fetal Heart Rate) chart with fixed grid
     */
    createFHRChart(canvasId, data, windowSize = 30) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        
        if (this.charts.fhr) {
            this.charts.fhr.destroy();
        }

        // ФИКСИРОВАННОЕ окно отображения
        const displayMinTime = 0;
        const displayMaxTime = windowSize;

        this.charts.fhr = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'ЧСС',
                    data: data.fhr,
                    borderColor: '#FF1744', // Red for FHR
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 2, // УВЕЛИЧЕН размер точек
                    pointHoverRadius: 6,
                    tension: 0.25, // ИЗМЕНЕНО с 0.1 на 0.25 для более плавной линии
                    clip: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 15,
                        right: 15,
                        top: 15,
                        bottom: 0
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: displayMinTime,
                        max: displayMaxTime, // ФИКСИРОВАННОЕ окно
                        grid: {
                            color: function(context) {
                                // Major grid lines every 1 минуту
                                if (context.tick.value % 1 === 0) {
                                    return 'rgba(0, 0, 0, 0.15)';
                                }
                                return 'transparent';
                            },
                            lineWidth: function(context) {
                                if (context.tick.value % 1 === 0) {
                                    return 1.5;
                                }
                                return 0;
                            },
                            drawTicks: false
                        },
                        border: {
                            display: false
                        },
                        ticks: {
                            display: false,
                            stepSize: 1, // Шаг 1 минута
                            callback: function(value) {
                                return value + ' мин';
                            }
                        }
                    },
                    y: {
                        min: 50,  // ИЗМЕНЕНО: более узкий диапазон для КТГ
                        max: 210, // ИЗМЕНЕНО: стандартный диапазон КТГ
                        position: 'right',
                        grid: {
                            color: function(context) {
                                // Major grid lines every 30 units
                                if (context.tick.value % 30 === 0) {
                                    return 'rgba(0, 0, 0, 0.15)';
                                }
                                // Minor grid lines every 10 units
                                if (context.tick.value % 10 === 0) {
                                    return 'rgba(0, 0, 0, 0.05)';
                                }
                                return 'transparent';
                            },
                            lineWidth: function(context) {
                                if (context.tick.value % 30 === 0) {
                                    return 1.5;
                                }
                                if (context.tick.value % 10 === 0) {
                                    return 0.5;
                                }
                                return 0;
                            }
                        },
                        border: {
                            display: false
                        },
                        ticks: {
                            stepSize: 10, // ИЗМЕНЕНО с 30 на 10 для более частой сетки
                            font: {
                                family: 'Manrope',
                                size: 12,
                                weight: '700'
                            },
                            color: '#555',
                            padding: 8,
                            callback: function(value) {
                                // Show labels every 30 units for major, every 10 for minor
                                if (value % 30 === 0) {
                                    return value;
                                }
                                return '';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(255, 255, 255, 0.98)',
                        titleColor: '#333',
                        bodyColor: '#666',
                        borderColor: '#ddd',
                        borderWidth: 1.5,
                        padding: 12,
                        displayColors: false,
                        titleFont: {
                            size: 13,
                            weight: '600'
                        },
                        bodyFont: {
                            size: 12,
                            weight: '600'
                        },
                        callbacks: {
                            title: function(context) {
                                const minutes = context[0].parsed.x;
                                const totalSeconds = Math.floor(minutes * 60);
                                const hrs = Math.floor(totalSeconds / 3600);
                                const mins = Math.floor((totalSeconds % 3600) / 60);
                                const secs = totalSeconds % 60;
                                
                                if (hrs > 0) {
                                    return `Время: ${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                                }
                                return `Время: ${mins}:${secs.toString().padStart(2, '0')}`;
                            },
                            label: function(context) {
                                return 'ЧСС: ' + Math.round(context.parsed.y) + ' уд/мин';
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            // Lower normal boundary
                            lowerNormal: {
                                type: 'line',
                                yMin: 110,
                                yMax: 110,
                                borderColor: 'rgba(255, 0, 0, 0.4)',
                                borderWidth: 1.2,
                                borderDash: [5, 5]
                            },
                            // Upper normal boundary
                            upperNormal: {
                                type: 'line',
                                yMin: 170,
                                yMax: 170,
                                borderColor: 'rgba(255, 0, 0, 0.4)',
                                borderWidth: 1.2,
                                borderDash: [5, 5]
                            },
                            // Normal range zone
                            normalZone: {
                                type: 'box',
                                yMin: 110,
                                yMax: 170,
                                backgroundColor: 'rgba(0, 255, 0, 0.03)',
                                borderWidth: 0
                            }
                        }
                    }
                }
            }
        });

        return this.charts.fhr;
    },

    /**
     * Create UA (Uterine Activity) chart with fixed grid - now labeled as СДМ
     */
    createUAChart(canvasId, data, windowSize = 30) {
        const ctx = document.getElementById(canvasId).getContext('2d');
        
        if (this.charts.ua) {
            this.charts.ua.destroy();
        }

        // ФИКСИРОВАННОЕ окно отображения
        const displayMinTime = 0;
        const displayMaxTime = windowSize;

        this.charts.ua = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'СДМ',
                    data: data.ua,
                    borderColor: '#0D47A1', // Dark blue for UA
                    backgroundColor: 'rgba(13, 71, 161, 0.08)',
                    borderWidth: 2,
                    pointRadius: 2, // УВЕЛИЧЕН размер точек
                    pointHoverRadius: 6,
                    tension: 0.25, // ИЗМЕНЕНО с 0.1 на 0.25 для более плавной линии
                    fill: true,
                    clip: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 15,
                        right: 15,
                        top: 0,
                        bottom: 15
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: displayMinTime,
                        max: displayMaxTime, // ФИКСИРОВАННОЕ окно
                        grid: {
                            color: function(context) {
                                // Major grid lines every 1 минуту
                                if (context.tick.value % 1 === 0) {
                                    return 'rgba(0, 0, 0, 0.15)';
                                }
                                return 'transparent';
                            },
                            lineWidth: function(context) {
                                if (context.tick.value % 1 === 0) {
                                    return 1.5;
                                }
                                return 0;
                            },
                            drawTicks: true
                        },
                        border: {
                            display: false
                        },
                        ticks: {
                            stepSize: 1,
                            font: {
                                family: 'Manrope',
                                size: 12,
                                weight: '700'
                            },
                            color: '#555',
                            padding: 10,
                            callback: function(value) {
                                if (value % 1 === 0) { // Каждую 1 минуту
                                    return value + ' мин';
                                }
                                return '';
                            }
                        }
                    },
                    y: {
                        min: 0,   // ИЗМЕНЕНО: минимум для СДМ
                        max: 100, // ИЗМЕНЕНО: максимум для СДМ
                        position: 'right',
                        grid: {
                            color: function(context) {
                                // Major grid lines every 25 units
                                if (context.tick.value % 25 === 0) {
                                    return 'rgba(0, 0, 0, 0.15)';
                                }
                                // Minor grid lines every 10 units
                                if (context.tick.value % 10 === 0) {
                                    return 'rgba(0, 0, 0, 0.05)';
                                }
                                return 'transparent';
                            },
                            lineWidth: function(context) {
                                if (context.tick.value % 25 === 0) {
                                    return 1.5;
                                }
                                if (context.tick.value % 10 === 0) {
                                    return 0.5;
                                }
                                return 0;
                            }
                        },
                        border: {
                            display: false
                        },
                        ticks: {
                            stepSize: 10,
                            font: {
                                family: 'Manrope',
                                size: 12,
                                weight: '700'
                            },
                            color: '#555',
                            padding: 8,
                            callback: function(value) {
                                // Show only major tick labels (25 units)
                                if (value % 25 === 0) {
                                    return value;
                                }
                                return '';
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: 'rgba(255, 255, 255, 0.98)',
                        titleColor: '#333',
                        bodyColor: '#666',
                        borderColor: '#ddd',
                        borderWidth: 1.5,
                        padding: 12,
                        displayColors: false,
                        titleFont: {
                            size: 13,
                            weight: '600'
                        },
                        bodyFont: {
                            size: 12,
                            weight: '600'
                        },
                        callbacks: {
                            title: function(context) {
                                const minutes = context[0].parsed.x;
                                const totalSeconds = Math.floor(minutes * 60);
                                const hrs = Math.floor(totalSeconds / 3600);
                                const mins = Math.floor((totalSeconds % 3600) / 60);
                                const secs = totalSeconds % 60;
                                
                                if (hrs > 0) {
                                    return `Время: ${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                                }
                                return `Время: ${mins}:${secs.toString().padStart(2, '0')}`;
                            },
                            label: function(context) {
                                return 'СДМ: ' + Math.round(context.parsed.y) + ' отн.ед';
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            // No baseline for UA chart
                        }
                    }
                }
            }
        });

        return this.charts.ua;
    },

    /**
     * Update both FHR and UA charts with new data and fixed grid
     */
    updateChartsWithFixedGrid(data, currentPosition, windowSize = 30) {
        // ФИКСИРОВАННОЕ окно отображения
        const displayMinTime = currentPosition;
        const displayMaxTime = currentPosition + windowSize;

        // Update FHR chart
        if (this.charts.fhr) {
            this.charts.fhr.data.labels = data.labels;
            this.charts.fhr.data.datasets[0].data = data.fhr;
            this.charts.fhr.options.scales.x.min = displayMinTime;
            this.charts.fhr.options.scales.x.max = displayMaxTime;
            this.charts.fhr.update('none');
        }

        // Update UA chart
        if (this.charts.ua) {
            this.charts.ua.data.labels = data.labels;
            this.charts.ua.data.datasets[0].data = data.ua;
            this.charts.ua.options.scales.x.min = displayMinTime;
            this.charts.ua.options.scales.x.max = displayMaxTime;
            this.charts.ua.update('none');
        }
    },

    /**
     * Update chart data only (for real-time streaming)
     */
    updateChartData(data) {
        // Update FHR chart data only
        if (this.charts.fhr) {
            this.charts.fhr.data.labels = data.labels;
            this.charts.fhr.data.datasets[0].data = data.fhr;
        }

        // Update UA chart data only
        if (this.charts.ua) {
            this.charts.ua.data.labels = data.labels;
            this.charts.ua.data.datasets[0].data = data.ua;
        }
    },

    /**
     * Update chart viewport (for scrolling)
     */
    updateChartViewport(currentPosition, windowSize = 30) {
        const displayMinTime = currentPosition;
        const displayMaxTime = currentPosition + windowSize;

        // Update FHR chart viewport
        if (this.charts.fhr) {
            this.charts.fhr.options.scales.x.min = displayMinTime;
            this.charts.fhr.options.scales.x.max = displayMaxTime;
        }

        // Update UA chart viewport
        if (this.charts.ua) {
            this.charts.ua.options.scales.x.min = displayMinTime;
            this.charts.ua.options.scales.x.max = displayMaxTime;
        }
    },

    /**
     * Update both charts completely
     */
    updateCharts(data, currentPosition, windowSize = 30) {
        this.updateChartData(data);
        this.updateChartViewport(currentPosition, windowSize);
        
        // Update both charts
        if (this.charts.fhr) {
            this.charts.fhr.update('none');
        }
        if (this.charts.ua) {
            this.charts.ua.update('none');
        }
    }
};

// Export for use in other modules
window.ChartManager = ChartManager;