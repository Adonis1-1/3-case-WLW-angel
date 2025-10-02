/**
 * Main application logic for dual-chart CTG display
 */

class KTGDashboard {
    constructor() {
        this.fullData = null;
        this.currentPosition = 0;
        this.isDragging = false;
        this.scrubber = null;
        this.scrubberHandle = null;
        this.scrubberTrack = null;
        this.activeEventIndex = null;
        
        // РЕАЛЬНОЕ ВРЕМЯ - новые настройки
        this.isRealTimeMode = true;
        this.realTimeData = {
            labels: [],
            fhr: [],
            ua: [],
            timestamps: []
        };
        this.maxDataPoints = 1800; 
        this.startTime = Date.now();
        this.autoUpdateInterval = null;
        this.lastDataTime = 0;
        
        // НАСТРОЙКИ ОТОБРАЖЕНИЯ
        this.windowSize = 30; // минут отображаемых на экране
        this.totalDuration = 60; // минут всего данных в памяти
        this.dataPointInterval = 0; // интервал между точками данных (в секундах)
        
        this.init();
    }

    init() {
        console.log('Initializing Real-time CTG Dashboard...');
        
        // Инициализируем WebSocket
        this.setupWebSocket();
        
        // Инициализируем UI компоненты
        this.initializeCharts();
        this.initializeEvents();
        this.initializeScrubber();
        
        // Устанавливаем начальное представление
        this.updateView();
        
        // Запускаем автообновление
        this.startAutoUpdate();
    }

