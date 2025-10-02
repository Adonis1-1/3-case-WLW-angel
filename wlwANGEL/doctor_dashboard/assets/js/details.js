// Mock detailed patient data with diseases
const mockDetailedData = {
    'patient_101': {
        name: 'Иванова Ирина Ивановна',
        room: '201',
        age: 28,
        gestationalAge: 38,
        conditions: [
            { name: 'Гестационный диабет', severity: 'moderate', icon: '🩺', source: 'МИС' },
            { name: 'Артериальная гипертензия I ст.', severity: 'moderate', icon: '💊', source: 'МИС' },
            { name: 'Анемия легкой степени', severity: 'mild', icon: '🩸', source: 'МИС' }
        ]
    },
    'patient_102': {
        name: 'Петрова Анна Сергеевна',
        room: '202',
        age: 32,
        gestationalAge: 36,
        conditions: [
            { name: 'Преэклампсия тяжелая', severity: 'critical', icon: '🚨', source: 'МИС' },
            { name: 'Сахарный диабет 1 типа', severity: 'warning', icon: '💉', source: 'МИС' },
            { name: 'Хронический пиелонефрит', severity: 'moderate', icon: '🩺', source: 'МИС' }
        ]
    },
    'patient_107': {
        name: 'Волкова Наталья Игоревна',
        room: '301',
        age: 25,
        gestationalAge: 40,
        conditions: [
            { name: 'Гипотиреоз', severity: 'moderate', icon: '🦋', source: 'МИС' },
            { name: 'Хронический гастрит', severity: 'mild', icon: '🩺', source: 'МИС' }
        ]
    }
};

// Default data for unknown patients
const defaultPatientData = {
    name: 'Пациентка',
    room: '000',
    age: 30,
    gestationalAge: 38,
    conditions: []
};

class DetailsApp {
    constructor() {
        this.patientId = null;
        this.patientData = null;
        this.ctgData = [];
        this.fhrChart = null;
        this.uaChart = null;
        this.wellnessChart = null;
        this.updateInterval = null;
    }

    init() {
        this.patientId = this.getPatientIdFromUrl();
        console.log('Loading patient:', this.patientId);
        
        this.loadPatientData();
        this.initCharts();
        this.startRealtimeSimulation();
        this.startClock();
    }

    getPatientIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id') || 'patient_101';
    }

    loadPatientData() {
        // Get mock data or use default
        this.patientData = mockDetailedData[this.patientId] || {
            ...defaultPatientData,
            name: `Пациентка ${this.patientId}`
        };

        // Generate initial CTG data
        this.generateCTGData();

        // Update UI with patient info
        this.updatePatientInfo();
        this.updateConditions();
        this.updateWellnessScore();
    }

    generateCTGData() {
        // Generate initial CTG data (last 2 minutes)
        const dataPoints = 120; // 2 minutes for display
        const baseline = 140;
        
        for (let i = 0; i < dataPoints; i++) {
            const time = new Date(Date.now() - (dataPoints - i) * 1000);
            
            // Simulate realistic FHR pattern
            let fhrValue = baseline;
            
            // Add baseline variability
            fhrValue += Math.sin(i * 0.1) * 5 + Math.random() * 10 - 5;
            
            // Add occasional accelerations
            if (Math.random() < 0.02) {
                fhrValue += 15 + Math.random() * 10;
            }
            
            // Add rare decelerations
            if (Math.random() < 0.01) {
                fhrValue -= 20 + Math.random() * 15;
            }
            
            // Keep within physiological range
            fhrValue = Math.max(100, Math.min(180, fhrValue));
            
            // Generate UA (маточная активность) data
            let uaValue = 5 + Math.random() * 5; // Baseline activity
            
            // Add contractions periodically (схватки)
            if (i % 60 < 10) { // Контракция каждую минуту длительностью 10 секунд
                const t = (i % 60) / 10;
                uaValue = Math.sin(t * Math.PI) * 60 + 20;
            }
            
            uaValue = Math.max(0, Math.min(100, uaValue));
            
            this.ctgData.push({
                time: time,
                fhr: Math.round(fhrValue),
                ua: Math.round(uaValue),
                timestamp: this.formatTime(time)
            });
        }
    }

    updatePatientInfo() {
        document.getElementById('patient-name').textContent = this.patientData.name;
        document.getElementById('patient-id').textContent = this.patientId;
        document.getElementById('patient-room').textContent = this.patientData.room;
        document.getElementById('patient-age').textContent = this.patientData.age;
        document.getElementById('patient-term').textContent = this.patientData.gestationalAge;
    }

    updateConditions() {
        const container = document.getElementById('conditions-list');
        
        if (this.patientData.conditions.length === 0) {
            container.innerHTML = `
                <div class="condition-item condition-item--none">
                    <span style="color: #2ED47A;">✓</span> Хронических заболеваний не выявлено
                </div>
                <div style="margin-top: 10px; padding: 10px; background: #f0f9ff; border-radius: 8px; font-size: 12px; color: #6C6C7D;">
                    <strong>Источник:</strong> МИС роддома
                </div>
            `;
            return;
        }
        
        // Сортируем болезни по severity
        const sortedConditions = [...this.patientData.conditions].sort((a, b) => {
            const severityOrder = { 'critical': 0, 'warning': 1, 'moderate': 2, 'mild': 3 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });
        
        container.innerHTML = `
            ${sortedConditions.map(condition => `
                <div class="condition-item condition-item--${condition.severity}">
                    <span class="condition-icon">${condition.icon}</span>
                    <span class="condition-name">${condition.name}</span>
                </div>
            `).join('')}
            <div style="margin-top: 12px; padding: 10px; background: #f0f9ff; border-radius: 8px; font-size: 11px; color: #6C6C7D;">
                <strong>Источник данных:</strong> МИС роддома<br>
                <small>Данные из электронной медкарты пациентки</small>
            </div>
        `;
    }

    updateWellnessScore() {
        // Calculate FWBS based on latest data
        const latestData = this.ctgData[this.ctgData.length - 1];
        let score = 95;
        
        if (latestData) {
            if (latestData.fhr < 110 || latestData.fhr > 160) score -= 20;
            if (latestData.fhr < 100 || latestData.fhr > 170) score -= 30;
        }
        
        // Update based on patient conditions
        if (this.patientData.conditions.some(c => c.severity === 'critical')) {
            score -= 40;
        } else if (this.patientData.conditions.some(c => c.severity === 'warning')) {
            score -= 20;
        }
        
        score = Math.max(0, Math.min(100, score));
        
        document.getElementById('wellness-score').textContent = score;
        
        // Update status badge
        const statusBadge = document.querySelector('.status-badge');
        if (score >= 85) {
            statusBadge.textContent = 'Норма';
            statusBadge.className = 'status-badge status-badge--normal';
        } else if (score >= 70) {
            statusBadge.textContent = 'Внимание';
            statusBadge.className = 'status-badge status-badge--warning';
        } else {
            statusBadge.textContent = 'Критично';
            statusBadge.className = 'status-badge status-badge--critical';
        }
    }

    initCharts() {
        this.initFHRChart();
        this.initUAChart();
        this.initWellnessChart();
    }

    initFHRChart() {
        const ctx = document.getElementById('fhr-chart');
        if (!ctx) return;
        
        const displayData = this.ctgData.slice(-120);
        
        this.fhrChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: displayData.map(d => d.timestamp),
                datasets: [{
                    label: 'ЧСС плода',
                    data: displayData.map(d => d.fhr),
                    borderColor: '#FF1744',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    tension: 0.15,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `ЧСС: ${context.parsed.y} уд/мин`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: false,
                        grid: { color: 'rgba(0,0,0,0.03)' }
                    },
                    y: {
                        position: 'right',
                        min: 50,
                        max: 210,
                        grid: {
                            color: function(context) {
                                if (context.tick.value % 30 === 0) {
                                    return 'rgba(0, 0, 0, 0.1)';
                                }
                                return 'rgba(0, 0, 0, 0.03)';
                            }
                        },
                        ticks: {
                            stepSize: 10,
                            font: { size: 10 },
                            callback: function(value) {
                                if (value % 30 === 0) return value;
                                return '';
                            }
                        }
                    }
                }
            }
        });
    }

    initUAChart() {
        const ctx = document.getElementById('ua-chart');
        if (!ctx) return;
        
        const displayData = this.ctgData.slice(-120);
        
        this.uaChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: displayData.map(d => d.timestamp),
                datasets: [{
                    label: 'Маточная активность',
                    data: displayData.map(d => d.ua),
                    borderColor: '#0D47A1',
                    backgroundColor: 'rgba(13, 71, 161, 0.1)',
                    borderWidth: 1.5,
                    tension: 0.15,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `СДМ: ${context.parsed.y} отн.ед`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: { color: 'rgba(0,0,0,0.03)' },
                        ticks: {
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 10,
                            font: { size: 10 }
                        }
                    },
                    y: {
                        position: 'right',
                        min: 0,
                        max: 100,
                        grid: {
                            color: function(context) {
                                if (context.tick.value % 25 === 0) {
                                    return 'rgba(0, 0, 0, 0.1)';
                                }
                                return 'rgba(0, 0, 0, 0.03)';
                            }
                        },
                        ticks: {
                            stepSize: 10,
                            font: { size: 10 },
                            callback: function(value) {
                                if (value % 25 === 0) return value;
                                return '';
                            }
                        }
                    }
                }
            }
        });
    }

    initWellnessChart() {
        const ctx = document.getElementById('wellness-mini-chart');
        if (!ctx) return;
        
        const trendData = [];
        for (let i = 10; i >= 0; i--) {
            trendData.push(85 + Math.random() * 10);
        }
        
        this.wellnessChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: Array(11).fill(''),
                datasets: [{
                    data: trendData,
                    borderColor: '#2ED47A',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: false,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: { display: false },
                    y: { display: false, min: 0, max: 100 }
                }
            }
        });
    }

    startRealtimeSimulation() {
        this.updateInterval = setInterval(() => {
            const lastData = this.ctgData[this.ctgData.length - 1];
            const newTime = new Date();
            
            // Generate new FHR
            let newFHR = lastData.fhr;
            newFHR += (Math.random() - 0.5) * 8;
            
            if (Math.random() < 0.01) newFHR += 20;
            if (Math.random() < 0.005) newFHR -= 25;
            
            newFHR = Math.max(100, Math.min(180, Math.round(newFHR)));
            
            // Generate new UA (схватки)
            let newUA = 5 + Math.random() * 5;
            const seconds = newTime.getSeconds();
            
            // Схватка каждые 30 секунд
            if (seconds % 30 < 5) {
                const t = (seconds % 30) / 5;
                newUA = Math.sin(t * Math.PI) * 50 + 30;
            }
            
            newUA = Math.max(0, Math.min(100, Math.round(newUA)));
            
            const newPoint = {
                time: newTime,
                fhr: newFHR,
                ua: newUA,
                timestamp: this.formatTime(newTime)
            };
            
            this.ctgData.push(newPoint);
            
            if (this.ctgData.length > 120) {
                this.ctgData.shift();
            }
            
            this.updateCharts();
            this.updateStats();
            
        }, 1000);
    }

    updateCharts() {
        const displayData = this.ctgData.slice(-120);
        
        if (this.fhrChart) {
            this.fhrChart.data.labels = displayData.map(d => d.timestamp);
            this.fhrChart.data.datasets[0].data = displayData.map(d => d.fhr);
            this.fhrChart.update('none');
        }
        
        if (this.uaChart) {
            this.uaChart.data.labels = displayData.map(d => d.timestamp);
            this.uaChart.data.datasets[0].data = displayData.map(d => d.ua);
            this.uaChart.update('none');
        }
    }

    updateStats() {
        const recentData = this.ctgData;
        
        if (recentData.length > 0) {
            const avgFHR = Math.round(
                recentData.reduce((sum, d) => sum + d.fhr, 0) / recentData.length
            );
            document.getElementById('fhr-value').textContent = avgFHR;
            
            const variability = Math.round(
                Math.max(...recentData.map(d => d.fhr)) - 
                Math.min(...recentData.map(d => d.fhr))
            );
            document.getElementById('variability-value').textContent = variability;
            
            let accels = 0, decels = 0;
            for (let i = 1; i < recentData.length; i++) {
                const diff = recentData[i].fhr - recentData[i-1].fhr;
                if (diff > 15) accels++;
                if (diff < -15) decels++;
            }
            document.getElementById('accel-value').textContent = accels;
            document.getElementById('decel-value').textContent = decels;
        }
    }

    formatTime(date) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    startClock() {
        const updateTime = () => {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const timeElement = document.getElementById('current-time');
            if (timeElement) {
                timeElement.textContent = `${hours}:${minutes}`;
            }
        };
        
        updateTime();
        setInterval(updateTime, 1000);
    }
}

// Initialize app when DOM is ready
let detailsApp;

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing patient details page...');
    detailsApp = new DetailsApp();
    detailsApp.init();
});