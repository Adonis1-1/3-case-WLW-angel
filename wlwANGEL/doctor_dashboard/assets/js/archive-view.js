// Archive viewer for recorded CTG data with dual charts
class ArchiveViewer {
    constructor() {
        this.recordId = null;
        this.recordData = null;
        this.ctgData = [];
        this.fhrChart = null;
        this.uaChart = null;
        this.isPlaying = false;
        this.playbackSpeed = 1;
        this.currentPosition = 0;
        this.playbackInterval = null;
        this.totalDuration = 0;
        this.windowSize = 300; // 5 minutes display window (in seconds)
    }

    init() {
        this.recordId = this.getRecordIdFromUrl();
        console.log('Loading archive record:', this.recordId);
        
        this.loadRecordData();
        this.initCharts();
        this.setupEventListeners();
        this.updateCharts();
        this.updateStats();
    }

    getRecordIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id') || 'archive_001';
    }

    loadRecordData() {
        // Mock archive data - в реальном приложении это бы загружалось с сервера
        const mockArchiveRecords = {
            'archive_001': {
                name: 'Соколова Елена Петровна',
                date: '2025-01-24',
                time: '14:30 - 18:45',
                room: '203',
                duration: '4ч 15мин',
                outcome: 'Естественные роды, без осложнений',
                fwbsAverage: 88,
                doctor: 'Иванов И.И.'
            },
            'archive_002': {
                name: 'Михайлова Ольга Андреевна',
                date: '2025-01-23',
                time: '09:00 - 16:30',
                room: '305',
                duration: '7ч 30мин',
                outcome: 'Кесарево сечение (плановое)',
                fwbsAverage: 75,
                doctor: 'Петров П.П.'
            },
            'archive_003': {
                name: 'Белова Татьяна Сергеевна',
                date: '2025-01-22',
                time: '20:15 - 03:45',
                room: '201',
                duration: '7ч 30мин',
                outcome: 'Естественные роды, эпизиотомия',
                fwbsAverage: 82,
                doctor: 'Сидорова С.С.'
            }
        };

        this.recordData = mockArchiveRecords[this.recordId] || mockArchiveRecords['archive_001'];
        
        // Generate full CTG recording data
        this.generateRecordedCTGData();
        
        // Update UI with record info
        this.updateRecordInfo();
    }

    generateRecordedCTGData() {
        // Generate complete recording (e.g., 4 hours of data)
        const durationMinutes = parseInt(this.recordData.duration) * 60 || 240; // Default 4 hours
        this.totalDuration = durationMinutes * 60; // in seconds
        
        const fhrBaseline = 140;
        const uaBaseline = 10;
        
        // Контроль фаз родов
        const latentPhaseEnd = Math.floor(this.totalDuration * 0.4); // 40% времени - латентная фаза
        const activePhaseEnd = Math.floor(this.totalDuration * 0.8); // 40% времени - активная фаза
        
        // Generate data points for entire recording (sample every second)
        for (let i = 0; i <= this.totalDuration; i++) {
            let fhrValue = fhrBaseline;
            let uaValue = uaBaseline;
            
            // Определяем фазу родов
            let contractionFrequency = 300; // секунд между схватками
            let contractionDuration = 30; // секунд
            let contractionIntensity = 30; // относительные единицы
            
            if (i < latentPhaseEnd) {
                // Латентная фаза - редкие слабые схватки
                contractionFrequency = 300 + Math.random() * 60; // 5-6 минут
                contractionDuration = 20 + Math.random() * 10;
                contractionIntensity = 20 + Math.random() * 20;
            } else if (i < activePhaseEnd) {
                // Активная фаза - частые умеренные схватки
                contractionFrequency = 180 + Math.random() * 60; // 3-4 минуты
                contractionDuration = 40 + Math.random() * 20;
                contractionIntensity = 40 + Math.random() * 30;
            } else {
                // Потужной период - очень частые сильные схватки
                contractionFrequency = 120 + Math.random() * 60; // 2-3 минуты
                contractionDuration = 60 + Math.random() * 20;
                contractionIntensity = 60 + Math.random() * 30;
            }
            
            // Генерация паттерна схваток
            const cyclePosition = i % contractionFrequency;
            if (cyclePosition < contractionDuration) {
                // Схватка активна
                const t = cyclePosition / contractionDuration;
                // Колоколообразная форма схватки
                uaValue = contractionIntensity * Math.sin(t * Math.PI) + uaBaseline;
                
                // Влияние на ЧСС во время схватки
                if (t > 0.5) { // Легкая децелерация в пике схватки
                    fhrValue -= Math.sin((t - 0.5) * Math.PI * 2) * 15;
                }
            } else {
                // Между схватками
                uaValue = uaBaseline + Math.random() * 5;
            }
            
            // Базовая вариабельность ЧСС
            fhrValue += Math.sin(i * 0.05) * 5; // Медленные колебания
            fhrValue += Math.sin(i * 0.3) * 3;  // Быстрые колебания
            fhrValue += (Math.random() - 0.5) * 8; // Случайная вариабельность
            
            // Акцелерации (учащения)
            if (Math.random() < 0.003) {
                fhrValue += 20 + Math.random() * 10;
            }
            
            // Децелерации (замедления) - чаще в активной фазе
            const decelProbability = i > activePhaseEnd ? 0.005 : 0.002;
            if (Math.random() < decelProbability) {
                fhrValue -= 25 + Math.random() * 15;
            }
            
            // Ограничения физиологических значений
            fhrValue = Math.max(100, Math.min(180, fhrValue));
            uaValue = Math.max(0, Math.min(100, uaValue));
            
            this.ctgData.push({
                time: i,
                fhr: Math.round(fhrValue),
                ua: Math.round(uaValue),
                label: this.formatTimeLabel(i)
            });
        }
        
        console.log(`Generated ${this.ctgData.length} data points for ${this.totalDuration} seconds`);
    }

    updateRecordInfo() {
        document.getElementById('patient-name').textContent = this.recordData.name;
        document.getElementById('record-id').textContent = this.recordId;
        document.getElementById('record-date').textContent = this.formatDate(this.recordData.date);
        document.getElementById('patient-room').textContent = this.recordData.room;
        document.getElementById('record-duration').textContent = this.recordData.duration;
        document.getElementById('avg-fwbs').textContent = this.recordData.fwbsAverage;
        document.getElementById('outcome').textContent = this.recordData.outcome;
        document.getElementById('record-time').textContent = this.recordData.time;
        document.getElementById('doctor').textContent = this.recordData.doctor;
        document.getElementById('total-time').textContent = this.formatDuration(this.totalDuration);
        
        // Update timeline slider max value
        const slider = document.getElementById('timeline-slider');
        slider.max = this.totalDuration;
    }

    initCharts() {
        this.initFHRChart();
        this.initUAChart();
    }

    initFHRChart() {
        const ctx = document.getElementById('fhr-chart');
        if (!ctx) return;
        
        this.fhrChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'ЧСС плода',
                    data: [],
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
        
        this.uaChart = new Chart(ctx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Маточная активность',
                    data: [],
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

    updateCharts() {
        // Calculate window bounds
        const startIdx = Math.max(0, Math.floor(this.currentPosition - this.windowSize / 2));
        const endIdx = Math.min(this.ctgData.length, startIdx + this.windowSize);
        
        // Extract window data
        const displayData = this.ctgData.slice(startIdx, endIdx);
        
        // Update FHR chart
        if (this.fhrChart) {
            this.fhrChart.data.labels = displayData.map(d => d.label);
            this.fhrChart.data.datasets[0].data = displayData.map(d => d.fhr);
            this.fhrChart.update('none');
        }
        
        // Update UA chart
        if (this.uaChart) {
            this.uaChart.data.labels = displayData.map(d => d.label);
            this.uaChart.data.datasets[0].data = displayData.map(d => d.ua);
            this.uaChart.update('none');
        }
    }

    updateStats() {
        // Calculate stats for current window
        const windowStart = Math.max(0, this.currentPosition - 600); // Last 10 minutes
        const windowEnd = Math.min(this.ctgData.length - 1, this.currentPosition);
        
        if (windowEnd <= windowStart) return;
        
        const windowData = this.ctgData.slice(windowStart, windowEnd + 1);
        
        // Average FHR
        const avgFHR = Math.round(
            windowData.reduce((sum, d) => sum + d.fhr, 0) / windowData.length
        );
        document.getElementById('fhr-value').textContent = avgFHR;
        
        // Variability
        const fhrValues = windowData.map(d => d.fhr);
        const variability = Math.round(
            Math.max(...fhrValues) - Math.min(...fhrValues)
        );
        document.getElementById('variability-value').textContent = variability;
        
        // Accelerations and Decelerations (за 20 минут)
        const last20min = Math.min(1200, windowData.length); // 20 minutes in seconds
        const recentData = windowData.slice(-last20min);
        
        let accels = 0, decels = 0;
        for (let i = 15; i < recentData.length; i++) {
            const avgBefore = recentData.slice(i - 15, i).reduce((s, d) => s + d.fhr, 0) / 15;
            const current = recentData[i].fhr;
            
            if (current - avgBefore > 15) accels++;
            if (avgBefore - current > 15) decels++;
        }
        
        document.getElementById('accel-value').textContent = Math.round(accels / 10); // Normalize
        document.getElementById('decel-value').textContent = Math.round(decels / 10); // Normalize
    }

    setupEventListeners() {
        const slider = document.getElementById('timeline-slider');
        
        // Scrubbing with slider
        slider.addEventListener('input', (e) => {
            const position = parseInt(e.target.value);
            this.seekTo(position);
        });
        
        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.togglePlayback();
            }
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                this.seekTo(Math.max(0, this.currentPosition - 30));
            }
            if (e.code === 'ArrowRight') {
                e.preventDefault();
                this.seekTo(Math.min(this.totalDuration, this.currentPosition + 30));
            }
            if (e.key === '1') this.setSpeed(1);
            if (e.key === '2') this.setSpeed(2);
            if (e.key === '4') this.setSpeed(4);
            if (e.key === '8') this.setSpeed(8);
        });
    }

    togglePlayback() {
        this.isPlaying = !this.isPlaying;
        
        const icon = document.getElementById('playback-icon');
        const text = document.getElementById('playback-text');
        
        if (this.isPlaying) {
            icon.textContent = '⏸';
            text.textContent = 'Пауза';
            this.startPlayback();
        } else {
            icon.textContent = '▶';
            text.textContent = 'Воспроизвести';
            this.stopPlayback();
        }
    }

    startPlayback() {
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
        }
        
        // Reset to start if at the end
        if (this.currentPosition >= this.totalDuration) {
            this.currentPosition = 0;
        }
        
        this.playbackInterval = setInterval(() => {
            this.currentPosition += this.playbackSpeed;
            
            if (this.currentPosition >= this.totalDuration) {
                this.currentPosition = this.totalDuration;
                this.stopPlayback();
                this.isPlaying = false;
                document.getElementById('playback-icon').textContent = '▶';
                document.getElementById('playback-text').textContent = 'Воспроизвести';
            }
            
            this.updatePosition();
        }, 1000 / this.playbackSpeed);
    }

    stopPlayback() {
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
            this.playbackInterval = null;
        }
    }

    changeSpeed() {
        const speeds = [1, 2, 4, 8, 16, 32];
        const currentIndex = speeds.indexOf(this.playbackSpeed);
        this.playbackSpeed = speeds[(currentIndex + 1) % speeds.length];
        
        document.getElementById('speed-text').textContent = `${this.playbackSpeed}x`;
        
        // Restart playback with new speed if playing
        if (this.isPlaying) {
            this.startPlayback();
        }
    }

    setSpeed(speed) {
        this.playbackSpeed = speed;
        document.getElementById('speed-text').textContent = `${this.playbackSpeed}x`;
        
        if (this.isPlaying) {
            this.startPlayback();
        }
    }

    restart() {
        this.seekTo(0);
        if (!this.isPlaying) {
            this.togglePlayback();
        }
    }

    seekTo(position) {
        this.currentPosition = Math.max(0, Math.min(this.totalDuration, position));
        this.updatePosition();
    }

    updatePosition() {
        // Update slider
        const slider = document.getElementById('timeline-slider');
        slider.value = this.currentPosition;
        
        // Update progress bar
        const progress = document.getElementById('timeline-progress');
        const progressPercent = (this.currentPosition / this.totalDuration) * 100;
        progress.style.width = `${progressPercent}%`;
        
        // Update time display
        document.getElementById('current-time').textContent = this.formatDuration(this.currentPosition);
        
        // Update charts and stats
        this.updateCharts();
        this.updateStats();
    }

    formatTimeLabel(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        return date.toLocaleDateString('ru-RU', options);
    }
}

// Initialize viewer when DOM is ready
let archiveViewer;

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing archive viewer...');
    archiveViewer = new ArchiveViewer();
    archiveViewer.init();
});