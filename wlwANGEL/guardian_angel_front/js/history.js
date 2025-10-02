/**
 * History page with CTG data from backend API
 */

// API configuration
const API_BASE_URL = 'http://localhost:8000';

// Хранилище для графиков и их контроллеров
const historyCharts = {};
const scrubberControllers = {};

// Главная функция для загрузки и отображения истории
async function fetchAndRenderHistory() {
    const container = document.getElementById('historySessions');
    
    if (!container) return;
    
    // Показываем индикатор загрузки
    container.innerHTML = `
        <div class="loading-message">
            <div class="spinner"></div>
            <p>Загрузка истории записей...</p>
        </div>
    `;
    
    try {
        // Запрашиваем список сессий
        console.log('Загрузка списка сессий...');
        const sessionsResponse = await fetch(`${API_BASE_URL}/history/sessions`);
        
        if (!sessionsResponse.ok) {
            throw new Error(`HTTP error! status: ${sessionsResponse.status}`);
        }
        
        const sessions = await sessionsResponse.json();
        
        // Проверяем, есть ли записи
        if (!sessions || sessions.length === 0) {
            container.innerHTML = `
                <div class="no-records">
                    <p>Нет записей</p>
                </div>
            `;
            return;
        }
        
        console.log(`Найдено сессий: ${sessions.length}`);
        
        // Загружаем детальные данные для каждой сессии
        const sessionsWithData = [];
        
        for (const session of sessions) {
            try {
                console.log(`Загрузка данных для сессии ${session.id}...`);
                
                // Запрашиваем данные графика для сессии
                const detailsResponse = await fetch(`${API_BASE_URL}/history/session/${session.id}`);
                
                if (!detailsResponse.ok) {
                    throw new Error(`HTTP error! status: ${detailsResponse.status}`);
                }
                
                const sessionDetails = await detailsResponse.json();
                
                // Объединяем информацию о сессии с данными для графика
                sessionsWithData.push({
                    ...session,
                    data: {
                        labels: sessionDetails.labels,
                        fhr: sessionDetails.fhr,
                        ua: sessionDetails.ua
                    }
                });
                
                console.log(`Данные для сессии ${session.id} загружены успешно`);
            } catch (error) {
                console.error(`Ошибка загрузки данных для сессии ${session.id}:`, error);
                // Продолжаем загрузку остальных сессий
            }
        }
        
        if (sessionsWithData.length === 0) {
            container.innerHTML = `
                <div class="error-message">
                    <p>Не удалось загрузить данные сессий</p>
                    <button onclick="fetchAndRenderHistory()" class="retry-button">Повторить</button>
                </div>
            `;
            return;
        }
        
        // Рендерим все загруженные сессии
        console.log(`Отображение ${sessionsWithData.length} сессий`);
        renderSessions(sessionsWithData);
        
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        
        container.innerHTML = `
            <div class="error-message">
                <p>Невозможность загрузить данные. Убедитесь, что сервер запущен.</p>
                <p class="error-details">${error.message}</p>
                <button onclick="fetchAndRenderHistory()" class="retry-button">Повторить</button>
            </div>
        `;
    }
}

// Рендеринг сессий
function renderSessions(sessionsToRender) {
    const container = document.getElementById('historySessions');
    
    if (!container) return;
    
    // Очищаем предыдущие графики
    Object.keys(historyCharts).forEach(key => {
        if (key.includes('timeLabels')) {
            delete historyCharts[key];
        } else if (historyCharts[key]) {
            historyCharts[key].destroy();
            delete historyCharts[key];
        }
    });
    
    // Очищаем контроллеры скрабберов
    Object.keys(scrubberControllers).forEach(key => {
        delete scrubberControllers[key];
    });
    
    if (sessionsToRender.length === 0) {
        container.innerHTML = `
            <div class="no-records">
                <p>Нет записей для отображения</p>
            </div>
        `;
        return;
    }
    
    // Создаем HTML для всех сессий
    const sessionsHTML = sessionsToRender.map((session, index) => 
        createSessionElement(session, index)
    ).join('');
    
    container.innerHTML = sessionsHTML;
    
    // Создаем графики и скрабберы для каждой сессии
    setTimeout(() => {
        sessionsToRender.forEach((session, index) => {
            if (session.data && session.data.labels) {
                createHistoryCharts(session, index);
                
                // Создаем скраббер только если есть достаточно данных
                if (session.data.labels.length > 0) {
                    scrubberControllers[index] = new HistoryScrubber(
                        index, 
                        session.data, 
                        session.durationMins,
                        session.startTime
                    );
                }
            } else {
                console.warn(`Нет данных для графиков сессии ${session.id}`);
            }
        });
    }, 100);
}