    setupWebSocket() {
        this.socket = new WebSocket('ws://localhost:8000/ws');
        
        this.socket.onopen = () => {
            console.log('✅ WebSocket connected');
            this.updateConnectionStatus(true);
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('WebSocket message type:', message.type);
                
                // Обрабатываем разные типы сообщений с помощью switch
                switch (message.type) {
                    case 'ctg_data':
                        this.handleCTGData(message.data);
                        break;
                        
                    case 'prediction':
                        this.handlePredictionUpdate(message.data);
                        break;
                        
                    case 'patient_info_updated':
                        this.handlePatientInfoUpdate(message);
                        break;
                        
                    case 'welcome':
                        console.log('Welcome message:', message.message);
                        break;
                        
                    case 'status':
                        console.log('Status update:', message);
                        break;
                        
                    case 'alert':
                        this.handleAlert(message);
                        break;
                        
                    case 'session_ended':
                    case 'new_session_started':
                        this.handleSessionChange(message);
                        break;
                    
                    // НОВЫЙ CASE ДЛЯ ОБРАБОТКИ БЫСТРЫХ СОБЫТИЙ
                    case 'short_term_alert':
                        this.handleShortTermAlert(message);
                        break;
                        
                    default:
                        console.log('Unknown message type:', message.type, message);
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        this.socket.onclose = () => {
            console.log('❌ WebSocket disconnected');
            this.updateConnectionStatus(false);
            // Пытаемся переподключиться через 3 секунды
            setTimeout(() => this.setupWebSocket(), 3000);
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus(false);
        };
    }

    handleCTGData(data) {
        const currentTime = Date.now();
        const elapsedMinutes = (currentTime - this.startTime) / 60000;
        
        // Проверяем интервал между точками
        if ((currentTime - this.lastDataTime) < this.dataPointInterval * 1000) {
            return; // Пропускаем точку если не прошло 10 секунд
        }
        
        // Извлекаем значения из данных
        const fhrValue = parseFloat(data.bpm_value || (data.bpm && data.bpm[1]) || 140);
        const uaValue = parseFloat(data.uterus_value || (data.uterus && data.uterus[0]) || 0);
        
        // ДОБАВЛЕНО: Фильтрация аномальных значений ЧСС
        if (fhrValue < 50 || fhrValue > 210) {
            console.warn(`Anomalous FHR value detected: ${fhrValue}, skipping data point`);
            return; // Пропускаем аномальные значения
        }
        
        // Добавляем валидные данные
        this.realTimeData.labels.push(elapsedMinutes);
        this.realTimeData.fhr.push(fhrValue);
        this.realTimeData.ua.push(uaValue);
        this.realTimeData.timestamps.push(new Date(currentTime));
        
        this.lastDataTime = currentTime;

        // Ограничиваем количество точек (скользящее окно)
        if (this.realTimeData.labels.length > this.maxDataPoints) {
            this.realTimeData.labels.shift();
            this.realTimeData.fhr.shift();
            this.realTimeData.ua.shift();
            this.realTimeData.timestamps.shift();
        }
        
        console.log(`Added data point: ${elapsedMinutes.toFixed(1)}min, FHR: ${fhrValue}, UA: ${uaValue}`);
    }

    async handlePredictionUpdate(data) {
        console.log('Prediction update received:', data);
        
        // Обновляем индекс благополучия
        if (data.fetal_wellbeing_index !== undefined) {
            const wellbeingIndex = Math.round(data.fetal_wellbeing_index);
            console.log(`Updating wellbeing index to: ${wellbeingIndex}`);
            
            // Обновляем круговой график благополучия
            if (ChartManager && ChartManager.createWellbeingChart) {
                ChartManager.createWellbeingChart('wellbeingChart', wellbeingIndex);
            }
            
            // Обновляем текстовое значение если есть элемент
            const wellbeingText = document.querySelector('.wellbeing__value');
            if (wellbeingText) {
                wellbeingText.textContent = wellbeingIndex;
            }
        }
        
        // Обновляем список событий если есть detected_patterns
        if (data.detected_patterns && Array.isArray(data.detected_patterns)) {
            this.updateEventsList(data.detected_patterns);
        }
        
        // Обновляем уровень риска если есть
        if (data.risk_level) {
            this.updateRiskLevel(data.risk_level);
        }
        
        // Обновляем рекомендации если есть
        if (data.recommendations && Array.isArray(data.recommendations)) {
            this.updateRecommendations(data.recommendations);
        }
    }

    handleShortTermAlert(message) {
        console.log('📊 Short-term alert received:', message);
        
        // Проверяем наличие данных
        if (!message.data) {
            console.warn('Short-term alert has no data');
            return;
        }
        
        const data = message.data;
        
        // Обновляем список событий если есть обнаруженные паттерны
        if (data.decelerations) {
            // Преобразуем данные о децелерациях в формат паттернов для отображения
            const patterns = [];
            
            if (data.decelerations.total > 0) {
                patterns.push({
                    type: 'deceleration',
                    name: 'Децелерация',
                    severity: data.priority === 'CRITICAL' ? 'high' : 'moderate',
                    detected_at: new Date().toISOString(),
                    detected_at_readable: new Date().toLocaleTimeString('ru-RU'),
                    description: `Обнаружено децелераций: ${data.decelerations.total}`,
                    count: data.decelerations.total
                });
            }
            
            if (data.decelerations.deep > 0) {
                patterns.push({
                    type: 'deep_deceleration',
                    name: 'Глубокая децелерация',
                    severity: 'high',
                    detected_at: new Date().toISOString(),
                    detected_at_readable: new Date().toLocaleTimeString('ru-RU'),
                    description: `Глубоких децелераций: ${data.decelerations.deep}`,
                    count: data.decelerations.deep
                });
            }
            
            if (data.decelerations.prolonged > 0) {
                patterns.push({
                    type: 'prolonged_deceleration',
                    name: 'Пролонгированная децелерация',
                    severity: 'critical',
                    detected_at: new Date().toISOString(),
                    detected_at_readable: new Date().toLocaleTimeString('ru-RU'),
                    description: `Пролонгированных: ${data.decelerations.prolonged}`,
                    count: data.decelerations.prolonged
                });
            }
            
            // Обновляем список событий
            if (patterns.length > 0) {
                this.updateEventsList(patterns);
            }
        }
        
        // Показываем специальное уведомление если обнаружены критические события
        if (data.priority === 'CRITICAL' || data.priority === 'URGENT') {
            this.showAlert({
                type: 'deceleration',
                severity: data.priority.toLowerCase(),
                title: 'Обнаружена децелерация!',
                message: this.getAlertMessage(data),
                autoClose: false,
                sound: true
            });
        } else if (data.priority === 'WARNING') {
            this.showAlert({
                type: 'deceleration',
                severity: 'warning',
                title: 'Внимание',
                message: this.getAlertMessage(data),
                autoClose: true,
                sound: false
            });
        }
        
        // Обновляем индикатор риска если есть
        if (data.risk_level) {
            this.updateRiskLevel(data.risk_level.toLowerCase());
        }
        
        // Обновляем метрики если есть
        if (data.features) {
            this.updateQuickMetrics(data.features);
        }
    }

    getAlertMessage(data) {
        const messages = [];
        
        if (data.decelerations) {
            if (data.decelerations.prolonged > 0) {
                messages.push(`Пролонгированных децелераций: ${data.decelerations.prolonged}`);
            }
            if (data.decelerations.deep > 0) {
                messages.push(`Глубоких децелераций: ${data.decelerations.deep}`);
            }
            if (data.decelerations.total > 0 && messages.length === 0) {
                messages.push(`Всего децелераций: ${data.decelerations.total}`);
            }
        }
        
        if (data.features) {
            if (data.features.baseline_bpm < 110 || data.features.baseline_bpm > 160) {
                messages.push(`Базальный ритм: ${data.features.baseline_bpm.toFixed(0)} уд/мин`);
            }
            if (data.features.variability < 5) {
                messages.push(`Низкая вариабельность: ${data.features.variability.toFixed(1)}`);
            }
        }
        
        return messages.length > 0 ? messages.join('. ') : 'Требуется внимание медицинского персонала';
    }

    showAlert(options) {
        const {
            type = 'info',
            severity = 'info',
            title = 'Уведомление',
            message = '',
            autoClose = true,
            sound = false
        } = options;
        
        // Определяем стили в зависимости от серьезности
        const severityStyles = {
            critical: {
                background: 'linear-gradient(135deg, #FF0000, #CC0000)',
                icon: '⚠️',
                animation: 'shake 0.5s, pulse 2s infinite'
            },
            urgent: {
                background: 'linear-gradient(135deg, #FF4444, #CC0000)',
                icon: '⚠️',
                animation: 'slideInRight 0.3s, pulse 2s infinite'
            },
            high: {
                background: 'linear-gradient(135deg, #FF5B5B, #FF3333)',
                icon: '⚠',
                animation: 'slideInRight 0.3s'
            },
            warning: {
                background: 'linear-gradient(135deg, #FFA500, #FF8C00)',
                icon: '⚡',
                animation: 'slideInRight 0.3s'
            },
            info: {
                background: 'linear-gradient(135deg, #2196F3, #1976D2)',
                icon: 'ℹ',
                animation: 'slideInRight 0.3s'
            }
        };
        
        const style = severityStyles[severity] || severityStyles.info;
        
        // Создаем элемент уведомления
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${severity} alert-${type}`;
        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 20px 25px;
            background: ${style.background};
            color: white;
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: ${style.animation};
            max-width: 450px;
            min-width: 300px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: pointer;
        `;
        
        alertDiv.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 15px;">
                <span style="font-size: 28px; line-height: 1;">${style.icon}</span>
                <div style="flex: 1;">
                    <strong style="font-size: 16px; display: block; margin-bottom: 8px;">
                        ${title}
                    </strong>
                    <div style="font-size: 14px; line-height: 1.5; opacity: 0.95;">
                        ${message}
                    </div>
                    <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">
                        ${new Date().toLocaleTimeString('ru-RU')}
                    </div>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: none;
                    border: none;
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                    opacity: 0.8;
                    transition: opacity 0.2s;
                    padding: 0;
                    margin: -5px -5px 0 0;
                    line-height: 1;
                " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">
                    ×
                </button>
            </div>
        `;
        
        // Добавляем стили анимаций если их еще нет
        if (!document.getElementById('alertAnimations')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'alertAnimations';
            styleSheet.textContent = `
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                    20%, 40%, 60%, 80% { transform: translateX(5px); }
                }
                @keyframes pulse {
                    0%, 100% { box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
                    50% { box-shadow: 0 8px 32px rgba(255,0,0,0.5); }
                }
                @keyframes fadeOut {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(100%); }
                }
            `;
            document.head.appendChild(styleSheet);
        }
        
        // Воспроизводим звук для критических уведомлений
        if (sound && (severity === 'critical' || severity === 'urgent')) {
            this.playAlertSound();
        }
        
        // Добавляем уведомление на страницу
        document.body.appendChild(alertDiv);
        
        // Удаляем по клику
        alertDiv.addEventListener('click', () => {
            alertDiv.style.animation = 'fadeOut 0.3s';
            setTimeout(() => alertDiv.remove(), 300);
        });
        
        // Автоматическое удаление
        if (autoClose) {
            const timeout = severity === 'critical' ? 30000 : 
                           severity === 'urgent' ? 20000 : 
                           severity === 'high' ? 15000 : 10000;
            
            setTimeout(() => {
                if (alertDiv.parentElement) {
                    alertDiv.style.animation = 'fadeOut 0.3s';
                    setTimeout(() => alertDiv.remove(), 300);
                }
            }, timeout);
        }
        
        // Логируем для отладки
        console.log(`Alert shown: ${severity} - ${title}: ${message}`);
    }

    playAlertSound() {
        // Создаем звуковой сигнал используя Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Настройки звука
            oscillator.frequency.value = 800; // Частота звука в Гц
            oscillator.type = 'sine'; // Тип волны
            
            // Настройка громкости с плавным затуханием
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            // Воспроизведение звука
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
            
            console.log('Alert sound played');
        } catch (error) {
            console.log('Could not play alert sound:', error);
            // Альтернативный метод через Audio API
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS48OScTgwMVXqhrxG1lwAAA7sksu07BwgMN4kAANnEiYBAQA==');
                audio.volume = 0.5;
                audio.play();
            } catch (audioError) {
                console.log('Alternative audio method also failed:', audioError);
            }
        }
    }

    updateQuickMetrics(features) {
        console.log('Updating quick metrics:', features);
        
        // Обновляем базальный ритм
        if (features.baseline_bpm !== undefined) {
            // Пробуем найти элемент разными способами
            let baselineEl = document.querySelector('[data-metric="baseline"]');
            if (!baselineEl) {
                baselineEl = document.querySelector('.metric-baseline');
            }
            if (!baselineEl) {
                // Попытка найти в статистике
                const statsItems = document.querySelectorAll('.stat__value');
                if (statsItems.length > 0) {
                    baselineEl = statsItems[0];
                }
            }
            if (baselineEl) {
                baselineEl.textContent = `${features.baseline_bpm.toFixed(0)} уд/мин`;
                // Добавляем визуальную индикацию
                baselineEl.style.animation = 'pulse 0.5s';
                setTimeout(() => {
                    baselineEl.style.animation = '';
                }, 500);
            }
        }
        
        // Обновляем вариабельность
        if (features.variability !== undefined) {
            let variabilityEl = document.querySelector('[data-metric="variability"]');
            if (!variabilityEl) {
                variabilityEl = document.querySelector('.metric-variability');
            }
            if (!variabilityEl) {
                const statsItems = document.querySelectorAll('.stat__value');
                if (statsItems.length > 1) {
                    variabilityEl = statsItems[1];
                }
            }
            if (variabilityEl) {
                variabilityEl.textContent = `${features.variability.toFixed(1)}`;
                variabilityEl.style.animation = 'pulse 0.5s';
                setTimeout(() => {
                    variabilityEl.style.animation = '';
                }, 500);
            }
        }
        
        // Обновляем счетчики акселераций
        if (features.accelerations !== undefined) {
            let accelEl = document.querySelector('[data-metric="accelerations"]');
            if (!accelEl) {
                accelEl = document.querySelector('.metric-accelerations');
            }
            if (!accelEl) {
                const statsItems = document.querySelectorAll('.stat__value');
                if (statsItems.length > 2) {
                    accelEl = statsItems[2];
                }
            }
            if (accelEl) {
                accelEl.textContent = features.accelerations;
                accelEl.style.animation = 'pulse 0.5s';
                setTimeout(() => {
                    accelEl.style.animation = '';
                }, 500);
            }
        }
        
        // Добавляем CSS для анимации pulse если его еще нет
        if (!document.getElementById('pulseAnimation')) {
            const style = document.createElement('style');
            style.id = 'pulseAnimation';
            style.textContent = `
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); background-color: rgba(255, 193, 7, 0.1); }
                    100% { transform: scale(1); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    updateEventsList(patterns) {
        const eventsList = document.getElementById('eventsList');
        if (!eventsList) {
            console.warn('Events list element not found');
            return;
        }
        
        // Максимальное количество событий в списке
        const MAX_EVENTS = 20;
        
        // Если массив пуст и список пуст, показываем placeholder
        if ((!patterns || patterns.length === 0) && eventsList.children.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'events__placeholder';
            placeholder.textContent = 'Нет обнаруженных событий';
            eventsList.appendChild(placeholder);
            return;
        }
        
        // Удаляем placeholder если он есть
        const placeholder = eventsList.querySelector('.events__placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        // Создаем Set для отслеживания уже добавленных событий (для избежания дубликатов)
        const existingEvents = new Set();
        const existingItems = eventsList.querySelectorAll('.events__item');
        existingItems.forEach(item => {
            const eventId = item.dataset.eventId;
            if (eventId) {
                existingEvents.add(eventId);
            }
        });
        
        // Перебираем новые паттерны и добавляем только уникальные
        patterns.forEach((pattern, index) => {
            // Создаем уникальный ID для события
            const eventId = `${pattern.name}_${pattern.start_time || pattern.detected_at || index}_${pattern.end_time || ''}`;
            
            // Пропускаем если событие уже есть в списке
            if (existingEvents.has(eventId)) {
                return;
            }
            
            const eventItem = document.createElement('div');
            eventItem.className = 'events__item';
            eventItem.dataset.eventId = eventId; // Сохраняем ID для отслеживания
            
            // Определяем тип события и добавляем соответствующий класс
            if (pattern.type === 'acceleration' || pattern.name?.toLowerCase().includes('акцелерация')) {
                eventItem.classList.add('events__item--acceleration');
            } else if (pattern.type === 'deceleration' || pattern.type === 'deep_deceleration' || 
                       pattern.type === 'prolonged_deceleration' || pattern.name?.toLowerCase().includes('децелерация')) {
                eventItem.classList.add('events__item--deceleration');
            } else if (pattern.type === 'contraction' || pattern.name?.toLowerCase().includes('схватка')) {
                eventItem.classList.add('events__item--contraction');
            } else if (pattern.type === 'variability' || pattern.name?.toLowerCase().includes('вариабельность')) {
                eventItem.classList.add('events__item--variability');
            }
            
            // Создаем содержимое события
            const eventContent = document.createElement('div');
            eventContent.className = 'events__item-content';
            
            // Название события
            const eventName = document.createElement('div');
            eventName.className = 'events__item-name';
            eventName.textContent = pattern.name || pattern.type || 'Событие';
            
            // Время события - используем различные поля в порядке приоритета
            const eventTime = document.createElement('div');
            eventTime.className = 'events__item-time';
            
            // Форматируем время в зависимости от доступных данных
            let timeText = '';
            if (pattern.detected_at_readable) {
                // Если есть читаемое время обнаружения
                timeText = pattern.detected_at_readable;
            } else if (pattern.time_range) {
                // Если есть временной диапазон
                timeText = pattern.time_range;
            } else if (pattern.start_time !== undefined && pattern.end_time !== undefined) {
                // Если есть начало и конец
                const startMin = Math.round(pattern.start_time);
                const endMin = Math.round(pattern.end_time);
                timeText = `${startMin}-${endMin} мин`;
            } else if (pattern.start_time !== undefined) {
                // Если есть только начало
                timeText = `${Math.round(pattern.start_time)} мин`;
            } else if (pattern.detected_at) {
                // Если есть timestamp обнаружения
                const date = new Date(pattern.detected_at);
                timeText = date.toLocaleTimeString('ru-RU', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit' 
                });
            } else {
                // Fallback к индексу
                timeText = `Событие ${index + 1}`;
            }
            
            eventTime.textContent = timeText;
            
            eventContent.appendChild(eventName);
            eventContent.appendChild(eventTime);
            
            // Добавляем описание если есть
            if (pattern.description) {
                const eventDesc = document.createElement('div');
                eventDesc.className = 'events__item-description';
                eventDesc.textContent = pattern.description;
                eventContent.appendChild(eventDesc);
            }
            
            // Добавляем дополнительные детали если есть
            if (pattern.severity || pattern.confidence) {
                const eventMeta = document.createElement('div');
                eventMeta.className = 'events__item-meta';
                
                if (pattern.severity) {
                    const severitySpan = document.createElement('span');
                    severitySpan.className = `severity severity-${pattern.severity}`;
                    severitySpan.textContent = pattern.severity;
                    eventMeta.appendChild(severitySpan);
                }
                
                if (pattern.confidence) {
                    const confidenceSpan = document.createElement('span');
                    confidenceSpan.className = 'confidence';
                    confidenceSpan.textContent = `${Math.round(pattern.confidence * 100)}%`;
                    eventMeta.appendChild(confidenceSpan);
                }
                
                eventContent.appendChild(eventMeta);
            }
            
            eventItem.appendChild(eventContent);
            
            // Добавляем анимацию появления
            eventItem.style.animation = 'slideInRight 0.3s ease';
            
            // Добавляем обработчик клика для навигации к событию
            eventItem.addEventListener('click', () => {
                console.log('Event clicked:', pattern);
                
                // Убираем активный класс с других событий
                eventsList.querySelectorAll('.events__item').forEach(item => {
                    item.classList.remove('events__item--active');
                });
                
                // Добавляем активный класс на текущее событие
                eventItem.classList.add('events__item--active');
                
                // Если есть время события, можно навигировать к нему на графике
                if (pattern.start_time !== undefined) {
                    // Навигация к моменту события на графике
                    if (window.dashboard && !window.dashboard.isRealTimeMode) {
                        window.dashboard.currentPosition = pattern.start_time;
                        window.dashboard.updateView();
                    }
                }
            });
            
            // Добавляем новое событие в начало списка (prepend)
            eventsList.prepend(eventItem);
            
            // Отмечаем событие как добавленное
            existingEvents.add(eventId);
        });
        
        // Ограничиваем количество событий в списке
        const allEvents = eventsList.querySelectorAll('.events__item');
        if (allEvents.length > MAX_EVENTS) {
            // Удаляем самые старые события (последние в списке)
            for (let i = MAX_EVENTS; i < allEvents.length; i++) {
                allEvents[i].style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => {
                    if (allEvents[i] && allEvents[i].parentElement) {
                        allEvents[i].remove();
                    }
                }, 300);
            }
        }
        
        console.log(`Updated events list: added ${patterns.length} new patterns, total events: ${Math.min(allEvents.length, MAX_EVENTS)}`);
    }

