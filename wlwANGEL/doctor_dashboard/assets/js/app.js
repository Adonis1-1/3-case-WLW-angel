// Mock Data - Данные-заглушки для демонстрации
const mockPatients = [
    {
        patient_id: "patient_101",
        patient_name: "Иванова И.И.",
        room_number: "201",
        fwbs_history: [95, 94, 93, 90, 85, 88, 91, 89, 87, 85],
        action_priority: { level: "NORMAL", code: "green" },
        alerts: [],
        last_update: new Date()
    },
    {
        patient_id: "patient_102",
        patient_name: "Петрова А.С.",
        room_number: "202",
        fwbs_history: [85, 82, 80, 78, 75, 70, 65, 60, 55, 50],
        action_priority: { level: "CRITICAL", code: "red" },
        alerts: ["late_deceleration", "low_variability"],
        last_update: new Date()
    },
    {
        patient_id: "patient_103",
        patient_name: "Сидорова М.В.",
        room_number: "203",
        fwbs_history: [92, 90, 88, 85, 82, 80, 78, 80, 82, 85],
        action_priority: { level: "HIGH", code: "orange" },
        alerts: ["early_deceleration"],
        last_update: new Date()
    },
    {
        patient_id: "patient_104",
        patient_name: "Козлова Е.Д.",
        room_number: "204",
        fwbs_history: [98, 97, 96, 95, 94, 93, 92, 91, 92, 93],
        action_priority: { level: "NORMAL", code: "green" },
        alerts: [],
        last_update: new Date()
    },
    {
        patient_id: "patient_105",
        patient_name: "Новикова О.П.",
        room_number: "205",
        fwbs_history: [88, 86, 84, 82, 80, 78, 76, 75, 74, 73],
        action_priority: { level: "MODERATE", code: "yellow" },
        alerts: ["low_variability"],
        last_update: new Date()
    },
    {
        patient_id: "patient_106",
        patient_name: "Морозова Т.А.",
        room_number: "206",
        fwbs_history: [95, 93, 91, 89, 87, 85, 86, 88, 90, 92],
        action_priority: { level: "NORMAL", code: "green" },
        alerts: [],
        last_update: new Date()
    },
    {
        patient_id: "patient_107",
        patient_name: "Волкова Н.И.",
        room_number: "301",
        fwbs_history: [70, 68, 65, 62, 60, 58, 55, 53, 50, 48],
        action_priority: { level: "CRITICAL", code: "red" },
        alerts: ["late_deceleration", "bradycardia", "low_variability"],
        last_update: new Date()
    },
    {
        patient_id: "patient_108",
        patient_name: "Зайцева Л.К.",
        room_number: "302",
        fwbs_history: [90, 88, 86, 84, 82, 80, 82, 84, 86, 88],
        action_priority: { level: "MODERATE", code: "yellow" },
        alerts: ["variable_deceleration"],
        last_update: new Date()
    },
    {
        patient_id: "patient_109",
        patient_name: "Павлова В.С.",
        room_number: "303",
        fwbs_history: [96, 95, 94, 93, 92, 91, 90, 91, 92, 93],
        action_priority: { level: "NORMAL", code: "green" },
        alerts: [],
        last_update: new Date()
    },
    {
        patient_id: "patient_110",
        patient_name: "Белова Г.М.",
        room_number: "304",
        fwbs_history: [82, 80, 78, 76, 74, 72, 70, 71, 72, 73],
        action_priority: { level: "HIGH", code: "orange" },
        alerts: ["early_deceleration", "tachycardia"],
        last_update: new Date()
    },
    {
        patient_id: "patient_111",
        patient_name: "Соколова Ю.А.",
        room_number: "305",
        fwbs_history: [94, 93, 92, 91, 90, 89, 88, 89, 90, 91],
        action_priority: { level: "NORMAL", code: "green" },
        alerts: [],
        last_update: new Date()
    },
    {
        patient_id: "patient_112",
        patient_name: "Михайлова Д.В.",
        room_number: "306",
        fwbs_history: [78, 76, 74, 72, 70, 68, 66, 67, 68, 69],
        action_priority: { level: "HIGH", code: "orange" },
        alerts: ["variable_deceleration", "low_variability"],
        last_update: new Date()
    }
];

// Alert descriptions
const alertDescriptions = {
    'late_deceleration': '⚠️ Поздняя децелерация',
    'early_deceleration': '📉 Ранняя децелерация',
    'variable_deceleration': '📊 Вариабельная децелерация',
    'low_variability': '📈 Низкая вариабельность',
    'bradycardia': '💓 Брадикардия',
    'tachycardia': '💗 Тахикардия'
};