// Форматирование даты
function formatDate(dateString) {
    const date = new Date(dateString);
    const months = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Получение статуса благополучия
function getWellbeingStatus(value) {
    if (value >= 85) return { color: '#2ED47A', text: 'Отлично' };
    if (value >= 70) return { color: '#FFC107', text: 'Норма' };
    if (value >= 50) return { color: '#FFB946', text: 'Внимание' };
    return { color: '#FF5B5B', text: 'Критично' };
}

// Генерация меток времени
function generateTimeLabels(startTime, durationMins) {
    const labels = [];
    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    
    for (let i = 0; i <= durationMins; i++) {
        const totalMinutes = startMinutes + i;
        const h = Math.floor(totalMinutes / 60) % 24;
        const m = totalMinutes % 60;
        labels.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
    
    return labels;
}

// Создание HTML для сессии
function createSessionElement(session, index) {
    const wellbeingStatus = getWellbeingStatus(session.avgFwbs);
    const formattedDate = formatDate(session.date);
    
    return `
        <div class="history-session-block" data-id="${session.id}" data-date="${session.date}">
            <!-- Шапка блока -->
            <div class="history-session-header">
                <div class="history-session-info">
                    <h3 class="history-session-date">${formattedDate}</h3>
                    <div class="history-session-time">
                        <span>Время записи: ${session.startTime} - ${session.endTime}</span>
                        <span class="history-session-separator">•</span>
                        <span>Длительность: ${session.durationMins} мин</span>
                    </div>
                </div>
                <div class="history-session-badges">
                    <div class="session-badge session-badge--fischer">
                        <span class="session-badge-label">Фишер</span>
                        <span class="session-badge-value">${session.fischerScore}/10</span>
                    </div>
                    <div class="session-badge session-badge--wellbeing" style="--wb-color: ${wellbeingStatus.color}">
                        <span class="session-badge-label">Индекс</span>
                        <span class="session-badge-value">${session.avgFwbs}</span>
                        <span class="session-badge-status">${wellbeingStatus.text}</span>
                    </div>
                </div>
            </div>
            
            <!-- График КТГ -->
            <section class="history-ktg card">
                <div class="ktg">
                    <!-- FHR Chart (Top) -->
                    <div class="ktg__chart-group">
                        <div class="ktg__chart-label">
                            <span class="ktg__chart-title">ЧСС</span>
                            <span class="ktg__chart-units">уд/мин</span>
                        </div>
                        <div class="ktg__chart-container ktg__chart-container--fhr">
                            <canvas id="history-fhr-${index}"></canvas>
                        </div>
                    </div>
                    
                    <!-- UA Chart (Bottom) -->
                    <div class="ktg__chart-group">
                        <div class="ktg__chart-label">
                            <span class="ktg__chart-title">СДМ</span>
                            <span class="ktg__chart-units">отн.ед</span>
                        </div>
                        <div class="ktg__chart-container ktg__chart-container--ua">
                            <canvas id="history-ua-${index}"></canvas>
                        </div>
                    </div>
                    
                    <!-- Timeline Controls -->
                    <div class="ktg__timeline">
                        <div class="ktg__time-start">
                            <span>НАЧАЛО</span>
                            <span id="startTime-${index}">${session.startTime}</span>
                        </div>
                        <div class="ktg__scrubber" id="scrubber-${index}">
                            <div class="ktg__scrubber-track"></div>
                            <div class="ktg__scrubber-handle" id="scrubberHandle-${index}">
                                <div class="ktg__scrubber-time" id="currentTime-${index}">${session.startTime.substring(0, 5)}</div>
                            </div>
                        </div>
                        <div class="ktg__time-end">
                            <span>КОНЕЦ</span>
                            <span id="endTime-${index}">${session.endTime}</span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `;
}

// Класс для управления скраббером
class HistoryScrubber {
    constructor(sessionIndex, sessionData, durationMins, startTime) {
        this.sessionIndex = sessionIndex;
        this.sessionData = sessionData;
        this.duration = durationMins;
        this.startTime = startTime;
        this.currentPosition = 0;
        this.windowSize = 30; // Окно в 30 минут
        this.isDragging = false;
        this.timeLabels = historyCharts[`timeLabels-${sessionIndex}`];
        
        this.initElements();
        this.initEventListeners();
        this.updateView(0);
    }
    
    initElements() {
        this.scrubber = document.getElementById(`scrubber-${this.sessionIndex}`);
        this.scrubberHandle = document.getElementById(`scrubberHandle-${this.sessionIndex}`);
        this.currentTimeEl = document.getElementById(`currentTime-${this.sessionIndex}`);
    }
    
    initEventListeners() {
        if (!this.scrubberHandle || !this.scrubber) return;
        
        this.scrubberHandle.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        this.scrubberHandle.addEventListener('touchstart', this.handleTouchStart.bind(this));
        document.addEventListener('touchmove', this.handleTouchMove.bind(this));
        document.addEventListener('touchend', this.handleTouchEnd.bind(this));
        
        this.scrubber.addEventListener('click', this.handleTrackClick.bind(this));
    }
    
    handleMouseDown(e) {
        e.preventDefault();
        this.isDragging = true;
        this.scrubberHandle.style.cursor = 'grabbing';
    }
    
    handleMouseMove(e) {
        if (!this.isDragging) return;
        this.updatePositionFromEvent(e.clientX);
    }
    
    handleMouseUp() {
        this.isDragging = false;
        if (this.scrubberHandle) {
            this.scrubberHandle.style.cursor = 'grab';
        }
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        this.isDragging = true;
    }
    
    handleTouchMove(e) {
        if (!this.isDragging) return;
        const touch = e.touches[0];
        this.updatePositionFromEvent(touch.clientX);
    }
    
    handleTouchEnd() {
        this.isDragging = false;
    }
    
    handleTrackClick(e) {
        if (e.target === this.scrubberHandle || e.target.parentElement === this.scrubberHandle) return;
        this.updatePositionFromEvent(e.clientX);
    }
    
    updatePositionFromEvent(clientX) {
        const rect = this.scrubber.getBoundingClientRect();
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        
        this.currentPosition = percentage * this.duration;
        this.updateView(this.currentPosition);
    }
    
    updateView(position) {
        const percentage = position / this.duration;
        
        // Обновляем позицию ползунка
        this.scrubberHandle.style.left = `${percentage * 100}%`;
        
        // Показываем реальное время вместо минут от начала
        const currentMinuteIndex = Math.floor(position);
        if (this.timeLabels && this.timeLabels[currentMinuteIndex]) {
            this.currentTimeEl.textContent = this.timeLabels[currentMinuteIndex];
        }
        
        // Обновляем графики
        this.updateCharts(position);
    }
    
    updateCharts(centerMinute) {
        // Определяем окно просмотра
        const halfWindow = this.windowSize / 2;
        const startMin = Math.max(0, centerMinute - halfWindow);
        const endMin = Math.min(this.duration, startMin + this.windowSize);
        
        // Получаем окно данных
        const pointsPerMinute = Math.ceil(this.sessionData.labels.length / this.duration);
        const startIndex = Math.floor(startMin * pointsPerMinute);
        const endIndex = Math.ceil(endMin * pointsPerMinute);
        
        const windowLabels = this.sessionData.labels.slice(startIndex, endIndex);
        const windowFHR = this.sessionData.fhr.slice(startIndex, endIndex);
        const windowUA = this.sessionData.ua.slice(startIndex, endIndex);
        
        // Обновляем график ЧСС
        if (historyCharts[`fhr-${this.sessionIndex}`]) {
            const fhrChart = historyCharts[`fhr-${this.sessionIndex}`];
            fhrChart.data.labels = windowLabels;
            fhrChart.data.datasets[0].data = windowFHR;
            fhrChart.options.scales.x.min = startMin;
            fhrChart.options.scales.x.max = endMin;
            fhrChart.update('none');
        }
        
        // Обновляем график СДМ
        if (historyCharts[`ua-${this.sessionIndex}`]) {
            const uaChart = historyCharts[`ua-${this.sessionIndex}`];
            uaChart.data.labels = windowLabels;
            uaChart.data.datasets[0].data = windowUA;
            uaChart.options.scales.x.min = startMin;
            uaChart.options.scales.x.max = endMin;
            uaChart.update('none');
        }
    }
}

// Создание графиков для сессии
function createHistoryCharts(session, index) {
    // Генерируем метки времени для всей записи
    const timeLabels = generateTimeLabels(session.startTime, session.durationMins);
    
    // Начальное окно данных (первые 30 минут или вся запись если меньше)
    const windowSize = Math.min(30, session.durationMins);
    const dataPointsPerMinute = Math.max(1, Math.floor(session.data.labels.length / session.durationMins));
    const endIndex = Math.min(windowSize * dataPointsPerMinute, session.data.labels.length);
    
    // FHR Chart с фиксированными метками времени
    const fhrCtx = document.getElementById(`history-fhr-${index}`);
    if (fhrCtx) {
        historyCharts[`fhr-${index}`] = new Chart(fhrCtx, {
            type: 'line',
            data: {
                labels: session.data.labels.slice(0, endIndex),
                datasets: [{
                    label: 'ЧСС',
                    data: session.data.fhr.slice(0, endIndex),
                    borderColor: '#FF1744',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    tension: 0.15,
                    clip: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 10,
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
                        min: 0,
                        max: windowSize,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            lineWidth: 1,
                            drawTicks: false
                        },
                        border: {
                            display: false
                        },
                        ticks: {
                            display: false
                        }
                    },
                    y: {
                        min: 50,
                        max: 210,
                        position: 'right',
                        grid: {
                            color: function(context) {
                                if (context.tick.value % 30 === 0) {
                                    return 'rgba(0, 0, 0, 0.1)';
                                }
                                return 'rgba(0, 0, 0, 0.03)';
                            },
                            lineWidth: function(context) {
                                if (context.tick.value % 30 === 0) {
                                    return 1;
                                }
                                return 0.5;
                            }
                        },
                        border: {
                            display: false
                        },
                        ticks: {
                            stepSize: 10,
                            font: {
                                family: 'Manrope',
                                size: 10,
                                weight: '600'
                            },
                            color: '#666',
                            padding: 5,
                            callback: function(value) {
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
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        titleColor: '#333',
                        bodyColor: '#666',
                        borderColor: '#ddd',
                        borderWidth: 1,
                        padding: 8,
                        displayColors: false,
                        callbacks: {
                            title: function(context) {
                                const minuteIndex = Math.floor(context[0].parsed.x);
                                if (timeLabels[minuteIndex]) {
                                    return 'Время: ' + timeLabels[minuteIndex];
                                }
                                return '';
                            },
                            label: function(context) {
                                return 'ЧСС: ' + Math.round(context.parsed.y) + ' уд/мин';
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            lowerNormal: {
                                type: 'line',
                                yMin: 110,
                                yMax: 110,
                                borderColor: 'rgba(255, 0, 0, 0.3)',
                                borderWidth: 1,
                                borderDash: [5, 5]
                            },
                            upperNormal: {
                                type: 'line',
                                yMin: 170,
                                yMax: 170,
                                borderColor: 'rgba(255, 0, 0, 0.3)',
                                borderWidth: 1,
                                borderDash: [5, 5]
                            },
                            normalZone: {
                                type: 'box',
                                yMin: 110,
                                yMax: 170,
                                backgroundColor: 'rgba(0, 255, 0, 0.02)',
                                borderWidth: 0
                            }
                        }
                    }
                },
                animation: {
                    duration: 0
                }
            }
        });
    }
    
    // UA Chart с метками времени
    const uaCtx = document.getElementById(`history-ua-${index}`);
    if (uaCtx) {
        historyCharts[`ua-${index}`] = new Chart(uaCtx, {
            type: 'line',
            data: {
                labels: session.data.labels.slice(0, endIndex),
                datasets: [{
                    label: 'СДМ',
                    data: session.data.ua.slice(0, endIndex),
                    borderColor: '#0D47A1',
                    backgroundColor: 'rgba(13, 71, 161, 0.05)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    tension: 0.15,
                    fill: true,
                    clip: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 10,
                        right: 10,
                        top: 0,
                        bottom: 10
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: 0,
                        max: windowSize,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            lineWidth: 1,
                            drawTicks: true
                        },
                        border: {
                            display: false
                        },
                        ticks: {
                            stepSize: 5,
                            font: {
                                family: 'Manrope',
                                size: 11,
                                weight: '600'
                            },
                            color: '#666',
                            padding: 8,
                            callback: function(value, index) {
                                const minuteIndex = Math.floor(value);
                                if (minuteIndex % 5 === 0 && timeLabels[minuteIndex]) {
                                    return timeLabels[minuteIndex];
                                }
                                return '';
                            }
                        }
                    },
                    y: {
                        min: 0,
                        max: 100,
                        position: 'right',
                        grid: {
                            color: function(context) {
                                if (context.tick.value % 25 === 0) {
                                    return 'rgba(0, 0, 0, 0.1)';
                                }
                                if (context.tick.value % 10 === 0) {
                                    return 'rgba(0, 0, 0, 0.03)';
                                }
                                return 'transparent';
                            },
                            lineWidth: function(context) {
                                if (context.tick.value % 25 === 0) {
                                    return 1;
                                }
                                return 0.5;
                            }
                        },
                        border: {
                            display: false
                        },
                        ticks: {
                            stepSize: 10,
                            font: {
                                family: 'Manrope',
                                size: 10,
                                weight: '600'
                            },
                            color: '#666',
                            padding: 5,
                            callback: function(value) {
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
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        titleColor: '#333',
                        bodyColor: '#666',
                        borderColor: '#ddd',
                        borderWidth: 1,
                        padding: 8,
                        displayColors: false,
                        callbacks: {
                            title: function(context) {
                                const minuteIndex = Math.floor(context[0].parsed.x);
                                if (timeLabels[minuteIndex]) {
                                    return 'Время: ' + timeLabels[minuteIndex];
                                }
                                return '';
                            },
                            label: function(context) {
                                return 'СДМ: ' + Math.round(context.parsed.y) + ' отн.ед';
                            }
                        }
                    }
                },
                animation: {
                    duration: 0
                }
            }
        });
    }
    
    // Сохраняем метки времени для использования в скраббере
    historyCharts[`timeLabels-${index}`] = timeLabels;
}

// Добавляем стили для индикатора загрузки и ошибок
const style = document.createElement('style');
style.textContent = `
    .loading-message, .error-message, .no-records {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        text-align: center;
        color: #666;
        font-family: 'Manrope', sans-serif;
    }
    
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #007BFF;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 20px;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .error-details {
        font-size: 12px;
        color: #999;
        margin-top: 10px;
    }
    
    .retry-button {
        margin-top: 20px;
        padding: 10px 20px;
        background: #007BFF;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-family: 'Manrope', sans-serif;
        font-weight: 600;
        transition: background 0.3s;
    }
    
    .retry-button:hover {
        background: #0056b3;
    }
`;
document.head.appendChild(style);

// Запуск при загрузке страницы
document.addEventListener('DOMContentLoaded', fetchAndRenderHistory);