    handlePatientInfoUpdate(message) {
        console.log('Patient info update:', message);
        
        // Обновляем ФИО пациента
        if (message.name) {
            const nameElements = document.querySelectorAll('.patient-info__value');
            if (nameElements.length > 0) {
                nameElements[0].textContent = message.name;
            }
            
            // Также обновляем в заголовке если есть
            const headerName = document.querySelector('.dashboard__patient-name');
            if (headerName) {
                headerName.textContent = message.name;
            }
        }
        
        // Обновляем срок беременности
        if (message.week !== undefined && message.week !== null) {
            const weekElements = document.querySelectorAll('.patient-info__value');
            if (weekElements.length > 1) {
                weekElements[1].textContent = `${message.week} недель`;
            }
            
            // Также обновляем в заголовке если есть
            const headerWeek = document.querySelector('.dashboard__patient-week');
            if (headerWeek) {
                headerWeek.textContent = `${message.week} недель`;
            }
        }
        
        // Сохраняем информацию о сессии
        if (message.session_id) {
            this.currentSessionId = message.session_id;
        }
    }

    updateRiskLevel(riskLevel) {
        // Создаем или обновляем индикатор уровня риска
        let riskIndicator = document.getElementById('riskIndicator');
        if (!riskIndicator) {
            // Создаем новый элемент если его нет
            const statsContainer = document.querySelector('.dashboard__stats') || 
                                 document.querySelector('.wellbeing');
            if (statsContainer) {
                riskIndicator = document.createElement('div');
                riskIndicator.id = 'riskIndicator';
                riskIndicator.className = 'risk-indicator';
                statsContainer.appendChild(riskIndicator);
            }
        }
        
        if (riskIndicator) {
            const riskLevels = {
                'low': { text: 'Низкий риск', color: '#2ED47A' },
                'normal': { text: 'Норма', color: '#2ED47A' },
                'medium': { text: 'Средний риск', color: '#FFA500' },
                'moderate': { text: 'Средний риск', color: '#FFA500' },
                'high': { text: 'Высокий риск', color: '#FF5B5B' },
                'critical': { text: 'Критический', color: '#FF0000' }
            };
            
            const level = riskLevels[riskLevel] || { text: riskLevel, color: '#666' };
            
            riskIndicator.innerHTML = `
                <span class="risk-indicator__label">Уровень риска:</span>
                <span class="risk-indicator__value" style="color: ${level.color}">
                    ${level.text}
                </span>
            `;
        }
    }