// Application Class
class DashboardApp {
    constructor() {
        this.patients = [...mockPatients];
        this.currentSort = 'priority';
        this.currentFilter = 'all';
        this.charts = new Map();
        this.isUpdating = false;
    }

    init() {
        console.log('Инициализация дашборда...');
        this.startClock();
        this.renderDashboard();
        this.updateStats();
        this.startSimulation();
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

    handleSort(sortType) {
        console.log('Сортировка по:', sortType);
        
        // Update active button
        document.querySelectorAll('[data-sort]').forEach(btn => {
            btn.classList.toggle('btn--active', btn.dataset.sort === sortType);
        });
        
        this.currentSort = sortType;
        this.renderDashboard();
    }

    handleFilter(filterType) {
        console.log('Фильтр:', filterType);
        
        // Update active button
        document.querySelectorAll('[data-filter]').forEach(btn => {
            btn.classList.toggle('btn--active', btn.dataset.filter === filterType);
        });
        
        this.currentFilter = filterType;
        this.renderDashboard();
        this.updateStats();
    }

    sortPatients(patients) {
        const sorted = [...patients];
        
        switch (this.currentSort) {
            case 'priority':
                const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MODERATE': 2, 'NORMAL': 3 };
                sorted.sort((a, b) => 
                    priorityOrder[a.action_priority.level] - priorityOrder[b.action_priority.level]
                );
                break;
            case 'room':
                sorted.sort((a, b) => a.room_number.localeCompare(b.room_number));
                break;
            case 'name':
                sorted.sort((a, b) => a.patient_name.localeCompare(b.patient_name));
                break;
        }
        
        return sorted;
    }

    filterPatients(patients) {
        switch (this.currentFilter) {
            case 'critical':
                return patients.filter(p => p.action_priority.level === 'CRITICAL');
            case 'warning':
                return patients.filter(p => 
                    p.action_priority.level === 'HIGH' || 
                    p.action_priority.level === 'MODERATE'
                );
            case 'normal':
                return patients.filter(p => p.action_priority.level === 'NORMAL');
            default:
                return patients;
        }
    }

    renderDashboard(animate = true) {
        console.log('Отрисовка дашборда...');
        const container = document.getElementById('dashboard-grid');
        if (!container) {
            console.error('Контейнер dashboard-grid не найден!');
            return;
        }
        
        // Clear existing charts
        this.charts.forEach(chart => {
            try {
                chart.destroy();
            } catch(e) {
                console.log('Ошибка при удалении графика:', e);
            }
        });
        this.charts.clear();
        
        // Filter and sort patients
        let displayPatients = this.filterPatients(this.patients);
        displayPatients = this.sortPatients(displayPatients);
        
        console.log(`Отображение ${displayPatients.length} пациенток`);
        
        // Clear container
        container.innerHTML = '';
        
        // Render patient cards
        displayPatients.forEach((patient, index) => {
            const card = this.createPatientCard(patient, animate);
            container.appendChild(card);
            
            // Create chart after card is in DOM
            setTimeout(() => {
                this.createSparkline(patient.patient_id, patient.fwbs_history);
            }, 100 + (animate ? index * 50 : 0));
        });
        
        if (displayPatients.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #9A9AAB;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                    <p>Нет пациенток, соответствующих выбранным фильтрам</p>
                </div>
            `;
        }
    }

    updateSinglePatientCard(patientData) {
        // Обновляем только одну карточку без полной перерисовки
        const existingCard = document.getElementById(`card-${patientData.patient_id}`);
        if (!existingCard) {
            this.renderDashboard(false);
            return;
        }

        // Добавляем класс для плавной анимации
        existingCard.classList.add('updating');
        
        // Обновляем только изменяющиеся элементы
        const fwbsValue = existingCard.querySelector('.sparkline-value');
        const lastUpdate = existingCard.querySelector('.last-update');
        
        if (fwbsValue) {
            fwbsValue.textContent = patientData.fwbs_history[patientData.fwbs_history.length - 1];
        }
        
        if (lastUpdate) {
            lastUpdate.textContent = `Обновлено: ${this.formatTime(patientData.last_update)}`;
        }

        // Обновляем статус карточки
        existingCard.className = 'patient-card';
        const statusClass = this.getStatusClass(patientData.action_priority.level);
        if (statusClass) {
            existingCard.classList.add(statusClass);
        }

        // Обновляем график
        const chart = this.charts.get(patientData.patient_id);
        if (chart) {
            chart.data.datasets[0].data = patientData.fwbs_history;
            chart.data.datasets[0].borderColor = this.getChartColor(patientData.fwbs_history[patientData.fwbs_history.length - 1]);
            chart.update('none'); // 'none' для мгновенного обновления без анимации
        }

        // Убираем класс анимации через 500мс
        setTimeout(() => {
            existingCard.classList.remove('updating');
        }, 500);
    }

createPatientCard(patientData, animate = true) {
    const card = document.createElement('a');
    card.href = `patient-details.html?id=${patientData.patient_id}`;
    card.className = 'patient-card patient-card-link';
    card.id = `card-${patientData.patient_id}`;
    
    // Add status class
    const statusClass = this.getStatusClass(patientData.action_priority.level);
    if (statusClass) {
        card.classList.add(statusClass);
    }
    
    // Add animation class only if needed
    if (animate) {
        card.style.animation = 'slideInUp 0.5s ease-out';
    }
    
    // Build card HTML
    card.innerHTML = `
        <div class="patient-card__priority"></div>
        <div class="patient-card__header">
            <div class="patient-card__info">
                <div>
                    <div class="patient-card__name">${patientData.patient_name}</div>
                    <div style="font-size: 12px; color: #9A9AAB;">ID: ${patientData.patient_id}</div>
                </div>
                <div class="patient-card__room">
                    🏥 ${patientData.room_number}
                </div>
            </div>
        </div>
        <div class="patient-card__body">
            <div class="sparkline-container">
                <div class="sparkline-label">
                    <span>FWBS Score</span>
                    <span class="sparkline-value">${patientData.fwbs_history[patientData.fwbs_history.length - 1]}</span>
                </div>
                <div class="sparkline-chart">
                    <canvas id="chart-${patientData.patient_id}" width="280" height="60"></canvas>
                </div>
            </div>
            ${this.renderAlerts(patientData.alerts)}
        </div>
        <div class="patient-card__footer">
            <span class="last-update">Обновлено: ${this.formatTime(patientData.last_update)}</span>
            <span class="card-action">
                Подробнее →
            </span>
        </div>
    `;
    
    // Предотвращаем переход по ссылке при клике на интерактивные элементы
    card.addEventListener('click', (e) => {
        if (e.target.tagName === 'CANVAS') {
            e.preventDefault();
        }
    });
    
    return card;
}

// Удалите или закомментируйте старый метод viewDetails

    getStatusClass(level) {
        const statusMap = {
            'CRITICAL': 'patient-card--status-critical',
            'HIGH': 'patient-card--status-high',
            'MODERATE': 'patient-card--status-moderate',
            'NORMAL': ''
        };
        return statusMap[level] || '';
    }

    renderAlerts(alerts) {
        if (!alerts || alerts.length === 0) {
            return `
                <div class="alert-section">
                    <div class="alert-title">Тревоги</div>
                    <div style="color: #9A9AAB; font-size: 13px;">
                        ✅ Нет активных тревог
                    </div>
                </div>
            `;
        }
        
        const alertItems = alerts.map(alert => {
            const isCritical = ['late_deceleration', 'bradycardia'].includes(alert);
            const alertClass = isCritical ? 'alert-item--critical' : 'alert-item--warning';
            const description = alertDescriptions[alert] || alert;
            
            return `
                <div class="alert-item ${alertClass}">
                    <span class="alert-icon">${description.split(' ')[0]}</span>
                    <span>${description.split(' ').slice(1).join(' ')}</span>
                </div>
            `;
        }).join('');
        
        return `
            <div class="alert-section">
                <div class="alert-title">Активные тревоги</div>
                <div class="alert-icons">
                    ${alertItems}
                </div>
            </div>
        `;
    }

    createSparkline(patientId, data) {
        const canvas = document.getElementById(`chart-${patientId}`);
        if (!canvas) {
            console.log(`Canvas для пациента ${patientId} не найден`);
            return;
        }
        
        try {
            const ctx = canvas.getContext('2d');
            const chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: Array(data.length).fill(''),
                    datasets: [{
                        data: data,
                        borderColor: this.getChartColor(data[data.length - 1]),
                        borderWidth: 2,
                        tension: 0.4,
                        fill: false,
                        pointRadius: 0,
                        pointHoverRadius: 3,
                        pointHoverBackgroundColor: this.getChartColor(data[data.length - 1])
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 750,
                        easing: 'easeInOutQuart'
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: { 
                            enabled: true,
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            displayColors: false,
                            callbacks: {
                                label: function(context) {
                                    return `FWBS: ${context.parsed.y}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: { 
                            display: false,
                            grid: { display: false }
                        },
                        y: { 
                            display: false,
                            min: 0,
                            max: 100,
                            grid: { display: false }
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            });
            
            this.charts.set(patientId, chart);
        } catch(error) {
            console.error(`Ошибка создания графика для ${patientId}:`, error);
        }
    }

