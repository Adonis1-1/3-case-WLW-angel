/**
 * Guardian Angel API Client
 * Клиент для взаимодействия с бэкендом Guardian Angel
 */

class GuardianAngelAPI {
    constructor() {
        this.baseURL = 'http://localhost:8000';
        this.ws = null;
        this.wsReconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
    }

    /**
     * Получить список всех сессий мониторинга
     * @returns {Promise<Array>} Массив сессий
     */
    async getHistorySessions() {
        try {
            const response = await fetch(`${this.baseURL}/history/sessions`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Ошибка при получении списка сессий:', error);
            throw error;
        }
    }

    /**
     * Получить детальные данные сессии
     * @param {string} sessionId - ID сессии
     * @returns {Promise<Object>} Данные сессии с графиками
     */
    async getSessionDetails(sessionId) {
        try {
            const response = await fetch(`${this.baseURL}/history/session/${sessionId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error(`Ошибка при получении данных сессии ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Получить текущий статус системы
     * @returns {Promise<Object>} Статус системы
     */
    async getStatus() {
        try {
            const response = await fetch(`${this.baseURL}/status`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Ошибка при получении статуса:', error);
            throw error;
        }
    }

    /**
     * Получить последние данные КТГ
     * @param {number} limit - Количество записей
     * @returns {Promise<Object>} Данные КТГ
     */
    async getCTGData(limit = 50) {
        try {
            const response = await fetch(`${this.baseURL}/ctg_data?limit=${limit}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Ошибка при получении данных КТГ:', error);
            throw error;
        }
    }

    /**
     * Получить предсказания ML модели
     * @param {string} sessionId - ID сессии
     * @returns {Promise<Object>} Предсказания
     */
    async getPredictions(sessionId = 'default') {
        try {
            const response = await fetch(`${this.baseURL}/predictions/${sessionId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Ошибка при получении предсказаний:', error);
            throw error;
        }
    }

    /**
     * Обновить клинические данные пациента
     * @param {string} sessionId - ID сессии
     * @param {Object} clinicalData - Клинические данные
     * @returns {Promise<Object>} Результат обновления
     */
    async updateClinicalData(sessionId, clinicalData) {
        try {
            const response = await fetch(`${this.baseURL}/patient/${sessionId}/clinical_data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(clinicalData)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Ошибка при обновлении клинических данных:', error);
            throw error;
        }
    }

    /**
     * Подключиться к WebSocket для получения real-time обновлений
     * @param {Object} callbacks - Колбэки для различных типов сообщений
     */
    connectWebSocket(callbacks = {}) {
        const wsURL = `ws://localhost:8000/ws`;
        
        try {
            this.ws = new WebSocket(wsURL);
            
            this.ws.onopen = () => {
                console.log('WebSocket подключен');
                this.wsReconnectAttempts = 0;
                
                // Запрашиваем статус
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send('status');
                }
                
                if (callbacks.onConnect) {
                    callbacks.onConnect();
                }
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    
                    // Вызываем соответствующий колбэк в зависимости от типа сообщения
                    switch (message.type) {
                        case 'ctg_data':
                            if (callbacks.onCTGData) {
                                callbacks.onCTGData(message.data);
                            }
                            break;
                            
                        case 'prediction':
                            if (callbacks.onPrediction) {
                                callbacks.onPrediction(message.data);
                            }
                            break;
                            
                        case 'alert':
                            if (callbacks.onAlert) {
                                callbacks.onAlert(message);
                            }
                            break;
                            
                        case 'status':
                            if (callbacks.onStatus) {
                                callbacks.onStatus(message);
                            }
                            break;
                            
                        case 'clinical_data_updated':
                            if (callbacks.onClinicalDataUpdated) {
                                callbacks.onClinicalDataUpdated(message.data);
                            }
                            break;
                            
                        default:
                            console.log('Неизвестный тип сообщения:', message.type);
                    }
                } catch (error) {
                    console.error('Ошибка при обработке WebSocket сообщения:', error);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket ошибка:', error);
                if (callbacks.onError) {
                    callbacks.onError(error);
                }
            };
            
            this.ws.onclose = () => {
                console.log('WebSocket отключен');
                
                if (callbacks.onDisconnect) {
                    callbacks.onDisconnect();
                }
                
                // Попытка переподключения
                this.attemptReconnect(callbacks);
            };
            
        } catch (error) {
            console.error('Ошибка при создании WebSocket:', error);
            throw error;
        }
    }

    /**
     * Попытка переподключения к WebSocket
     * @param {Object} callbacks - Колбэки для WebSocket
     */
    attemptReconnect(callbacks) {
        if (this.wsReconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Превышено максимальное количество попыток переподключения');
            if (callbacks.onReconnectFailed) {
                callbacks.onReconnectFailed();
            }
            return;
        }
        
        this.wsReconnectAttempts++;
        console.log(`Попытка переподключения ${this.wsReconnectAttempts}/${this.maxReconnectAttempts}...`);
        
        setTimeout(() => {
            this.connectWebSocket(callbacks);
        }, this.reconnectDelay);
    }

    /**
     * Отключиться от WebSocket
     */
    disconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Отправить команду через WebSocket
     * @param {string} command - Команда для отправки
     */
    sendWebSocketCommand(command) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(command);
        } else {
            console.warn('WebSocket не подключен');
        }
    }

    /**
     * Проверить доступность API
     * @returns {Promise<boolean>} true если API доступен
     */
    async checkHealth() {
        try {
            const response = await fetch(`${this.baseURL}/`);
            return response.ok;
        } catch (error) {
            console.error('API недоступен:', error);
            return false;
        }
    }
}

// Создаем глобальный экземпляр API клиента
const guardianAPI = new GuardianAngelAPI();

// Экспортируем для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GuardianAngelAPI;
}