    updateRecommendations(recommendations) {
        // Находим или создаем блок рекомендаций
        let recsBlock = document.getElementById('recommendations');
        if (!recsBlock) {
            const sidebar = document.querySelector('.dashboard__sidebar');
            if (sidebar) {
                recsBlock = document.createElement('div');
                recsBlock.id = 'recommendations';
                recsBlock.className = 'recommendations';
                sidebar.appendChild(recsBlock);
            }
        }
        
        if (recsBlock && recommendations.length > 0) {
            recsBlock.innerHTML = `
                <h3 class="recommendations__title">Рекомендации</h3>
                <ul class="recommendations__list">
                    ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            `;
        }
    }

    handleAlert(message) {
        console.warn('Alert received:', message);
        
        // Создаем всплывающее уведомление
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${message.severity || 'info'}`;
        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${message.severity === 'high' ? '#FF5B5B' : '#FFA500'};
            color: white;
            border-radius: 8px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            max-width: 400px;
        `;
        alertDiv.innerHTML = `
            <strong>Внимание!</strong> ${message.message}
            <button onclick="this.parentElement.remove()" style="
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                float: right;
                margin-left: 10px;
            ">×</button>
        `;
        
        document.body.appendChild(alertDiv);
        
        // Автоматически удаляем через 10 секунд
        setTimeout(() => {
            if (alertDiv.parentElement) {
                alertDiv.remove();
            }
        }, 10000);
    }