    getChartColor(value) {
        if (value >= 85) return '#2ED47A';
        if (value >= 70) return '#FFB946';
        if (value >= 50) return '#FF9F40';
        return '#FF5B5B';
    }

    formatTime(date) {
        const now = new Date();
        const diff = Math.floor((now - date) / 1000); // seconds
        
        if (diff < 60) return 'Только что';
        if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
        return `${Math.floor(diff / 86400)} д. назад`;
    }

    updateStats() {
        const filtered = this.filterPatients(this.patients);
        const critical = this.patients.filter(p => p.action_priority.level === 'CRITICAL').length;
        const warning = this.patients.filter(p => 
            p.action_priority.level === 'HIGH' || p.action_priority.level === 'MODERATE'
        ).length;
        
        document.getElementById('total-patients').textContent = filtered.length;
        document.getElementById('critical-patients').textContent = critical;
        document.getElementById('warning-patients').textContent = warning;
    }

    startSimulation() {
        // Обновление каждые 5 секунд вместо 3
        setInterval(() => {
            // Обновляем только 1 пациентку за раз для плавности
            const randomIndex = Math.floor(Math.random() * this.patients.length);
            const patient = this.patients[randomIndex];
            
            // Более плавное изменение значений (меньше диапазон)
            const lastValue = patient.fwbs_history[patient.fwbs_history.length - 1];
            const change = (Math.random() - 0.5) * 5; // Уменьшили с 10 до 5
            const newValue = Math.max(30, Math.min(100, lastValue + change));
            
            patient.fwbs_history.shift();
            patient.fwbs_history.push(Math.round(newValue));
            
            // Update priority based on new value
            const oldPriority = patient.action_priority.level;
            if (newValue < 50) {
                patient.action_priority = { level: "CRITICAL", code: "red" };
                if (!patient.alerts.includes('low_variability')) {
                    patient.alerts.push('low_variability');
                }
            } else if (newValue < 70) {
                patient.action_priority = { level: "HIGH", code: "orange" };
            } else if (newValue < 85) {
                patient.action_priority = { level: "MODERATE", code: "yellow" };
                patient.alerts = patient.alerts.filter(a => a !== 'low_variability');
            } else {
                patient.action_priority = { level: "NORMAL", code: "green" };
                patient.alerts = [];
            }
            
            patient.last_update = new Date();
            
            // Обновляем только одну карточку, если приоритет не изменился
            if (oldPriority === patient.action_priority.level && this.currentSort !== 'priority') {
                this.updateSinglePatientCard(patient);
            } else {
                // Если изменился приоритет и стоит сортировка по приоритету - перерисовываем всё
                this.renderDashboard(false);
            }
            
            this.updateStats();
            
        }, 5000); // Изменено с 3000 на 5000 миллисекунд
    }