    handleSessionChange(message) {
        console.log('Session change:', message);
        
        if (message.type === 'session_ended') {
            // Очищаем данные при завершении сессии
            this.realTimeData = {
                labels: [],
                fhr: [],
                ua: [],
                timestamps: []
            };
            this.startTime = Date.now();
            this.initializeEvents();
        }
    }

    updateConnectionStatus(connected) {
        // Создаем индикатор статуса если его нет
        let statusElement = document.getElementById('connectionStatus');
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = 'connectionStatus';
            statusElement.className = 'connection-status';
            statusElement.innerHTML = `
                <span class="status-indicator"></span>
                <span class="status-text">Connecting...</span>
            `;
            const header = document.querySelector('.dashboard__header');
            if (header) {
                header.appendChild(statusElement);
            }
        }

        const indicator = statusElement.querySelector('.status-indicator');
        const text = statusElement.querySelector('.status-text');
        
        if (connected) {
            indicator.className = 'status-indicator connected';
            text.textContent = 'Real-time Data';
            text.style.color = '#2ED47A';
        } else {
            indicator.className = 'status-indicator disconnected';
            text.textContent = 'Disconnected';
            text.style.color = '#FF5B5B';
        }
    }

    initializeCharts() {
        // Создаем график благополучия с начальным значением
        ChartManager.createWellbeingChart('wellbeingChart', 95);
        
        // Создаем начальные пустые графики
        const initialData = {
            labels: [0],
            fhr: [140],
            ua: [0],
            timestamps: [new Date()]
        };
        
        ChartManager.createFHRChart('fhrChart', initialData, this.windowSize);
        ChartManager.createUAChart('uaChart', initialData, this.windowSize);
    }

    initializeEvents() {
        const eventsList = document.getElementById('eventsList');
        if (eventsList) {
            eventsList.innerHTML = '';
            const placeholder = document.createElement('div');
            placeholder.className = 'events__placeholder';
            placeholder.textContent = 'События будут отображаться в реальном времени...';
            eventsList.appendChild(placeholder);
        }
    }

    initializeScrubber() {
        this.scrubber = document.getElementById('scrubber');
        this.scrubberHandle = document.getElementById('scrubberHandle');
        this.scrubberTrack = this.scrubber?.querySelector('.ktg__scrubber-track');
        
        if (this.scrubber && this.scrubberHandle) {
            this.setupScrubberInteractions();
        }
    }

    setupScrubberInteractions() {
        if (!this.scrubberHandle) return;
        
        this.scrubberHandle.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        
        this.scrubberHandle.addEventListener('touchstart', this.handleTouchStart.bind(this));
        document.addEventListener('touchmove', this.handleTouchMove.bind(this));
        document.addEventListener('touchend', this.handleTouchEnd.bind(this));
        
        if (this.scrubberTrack) {
            this.scrubberTrack.addEventListener('click', (e) => {
                if (this.isRealTimeMode) {
                    this.handleTrackClick(e);
                }
            });
        }
    }

    handleMouseDown(e) {
        e.preventDefault();
        this.isDragging = true;
        this.scrubberHandle.style.cursor = 'grabbing';
        this.wasAutoScrolling = this.isAutoScrolling;
        this.isAutoScrolling = false;
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;
        this.updatePositionFromEvent(e.clientX);
    }

    handleMouseUp() {
        this.isDragging = false;
        this.scrubberHandle.style.cursor = 'grab';
        if (this.isRealTimeMode) {
            const currentTime = (Date.now() - this.startTime) / 60000;
            const isAtEnd = this.currentPosition >= currentTime - 1;
            this.isAutoScrolling = isAtEnd;
        }
    }

    handleTouchStart(e) {
        e.preventDefault();
        this.isDragging = true;
        this.wasAutoScrolling = this.isAutoScrolling;
        this.isAutoScrolling = false;
    }

    handleTouchMove(e) {
        if (!this.isDragging) return;
        const touch = e.touches[0];
        this.updatePositionFromEvent(touch.clientX);
    }

    handleTouchEnd() {
        this.isDragging = false;
        if (this.isRealTimeMode) {
            const currentTime = (Date.now() - this.startTime) / 60000;
            const isAtEnd = this.currentPosition >= currentTime - 1;
            this.isAutoScrolling = isAtEnd;
        }
    }

    handleTrackClick(e) {
        const rect = this.scrubber.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        
        this.currentPosition = percentage * this.totalDuration;
        this.isAutoScrolling = false;
        this.updateView();
    }

    updatePositionFromEvent(clientX) {
        const rect = this.scrubber.getBoundingClientRect();
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        
        this.currentPosition = percentage * this.totalDuration;
        this.updateView();
    }

    updateView() {
        const displayData = this.getDisplayData();
        this.updateChartsWithScroll(displayData);
        this.updateScrubberPosition();
        this.updateTimeDisplays();
        this.handleAutoScroll();
    }

    getDisplayData() {
        const totalPoints = this.realTimeData.labels.length;
        if (totalPoints === 0) {
            return { 
                labels: [0], 
                fhr: [140], 
                ua: [0], 
                timestamps: [new Date()] 
            };
        }

        const windowStart = this.currentPosition;
        const windowEnd = windowStart + this.windowSize;
        
        let startIndex = 0;
        let endIndex = totalPoints - 1;
        
        for (let i = 0; i < totalPoints; i++) {
            if (this.realTimeData.labels[i] >= windowStart) {
                startIndex = i;
                break;
            }
        }
        
        for (let i = totalPoints - 1; i >= 0; i--) {
            if (this.realTimeData.labels[i] <= windowEnd) {
                endIndex = i;
                break;
            }
        }
        
        if (startIndex > endIndex) {
            startIndex = Math.max(0, endIndex - 10);
        }
        
        return {
            labels: this.realTimeData.labels.slice(startIndex, endIndex + 1),
            fhr: this.realTimeData.fhr.slice(startIndex, endIndex + 1),
            ua: this.realTimeData.ua.slice(startIndex, endIndex + 1),
            timestamps: this.realTimeData.timestamps.slice(startIndex, endIndex + 1)
        };
    }

    updateChartsWithScroll(data) {
        if (!data.labels.length) return;

        let displayMinTime = this.currentPosition;
        let displayMaxTime = this.currentPosition + this.windowSize;

        // If auto-scrolling is active, adjust the display window to follow the latest data
        if (this.isAutoScrolling) {
            const currentMaxDataTime = this.realTimeData.labels.length > 0 ? this.realTimeData.labels[this.realTimeData.labels.length - 1] : 0;
            displayMaxTime = currentMaxDataTime;
            displayMinTime = Math.max(0, currentMaxDataTime - this.windowSize);
            this.currentPosition = displayMinTime; // Update currentPosition to reflect auto-scroll
        }

        if (ChartManager.charts.fhr) {
            ChartManager.charts.fhr.data.labels = data.labels;
            ChartManager.charts.fhr.data.datasets[0].data = data.fhr;
            ChartManager.charts.fhr.options.scales.x.min = displayMinTime;
            ChartManager.charts.fhr.options.scales.x.max = displayMaxTime;
            ChartManager.charts.fhr.update({ duration: 250, easing: 'linear' });
        }

        if (ChartManager.charts.ua) {
            ChartManager.charts.ua.data.labels = data.labels;
            ChartManager.charts.ua.data.datasets[0].data = data.ua;
            ChartManager.charts.ua.options.scales.x.min = displayMinTime;
            ChartManager.charts.ua.options.scales.x.max = displayMaxTime;
            ChartManager.charts.ua.update({ duration: 250, easing: 'linear' });
        }
    }

    handleAutoScroll() {
        if (!this.isRealTimeMode || this.isDragging) return;
        
        const currentMaxDataTime = this.realTimeData.labels.length > 0 ? this.realTimeData.labels[this.realTimeData.labels.length - 1] : 0;
        const currentDisplayMaxTime = this.currentPosition + this.windowSize;

        // If the latest data point is beyond the current display window, auto-scroll to show it
        if (currentMaxDataTime > currentDisplayMaxTime) {
            this.currentPosition = Math.max(0, currentMaxDataTime - this.windowSize);
            this.isAutoScrolling = true;
        } else if (currentMaxDataTime <= currentDisplayMaxTime && this.isAutoScrolling) {
            // If we were auto-scrolling and the data hasn't reached the end, stop auto-scrolling
            // This ensures that if the user manually scrolls back, auto-scrolling doesn't immediately jump forward
            this.isAutoScrolling = false;
        }
    }

    updateScrubberPosition() {
        if (!this.scrubberHandle) return;
        
        const currentTime = (Date.now() - this.startTime) / 60000;
        const maxPosition = Math.max(this.totalDuration, currentTime);
        const percentage = Math.min(1, this.currentPosition / maxPosition);
        
        this.scrubberHandle.style.left = `${percentage * 100}%`;
    }

    updateTimeDisplays() {
        const startTimeEl = document.getElementById('startTime');
        const endTimeEl = document.getElementById('endTime');
        const currentTimeEl = document.getElementById('currentTime');
        
        if (!startTimeEl || !endTimeEl || !currentTimeEl) return;
        
        const windowStart = this.currentPosition;
        const windowEnd = this.currentPosition + this.windowSize;
        const currentTime = (Date.now() - this.startTime) / 60000;
        
        startTimeEl.textContent = this.formatTime(windowStart);
        endTimeEl.textContent = this.formatTime(windowEnd);
        currentTimeEl.textContent = this.formatTime(currentTime);
        
        const modeIndicator = document.querySelector('.time-display__mode');
        if (modeIndicator) {
            if (this.isAutoScrolling && !this.isDragging) {
                modeIndicator.textContent = 'LIVE';
                modeIndicator.style.color = '#2ED47A';
            } else {
                modeIndicator.textContent = 'MANUAL';
                modeIndicator.style.color = '#FF5B5B';
            }
        }
    }

    formatTime(minutes) {
        const totalSeconds = Math.floor(minutes * 60);
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    startAutoUpdate() {
        this.autoUpdateInterval = setInterval(() => {
            this.updateView();
        }, 500);
    }

    stopAutoUpdate() {
        if (this.autoUpdateInterval) {
            clearInterval(this.autoUpdateInterval);
            this.autoUpdateInterval = null;
        }
    }

    navigateToEvent(event, index) {
        if (this.isRealTimeMode) {
            console.log('Event navigation disabled in real-time mode');
            return;
        }
        
        const eventCenter = (event.startMinute + event.endMinute) / 2;
        this.currentPosition = eventCenter;
        
        const allEvents = document.querySelectorAll('.events__item');
        allEvents.forEach(item => item.classList.remove('events__item--active'));
        if (allEvents[index]) {
            allEvents[index].classList.add('events__item--active');
        }
        
        this.activeEventIndex = index;
        this.updateView();
    }

    startAutoPlay() {
        if (this.isRealTimeMode) return;
        this.stopAutoPlay();
        this.autoPlayInterval = setInterval(() => {
            this.currentPosition += 0.5;
            if (this.currentPosition >= 180) {
                this.currentPosition = 0;
            }
            this.updateView();
        }, 100);
    }

    stopAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
    }

    print() {
        window.print();
    }

    destroy() {
        this.stopAutoUpdate();
        this.stopAutoPlay();
        if (this.socket) {
            this.socket.close();
        }
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new KTGDashboard();
    
    // Add keyboard controls
    document.addEventListener('keydown', (e) => {
        if (window.dashboard.isRealTimeMode) {
            switch(e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    window.dashboard.currentPosition = Math.max(0, window.dashboard.currentPosition - 5);
                    window.dashboard.isAutoScrolling = false;
                    window.dashboard.updateView();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    const currentTime = (Date.now() - window.dashboard.startTime) / 60000;
                    window.dashboard.currentPosition = Math.min(
                        window.dashboard.totalDuration, 
                        window.dashboard.currentPosition + 5
                    );
                    if (window.dashboard.currentPosition >= currentTime - 1) {
                        window.dashboard.isAutoScrolling = true;
                    }
                    window.dashboard.updateView();
                    break;
                case 'Home':
                    e.preventDefault();
                    window.dashboard.currentPosition = 0;
                    window.dashboard.isAutoScrolling = false;
                    window.dashboard.updateView();
                    break;
                case 'End':
                    e.preventDefault();
                    const now = (Date.now() - window.dashboard.startTime) / 60000;
                    window.dashboard.currentPosition = Math.max(0, now - window.dashboard.windowSize + 1);
                    window.dashboard.isAutoScrolling = true;
                    window.dashboard.updateView();
                    break;
            }
            return;
        }
        
        switch(e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                window.dashboard.currentPosition = Math.max(0, window.dashboard.currentPosition - 1);
                window.dashboard.updateView();
                break;
            case 'ArrowRight':
                e.preventDefault();
                window.dashboard.currentPosition = Math.min(180, window.dashboard.currentPosition + 1);
                window.dashboard.updateView();
                break;
            case ' ':
                e.preventDefault();
                if (window.dashboard.autoPlayInterval) {
                    window.dashboard.stopAutoPlay();
                } else {
                    window.dashboard.startAutoPlay();
                }
                break;
            case 'p':
            case 'P':
                e.preventDefault();
                window.dashboard.print();
                break;
        }
    });
    
    // Print button functionality
    const printBtn = document.querySelector('.ktg__print-btn');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.dashboard.print();
        });
    }
});