    refreshData() {
        console.log('Обновление данных...');
        
        // Animate refresh button
        event.target.style.transform = 'rotate(360deg)';
        setTimeout(() => {
            event.target.style.transform = '';
        }, 500);
        
        // Simulate data refresh
        this.patients.forEach(patient => {
            const change = (Math.random() - 0.5) * 3; // Меньший диапазон изменений
            patient.fwbs_history = patient.fwbs_history.map(v => 
                Math.max(30, Math.min(100, Math.round(v + change)))
            );
            patient.last_update = new Date();
        });
        
        this.renderDashboard(false); // Без анимации при обновлении
        this.updateStats();
    }

    viewDetails(patientId) {
        console.log(`Просмотр деталей пациента: ${patientId}`);
        const patient = this.patients.find(p => p.patient_id === patientId);
        if (patient) {
            alert(`
Карточка пациентки
==================
Имя: ${patient.patient_name}
ID: ${patient.patient_id}
Палата: ${patient.room_number}
FWBS Score: ${patient.fwbs_history[patient.fwbs_history.length - 1]}
Статус: ${patient.action_priority.level}
Тревоги: ${patient.alerts.length > 0 ? patient.alerts.join(', ') : 'Нет'}

В production версии здесь будет переход на детальную страницу пациентки.
            `);
        }
    }
}

// Global app instance
let app;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM загружен, запускаем приложение...');
    
    // Create and initialize app
    app = new DashboardApp();
    app.init();
    
    console.log('Приложение запущено!');
});

// Also try to init immediately if DOM is already loaded
if (document.readyState === 'loading') {
    console.log('Ожидание загрузки DOM...');
} else {
    console.log('DOM уже загружен, запускаем приложение немедленно...');
    app = new DashboardApp();
    app.init();
}