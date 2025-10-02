"""
Guardian Angel API v4.2
Real-time backend for CTG monitoring system with MIS integration
"""

import sys
import csv
import os
import time
import asyncio
import json
import logging
import httpx
import glob
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Относительные импорты для модулей в том же пакете
from db_manager import DBManager
from final_prediction_service import PredictionService

# ==================== НАСТРОЙКА ЛОГИРОВАНИЯ ====================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    encoding='utf-8'
)
logger = logging.getLogger(__name__)

# ==================== КОНСТАНТЫ ====================
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'guardian_angel_data.db')
EMULATOR_HOST = 'localhost'
EMULATOR_PORT = 8081
RECONNECT_DELAY = 5  # секунд между попытками переподключения
PREDICTION_INTERVAL = 10  # секунд между анализами
ARCHIVES_QUEUE_DIR = "archives_to_send"  # Папка для очереди архивов
ARCHIVE_SENDER_INTERVAL = 300  # Интервал проверки очереди (5 минут)
ARCHIVE_SEND_TIMEOUT = 30  # Таймаут отправки архива

# ==================== ХРАНИЛИЩЕ КЛИНИЧЕСКИХ ДАННЫХ (эмуляция МИС) ====================
# Словарь для хранения клинических данных пациентов
# Ключ: session_id, Значение: данные пациента
patient_clinical_data: Dict[str, dict] = {
    "default": {
        "risk_factors": [],
        "patient_name": "Не указано",
        "pregnancy_week": None
    }  # Сессия по умолчанию
}

# ==================== PYDANTIC МОДЕЛИ ====================

class ClinicalDataPayload(BaseModel):
    """Модель клинических данных пациента"""
    patient_name: Optional[str] = Field(None, description="ФИО пациента")
    risk_factors: List[str] = Field(default_factory=list, description="Список факторов риска")
    patient_age: Optional[int] = Field(None, ge=0, le=100, description="Возраст пациента")
    pregnancy_week: Optional[int] = Field(None, ge=0, le=45, description="Неделя беременности")
    previous_pregnancies: Optional[int] = Field(None, ge=0, description="Количество предыдущих беременностей")
    medications: Optional[List[str]] = Field(None, description="Принимаемые медикаменты")


class PatientInfo(BaseModel):
    """Полная информация о пациенте"""
    session_id: str
    patient_name: Optional[str] = None
    risk_factors: List[str]
    patient_age: Optional[int] = None
    pregnancy_week: Optional[int] = None
    previous_pregnancies: Optional[int] = None
    medications: Optional[List[str]] = None
    last_updated: Optional[str] = None

class SessionEndRequest(BaseModel):
    """Модель запроса для завершения сессии"""
    archive_server_url: str = Field(..., description="URL сервера для архивации данных")
    session_notes: Optional[str] = Field(None, description="Примечания к сессии")
    doctor_name: Optional[str] = Field(None, description="ФИО врача")

# ==================== WEBSOCKET MANAGER ====================

class ConnectionManager:
    """
    Менеджер WebSocket соединений.
    Управляет подключениями клиентов и рассылкой сообщений.
    """
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket):
        """Принять новое WebSocket соединение"""
        await websocket.accept()
        async with self.lock:
            self.active_connections.append(websocket)
        logger.info(f"[CONNECTED] WebSocket клиент подключен. Активных подключений: {len(self.active_connections)}")
    
    async def disconnect(self, websocket: WebSocket):
        """Отключить WebSocket соединение"""
        async with self.lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        logger.info(f"[DISCONNECTED] WebSocket клиент отключен. Активных подключений: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict):
        """Отправить сообщение всем подключенным клиентам"""
        if not self.active_connections:
            return
        
        # Сериализуем сообщение один раз
        try:
            json_message = json.dumps(message, default=str)
        except Exception as e:
            logger.error(f"Ошибка сериализации сообщения: {e}")
            return
        
        # Копируем список соединений для безопасной итерации
        async with self.lock:
            connections = self.active_connections.copy()
        
        # Отправляем всем клиентам и собираем отключенные соединения
        disconnected = []
        for connection in connections:
            try:
                await connection.send_text(json_message)
            except Exception as e:
                logger.warning(f"Не удалось отправить сообщение клиенту: {e}")
                disconnected.append(connection)
        
        # Удаляем отключенные соединения
        for connection in disconnected:
            await self.disconnect(connection)


# ==================== TCP CLIENT ДЛЯ ЭМУЛЯТОРА ====================

class EmulatorClient:
    """
    TCP клиент для подключения к эмулятору КТГ.
    Получает данные от эмулятора, сохраняет в БД и транслирует через WebSocket.
    """
    
    def __init__(self, manager: ConnectionManager, prediction_service: PredictionService):
        self.manager = manager
        self.prediction_service = prediction_service
        self.reader: Optional[asyncio.StreamReader] = None
        self.writer: Optional[asyncio.StreamWriter] = None
        self.running = False
        self.db = DBManager()
        self.last_short_analysis_time = time.time()  # Для краткосрочного анализа
        self.last_full_analysis_time = time.time()   # Для полного анализа
        self.short_analysis_interval = 10  # Каждые 10 секунд
        self.full_analysis_interval = 120  # Каждые 2 минуты
        self.current_session_id = "default"
        self.data_counter = 0  # Счетчик полученных данных для отладки
    
    async def connect(self) -> bool:
        """Установить соединение с эмулятором"""
        try:
            self.reader, self.writer = await asyncio.open_connection(
                EMULATOR_HOST, EMULATOR_PORT
            )
            logger.info(f"[SUCCESS] Успешно подключено к эмулятору {EMULATOR_HOST}:{EMULATOR_PORT}")
            
            # Уведомляем фронтенд о подключении
            await self.manager.broadcast({
                "type": "system",
                "message": "Connected to CTG device",
                "status": "connected"
            })
            return True
            
        except Exception as e:
            logger.error(f"[ERROR] Не удалось подключиться к эмулятору: {e}")
            await self.manager.broadcast({
                "type": "system",
                "message": f"Failed to connect to CTG device: {str(e)}",
                "status": "disconnected"
            })
            return False
    
    async def disconnect(self):
        """Закрыть соединение с эмулятором"""
        if self.writer:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception as e:
                logger.error(f"Ошибка при закрытии соединения: {e}")
            finally:
                self.writer = None
                self.reader = None
                logger.info("[DISCONNECTED] Отключено от эмулятора")
    
    def safe_float_convert(self, value: Any, field_name: str) -> Optional[float]:
        """
        Безопасное преобразование значения в float.
        Логирует ошибки преобразования.
        """
        try:
            if isinstance(value, (int, float)):
                return float(value)
            elif isinstance(value, str):
                # Удаляем пробелы и заменяем запятую на точку
                cleaned = value.strip().replace(',', '.')
                return float(cleaned)
            else:
                logger.warning(f"Неожиданный тип данных для {field_name}: {type(value).__name__}")
                return None
        except (ValueError, TypeError) as e:
            logger.error(f"Не удалось преобразовать {field_name}='{value}' в число: {e}")
            return None
    
    async def run_short_term_analysis(self):
        """Быстрый анализ для выявления децелераций (каждые 10 секунд)"""
        try:
            MIN_RECORDS_FOR_SHORT_ANALYSIS = 30  # Минимум 30 секунд данных
            
            # Получаем последние 2 минуты данных
            db = DBManager()
            recent_records = db.get(limit=120)
            records_count = len(recent_records)
            
            # Проверяем минимальное количество данных
            if records_count < MIN_RECORDS_FOR_SHORT_ANALYSIS:
                logger.debug(f"[SHORT ANALYSIS SKIPPED] Недостаточно данных: {records_count}/{MIN_RECORDS_FOR_SHORT_ANALYSIS}")
                return
            
            logger.info(f"[SHORT ANALYSIS] Запуск краткосрочного анализа с {records_count} записями")
            
            # Выполняем краткосрочный анализ
            result = await self.prediction_service.analyze(
                analysis_type='short_term',
                include_graph_data=False
            )
            
            # Извлекаем информацию о децелерациях
            decelerations = result.get('detected_patterns', [])
            decel_patterns = []
            
            for pattern in decelerations:
                pattern_name = pattern.get('name', '').lower()
                pattern_type = pattern.get('type', '').lower()
                
                # Фильтруем только децелерации
                if 'децелерация' in pattern_name or 'deceleration' in pattern_type:
                    decel_patterns.append(pattern)
            
            # Проверяем критические паттерны
            critical_patterns = [
                'deep_decelerations',
                'prolonged_decelerations', 
                'late_decelerations'
            ]
            
            has_critical = False
            for key in critical_patterns:
                if result.get(key, 0) > 0:
                    has_critical = True
                    break
            
            # Если найдены децелерации, отправляем алерт
            if decel_patterns or has_critical:
                logger.warning(f"[SHORT ANALYSIS] Обнаружено {len(decel_patterns)} децелераций!")
                
                await self.manager.broadcast({
                    "type": "short_term_alert",
                    "session_id": self.current_session_id,
                    "severity": "high" if has_critical else "medium",
                    "message": f"Обнаружены децелерации ({len(decel_patterns)})",
                    "patterns": decel_patterns,
                    "timestamp": datetime.now().isoformat(),
                    "records_analyzed": records_count
                })
                
                # Также обновляем список событий
                if decel_patterns:
                    await self.manager.broadcast({
                        "type": "prediction",
                        "session_id": self.current_session_id,
                        "data": {
                            "detected_patterns": decel_patterns,
                            "analysis_type": "short_term"
                        }
                    })
            else:
                logger.debug(f"[SHORT ANALYSIS] Децелераций не обнаружено")
                
        except Exception as e:
            logger.error(f"[SHORT ANALYSIS ERROR] Ошибка краткосрочного анализа: {e}")
    
    async def run_full_prediction_analysis(self, session_id: str = "default"):
        """Полный ML-анализ с учетом клинических данных (каждые 2 минуты)"""
        try:
            # ===== ПРОВЕРКА МИНИМАЛЬНОГО КОЛИЧЕСТВА ДАННЫХ =====
            MIN_RECORDS_FOR_FULL_ANALYSIS = 600  # Минимум 10 минут данных для полного анализа
            
            # Получаем количество записей в базе данных
            db = DBManager()
            recent_records = db.get(limit=MIN_RECORDS_FOR_FULL_ANALYSIS + 1)
            records_count = len(recent_records)
            
            # Проверяем, достаточно ли данных для полного анализа
            if records_count < MIN_RECORDS_FOR_FULL_ANALYSIS:
                logger.info(f"[FULL ANALYSIS SKIPPED] Недостаточно данных для полного анализа. "
                           f"Требуется минимум {MIN_RECORDS_FOR_FULL_ANALYSIS} записей, "
                           f"доступно: {records_count}")
                
                # Отправляем информационное сообщение через WebSocket
                await self.manager.broadcast({
                    "type": "analysis_info",
                    "session_id": session_id,
                    "status": "collecting_data",
                    "message": f"Сбор данных для полного анализа... ({records_count}/{MIN_RECORDS_FOR_FULL_ANALYSIS})",
                    "records_collected": records_count,
                    "records_required": MIN_RECORDS_FOR_FULL_ANALYSIS,
                    "progress_percent": int((records_count / MIN_RECORDS_FOR_FULL_ANALYSIS) * 100)
                })
                
                return  # Прерываем выполнение функции
            
            logger.info(f"[FULL ANALYSIS START] Запуск полного анализа с {records_count} записями")
            
            # ===== ПРОДОЛЖАЕМ С ПОЛНЫМ АНАЛИЗОМ =====
            
            # Получаем клинические данные пациента
            clinical_data = patient_clinical_data.get(session_id)
            
            if clinical_data and clinical_data.get('risk_factors'):
                logger.info(f"[FULL ANALYSIS] Анализ с учетом факторов риска: {clinical_data['risk_factors']}")
            
            # Запускаем полный анализ
            result = await self.prediction_service.analyze(
                clinical_data=clinical_data,
                include_graph_data=False
            )
            
            # Добавляем информацию о клинических данных и количестве проанализированных записей
            result['clinical_data_applied'] = bool(clinical_data and clinical_data.get('risk_factors'))
            result['risk_factors'] = clinical_data.get('risk_factors', []) if clinical_data else []
            result['session_id'] = session_id
            result['records_analyzed'] = records_count
            result['analysis_type'] = 'full'
            
            # Отправляем результат через WebSocket
            await self.manager.broadcast({
                "type": "prediction",
                "session_id": session_id,
                "data": result,
                "analysis_info": {
                    "records_analyzed": records_count,
                    "timestamp": datetime.now().isoformat(),
                    "analysis_type": "full"
                }
            })
            
            # Логируем результат
            fwbs = result.get('fetal_wellbeing_index', 100)
            risk_level = result.get('risk_level', 'unknown')
            logger.info(f"[FULL ANALYSIS RESULT] Анализ завершен: FWBS={fwbs:.1f}, Risk={risk_level}, "
                       f"Проанализировано записей: {records_count}")
            
            # Отправляем предупреждение при высоком риске
            if risk_level in ['high', 'critical'] or fwbs < 70:
                await self.manager.broadcast({
                    "type": "alert",
                    "severity": "high" if fwbs < 50 else "medium",
                    "message": f"[WARNING] Требуется внимание! Индекс благополучия: {fwbs:.1f}",
                    "session_id": session_id,
                    "records_analyzed": records_count,
                    "analysis_type": "full"
                })
            
        except Exception as e:
            logger.error(f"[FULL ANALYSIS ERROR] Ошибка при выполнении полного анализа: {e}", exc_info=True)
    
    async def process_data(self, data: dict):
        """
        Обработка данных от эмулятора.
        Ожидаемый формат: {"bpm": ["время", "значение"], "uterus": ["время", "значение"]}
        """
        try:
            self.data_counter += 1
            logger.debug(f"[DATA] Обработка данных #{self.data_counter}: {data}")
            
            # ===== 1. ВАЛИДАЦИЯ СТРУКТУРЫ ДАННЫХ =====
            if not isinstance(data, dict):
                logger.error(f"Получены данные неверного типа: {type(data).__name__}. Данные: {data}")
                return
            
            bpm_data = data.get('bpm')
            uterus_data = data.get('uterus')
            
            # Проверяем наличие обязательных полей
            if bpm_data is None or uterus_data is None:
                logger.error(f"Отсутствуют обязательные поля. Получено: {list(data.keys())}. Полные данные: {data}")
                return
            
            # Проверяем формат данных (должны быть списки из 2 элементов)
            if not isinstance(bpm_data, list) or len(bpm_data) < 2:
                logger.error(f"Неверный формат bpm_data: {bpm_data}")
                return
            
            if not isinstance(uterus_data, list) or len(uterus_data) < 2:
                logger.error(f"Неверный формат uterus_data: {uterus_data}")
                return
            
            # ===== 2. ИЗВЛЕЧЕНИЕ И ПРЕОБРАЗОВАНИЕ ДАННЫХ =====
            bpm_time_str = str(bpm_data[0])  # Время как строка
            bpm_value_raw = bpm_data[1]  # Значение (может быть строкой или числом)
            
            uterus_time_str = str(uterus_data[0])  # Время как строка
            uterus_value_raw = uterus_data[1]  # Значение (может быть строкой или числом)
            
            # Безопасное преобразование значений в float
            bpm_value = self.safe_float_convert(bpm_value_raw, "bpm_value")
            uterus_value = self.safe_float_convert(uterus_value_raw, "uterus_value")
            
            # Проверяем успешность преобразования
            if bpm_value is None or uterus_value is None:
                logger.error(f"Не удалось преобразовать значения в числа. Исходные данные: {data}")
                return
            
            # ===== 3. ВАЛИДАЦИЯ ДИАПАЗОНОВ ЗНАЧЕНИЙ =====
            # Проверка ЧСС (FHR)
            if bpm_value < 50 or bpm_value > 201:
                logger.warning(f"Отфильтровано аномальное значение ЧСС: {bpm_value}")
                return
            
            # Проверка СДМ (UA)
            if uterus_value < 0 or uterus_value > 120:
                logger.warning(f"Отфильтровано аномальное значение СДМ: {uterus_value}")
                return
            
            # ===== 4. СОЗДАНИЕ ВРЕМЕННЫХ МЕТОК =====
            unix_timestamp = int(time.time())
            iso_timestamp = datetime.now().isoformat()
            
            # ===== 5. СОХРАНЕНИЕ В БАЗУ ДАННЫХ =====
            logger.debug(f"[DB] Сохранение в БД: ts={unix_timestamp}, bpm={bpm_value}, uterus={uterus_value}")
            
            # Используем правильный порядок аргументов для db.add()
            await asyncio.to_thread(
                self.db.add,
                unix_timestamp,      # ts (unix timestamp)
                bpm_time_str,       # bpm_time (строка времени от эмулятора)
                bpm_value,          # bpm_value (числовое значение)
                uterus_time_str,    # uterus_time (строка времени от эмулятора)
                uterus_value        # uterus_value (числовое значение)
            )
            
            logger.info(f"[SAVED] Данные сохранены: BPM={bpm_value:.1f}, Uterus={uterus_value:.1f}")
            
            # ===== 6. ОТПРАВКА ЧЕРЕЗ WEBSOCKET =====
            ws_message = {
                "type": "ctg_data",
                "data": {
                    "timestamp": iso_timestamp,
                    "session_id": self.current_session_id,
                    "bpm_time": bpm_time_str,
                    "bpm_value": bpm_value,
                    "uterus_time": uterus_time_str,
                    "uterus_value": uterus_value,
                    "data_point": self.data_counter  # Для отладки на фронтенде
                }
            }
            
            await self.manager.broadcast(ws_message)
            
            # ===== 7. ПЕРИОДИЧЕСКИЙ ЗАПУСК АНАЛИЗА =====
            current_time = time.time()
            
            # Краткосрочный анализ (каждые 10 секунд)
            if current_time - self.last_short_analysis_time >= self.short_analysis_interval:
                self.last_short_analysis_time = current_time
                logger.debug("[ANALYSIS] Запуск краткосрочного анализа...")
                await self.run_short_term_analysis()
            
            # Полный анализ (каждые 2 минуты и если достаточно данных)
            if current_time - self.last_full_analysis_time >= self.full_analysis_interval:
                self.last_full_analysis_time = current_time
                logger.info("[ANALYSIS] Запуск полного анализа...")
                await self.run_full_prediction_analysis(self.current_session_id)
            
        except Exception as e:
            logger.error(f"[CRITICAL] Критическая ошибка в process_data. Данные: {data}. Ошибка: {e}", exc_info=True)
    
    async def run(self):
        """Основной цикл работы клиента"""
        self.running = True
        logger.info("[START] Запуск EmulatorClient...")
        
        while self.running:
            try:
                # Пытаемся подключиться к эмулятору
                if not await self.connect():
                    logger.info(f"[RETRY] Повторная попытка через {RECONNECT_DELAY} секунд...")
                    await asyncio.sleep(RECONNECT_DELAY)
                    continue
                
                # Основной цикл чтения данных
                buffer = b""  # Буфер для неполных строк
                
                while self.running and self.reader:
                    try:
                        # Читаем данные из сокета с увеличенным таймаутом
                        chunk = await asyncio.wait_for(
                            self.reader.read(1024),
                            timeout=60.0  # Увеличенный таймаут
                        )
                        
                        if not chunk:
                            logger.warning("[EMPTY] Получен пустой chunk - соединение закрыто")
                            break
                        
                        # Добавляем к буферу
                        buffer += chunk
                        
                        # Обрабатываем полные строки
                        while b'\n' in buffer:
                            line, buffer = buffer.split(b'\n', 1)
                            if line:
                                try:
                                    json_str = line.decode('utf-8').strip()
                                    if json_str:
                                        json_data = json.loads(json_str)
                                        await self.process_data(json_data)
                                except json.JSONDecodeError as e:
                                    logger.error(f"[JSON ERROR] Ошибка парсинга JSON: {e}. Строка: {line[:100]}")
                                except UnicodeDecodeError as e:
                                    logger.error(f"[DECODE ERROR] Ошибка декодирования: {e}")
                    
                    except asyncio.TimeoutError:
                        logger.warning("[TIMEOUT] Таймаут чтения данных от эмулятора")
                        # Проверяем соединение
                        if self.writer:
                            try:
                                self.writer.write(b'\n')
                                await self.writer.drain()
                            except:
                                break
                    
                    except Exception as e:
                        logger.error(f"[READ ERROR] Ошибка при чтении данных: {e}")
                        break
                
                # Отключаемся перед переподключением
                await self.disconnect()
                
                if self.running:
                    logger.info(f"[RECONNECT] Переподключение через {RECONNECT_DELAY} секунд...")
                    await asyncio.sleep(RECONNECT_DELAY)
                    
            except Exception as e:
                logger.error(f"[CRITICAL] Критическая ошибка в главном цикле: {e}", exc_info=True)
                await asyncio.sleep(RECONNECT_DELAY)
    
    async def stop(self):
        """Остановка клиента"""
        logger.info("[STOP] Остановка EmulatorClient...")
        self.running = False
        await self.disconnect()


# ==================== ФОНОВЫЙ ПРОЦЕСС "ПОЧТАЛЬОН" ====================

async def archive_sender_worker():
    """
    Фоновый процесс для отправки архивов из локальной очереди.
    Работает постоянно, проверяя папку с неотправленными архивами.
    """
    logger.info("[ARCHIVE SENDER] Запуск фонового процесса отправки архивов")
    
    # Создаем папку для очереди, если её нет
    os.makedirs(ARCHIVES_QUEUE_DIR, exist_ok=True)
    
    while True:
        try:
            # Получаем список файлов в очереди
            archive_files = sorted(glob.glob(os.path.join(ARCHIVES_QUEUE_DIR, "*.json")))
            
            if archive_files:
                logger.info(f"[ARCHIVE SENDER] Найдено {len(archive_files)} архивов в очереди")
                
                for archive_path in archive_files:
                    try:
                        # Читаем архив
                        with open(archive_path, 'r', encoding='utf-8') as f:
                            archive_data = json.load(f)
                        
                        # Извлекаем URL сервера из метаданных
                        server_url = archive_data.get('metadata', {}).get('archive_server_url')
                        
                        if not server_url:
                            logger.error(f"[ARCHIVE SENDER] Отсутствует URL сервера в архиве {archive_path}")
                            # Перемещаем в папку с ошибками
                            error_dir = os.path.join(ARCHIVES_QUEUE_DIR, "errors")
                            os.makedirs(error_dir, exist_ok=True)
                            error_path = os.path.join(error_dir, os.path.basename(archive_path))
                            os.rename(archive_path, error_path)
                            continue
                        
                        # Подготавливаем данные для отправки (без URL в метаданных)
                        send_data = archive_data.copy()
                        if 'metadata' in send_data and 'archive_server_url' in send_data['metadata']:
                            del send_data['metadata']['archive_server_url']
                        
                        logger.info(f"[ARCHIVE SENDER] Попытка отправки архива {os.path.basename(archive_path)} на {server_url}")
                        
                        # Пытаемся отправить
                        async with httpx.AsyncClient(timeout=ARCHIVE_SEND_TIMEOUT) as client:
                            response = await client.post(
                                server_url,
                                json=send_data,
                                headers={"Content-Type": "application/json"}
                            )
                            
                            if response.status_code in [200, 201, 202]:
                                # Успешная отправка
                                logger.info(f"[ARCHIVE SENDER] ✅ Архив успешно отправлен: {os.path.basename(archive_path)}")
                                
                                # Перемещаем в папку успешно отправленных
                                sent_dir = os.path.join(ARCHIVES_QUEUE_DIR, "sent")
                                os.makedirs(sent_dir, exist_ok=True)
                                sent_path = os.path.join(sent_dir, os.path.basename(archive_path))
                                os.rename(archive_path, sent_path)
                                
                                # Уведомляем через WebSocket
                                await manager.broadcast({
                                    "type": "archive_sent",
                                    "session_id": archive_data.get("session_id"),
                                    "message": f"Архив сессии {archive_data.get('session_id')} успешно отправлен на сервер"
                                })
                            else:
                                logger.warning(f"[ARCHIVE SENDER] Сервер вернул код {response.status_code} для {os.path.basename(archive_path)}")
                                # Оставляем в очереди для повторной попытки
                                
                    except httpx.ConnectError:
                        logger.warning(f"[ARCHIVE SENDER] Нет соединения с сервером для {os.path.basename(archive_path)}")
                        # Файл остается в очереди
                    except httpx.TimeoutException:
                        logger.warning(f"[ARCHIVE SENDER] Таймаут при отправке {os.path.basename(archive_path)}")
                        # Файл остается в очереди
                    except Exception as e:
                        logger.error(f"[ARCHIVE SENDER] Ошибка при обработке {archive_path}: {e}", exc_info=True)
                        # Файл остается в очереди
                    
                    # Небольшая пауза между отправками
                    await asyncio.sleep(2)
            else:
                logger.debug("[ARCHIVE SENDER] Очередь архивов пуста")
            
        except Exception as e:
            logger.error(f"[ARCHIVE SENDER] Критическая ошибка в цикле отправки: {e}", exc_info=True)
        
        # Ждем перед следующей проверкой
        await asyncio.sleep(ARCHIVE_SENDER_INTERVAL)


# ==================== ИНИЦИАЛИЗАЦИЯ КОМПОНЕНТОВ ====================

manager = ConnectionManager()
prediction_service = PredictionService(model_path="ml_model.pkl")
emulator_client = EmulatorClient(manager, prediction_service)


# ==================== LIFESPAN MANAGEMENT ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Управление жизненным циклом приложения"""
    logger.info("=" * 50)
    logger.info("[STARTUP] ЗАПУСК Guardian Angel API v4.2")
    logger.info(f"[DATABASE] База данных: {DB_PATH}")
    logger.info(f"[EMULATOR] Эмулятор: {EMULATOR_HOST}:{EMULATOR_PORT}")
    logger.info(f"[ARCHIVES] Папка очереди: {ARCHIVES_QUEUE_DIR}")
    logger.info("=" * 50)
    
    # Запускаем фоновые задачи
    emulator_task = asyncio.create_task(emulator_client.run())
    archive_sender_task = asyncio.create_task(archive_sender_worker())  # Новая задача
    
    yield
    
    # Останавливаем все при завершении
    logger.info("=" * 50)
    logger.info("[SHUTDOWN] ОСТАНОВКА Guardian Angel API")
    logger.info("=" * 50)
    
    await emulator_client.stop()
    emulator_task.cancel()
    archive_sender_task.cancel()  # Отменяем задачу почтальона
    
    try:
        await emulator_task
    except asyncio.CancelledError:
        pass
    
    try:
        await archive_sender_task
    except asyncio.CancelledError:
        pass


# ==================== СОЗДАНИЕ FASTAPI ПРИЛОЖЕНИЯ ====================

app = FastAPI(
    title="Guardian Angel API",
    version="4.2",
    description="Real-time CTG monitoring system with MIS integration",
    lifespan=lifespan
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене указать конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== API ENDPOINTS ====================

@app.get('/')
def root():
    """Корневой эндпоинт - статус системы"""
    return {
        'status': 'ok',
        'version': '4.2',
        'websocket_clients': len(manager.active_connections),
        'emulator_connected': emulator_client.reader is not None,
        'data_points_received': emulator_client.data_counter,
        'patients_with_clinical_data': len(patient_clinical_data)
    }


@app.get('/ctg_data')
def get_ctg_data(limit: int = 50):
    """Получить последние записи КТГ из базы данных"""
    try:
        db = DBManager()
        rows = db.get(limit)
        
        if not rows:
            logger.warning("База данных пуста")
            return {"message": "No data available", "data": []}
        
        result = []
        for r in rows:
            result.append({
                'id': r[0],
                'ts': r[1],
                'bpm_time': r[2],
                'bpm_value': r[3],
                'uterus_time': r[4],
                'uterus_value': r[5],
            })
        
        logger.info(f"Возвращено {len(result)} записей КТГ")
        return {"count": len(result), "data": result}
        
    except Exception as e:
        logger.error(f"Ошибка при получении данных КТГ: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/export')
def export_csv():
    """Экспортировать все данные в CSV файл"""
    try:
        db = DBManager()
        rows = db.get(sys.maxsize)
        
        if not rows:
            raise HTTPException(status_code=404, detail="No data to export")
        
        filename = f'export_{int(time.time())}.csv'
        path = os.path.join(os.getcwd(), filename)
        
        with open(path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['id', 'ts', 'bpm_time', 'bpm_value', 'uterus_time', 'uterus_value'])
            writer.writerows(rows)
        
        logger.info(f"Экспортировано {len(rows)} записей в {filename}")
        return FileResponse(path, media_type='text/csv', filename=filename)
        
    except Exception as e:
        logger.error(f"Ошибка при экспорте: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/predictions')
async def predictions_default():
    """Получить предсказания для сессии по умолчанию"""
    return await predictions("default")


@app.get('/predictions/{session_id}')
async def predictions(session_id: str = "default"):
    """Получить предсказания ML модели с учетом клинических данных"""
    try:
        # Проверяем наличие данных в БД
        db = DBManager()
        data_count = len(db.get(100))
        
        if data_count < 10:
            logger.warning(f"Недостаточно данных для анализа: {data_count} записей")
            return {
                "error": "Insufficient data",
                "message": f"Требуется минимум 10 записей, доступно: {data_count}",
                "session_id": session_id
            }
        
        # Получаем клинические данные
        clinical_data = patient_clinical_data.get(session_id)
        
        if clinical_data and clinical_data.get('risk_factors'):
            logger.info(f"Анализ для {session_id} с факторами риска: {clinical_data['risk_factors']}")
        
        # Выполняем анализ
        result = await prediction_service.analyze(
            clinical_data=clinical_data,
            include_graph_data=True
        )
        
        # Добавляем метаданные
        result['session_id'] = session_id
        result['clinical_data_applied'] = bool(clinical_data and clinical_data.get('risk_factors'))
        result['risk_factors_used'] = clinical_data.get('risk_factors', []) if clinical_data else []
        result['data_points_analyzed'] = data_count
        
        return result
        
    except Exception as e:
        logger.error(f"Ошибка при анализе: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/patient/{session_id}/clinical_data")
async def update_clinical_data(session_id: str, payload: ClinicalDataPayload):
    """Загрузить клинические данные пациента (эмуляция МИС)"""
    try:
        clinical_data = payload.dict()
        clinical_data['last_updated'] = datetime.now().isoformat()
        
        # Сохраняем данные в хранилище
        patient_clinical_data[session_id] = clinical_data
        
        logger.info(f"[UPDATED] Обновлены клинические данные для {session_id}")
        logger.info(f"  - ФИО: {clinical_data.get('patient_name', 'Не указано')}")
        logger.info(f"  - Срок беременности: {clinical_data.get('pregnancy_week', 'Не указан')} недель")
        logger.info(f"  - Факторов риска: {len(payload.risk_factors)}")
        
        # Уведомляем через WebSocket об обновлении клинических данных
        await manager.broadcast({
            "type": "clinical_data_updated",
            "session_id": session_id,
            "data": clinical_data
        })
        
        # Отправляем специальное сообщение об обновлении информации о пациенте
        await manager.broadcast({
            "type": "patient_info_updated",
            "session_id": session_id,
            "name": clinical_data.get('patient_name', 'Не указано'),
            "week": clinical_data.get('pregnancy_week')
        })
        
        # Запускаем анализ с новыми данными
        await emulator_client.run_full_prediction_analysis(session_id)
        
        return {
            "status": "ok",
            "session_id": session_id,
            "patient_name": clinical_data.get('patient_name'),
            "pregnancy_week": clinical_data.get('pregnancy_week'),
            "risk_factors_count": len(payload.risk_factors),
            "data_received": clinical_data
        }
        
    except Exception as e:
        logger.error(f"Ошибка при обновлении клинических данных: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/patient/{session_id}/clinical_data", response_model=PatientInfo)
async def get_clinical_data(session_id: str):
    """Получить клинические данные пациента"""
    if session_id not in patient_clinical_data:
        raise HTTPException(
            status_code=404,
            detail=f"Clinical data for session {session_id} not found"
        )
    
    return PatientInfo(session_id=session_id, **patient_clinical_data[session_id])


@app.delete("/patient/{session_id}/clinical_data")
async def clear_clinical_data(session_id: str):
    """Удалить клинические данные пациента"""
    if session_id in patient_clinical_data:
        del patient_clinical_data[session_id]
        
        await manager.broadcast({
            "type": "clinical_data_cleared",
            "session_id": session_id
        })
        
        # Отправляем обновление о сбросе информации пациента
        await manager.broadcast({
            "type": "patient_info_updated",
            "session_id": session_id,
            "name": "Не указано",
            "week": None
        })
        
        logger.info(f"Удалены клинические данные для {session_id}")
        return {"status": "ok", "message": f"Clinical data for {session_id} cleared"}
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Clinical data for session {session_id} not found"
        )


@app.get("/patient/sessions")
async def get_all_patient_sessions():
    """Получить список всех сессий с клиническими данными"""
    sessions = []
    for session_id, data in patient_clinical_data.items():
        sessions.append({
            "session_id": session_id,
            "patient_name": data.get('patient_name', 'Не указано'),
            "risk_factors_count": len(data.get('risk_factors', [])),
            "patient_age": data.get('patient_age'),
            "pregnancy_week": data.get('pregnancy_week'),
            "last_updated": data.get('last_updated', 'unknown')
        })
    
    return {
        "total_sessions": len(sessions),
        "sessions": sessions
    }


@app.post("/demo/load_sample_patients")
async def load_sample_patients():
    """Загрузить демонстрационные данные пациентов"""
    sample_patients = {
        "patient_001": {
            "patient_name": "Иванова Мария Петровна",
            "risk_factors": ["Гестационный диабет", "Ожирение"],
            "patient_age": 38,
            "pregnancy_week": 36
        },
        "patient_002": {
            "patient_name": "Петрова Елена Сергеевна",
            "risk_factors": ["Преэклампсия", "Многоплодная беременность"],
            "patient_age": 29,
            "pregnancy_week": 34
        },
        "patient_003": {
            "patient_name": "Сидорова Анна Ивановна",
            "risk_factors": [],
            "patient_age": 25,
            "pregnancy_week": 39
        }
    }
    
    for session_id, data in sample_patients.items():
        data['last_updated'] = datetime.now().isoformat()
        patient_clinical_data[session_id] = data
    
    logger.info(f"Загружены демо-данные для {len(sample_patients)} пациентов")
    
    # Отправляем уведомление о загрузке демо-данных
    for session_id, data in sample_patients.items():
        await manager.broadcast({
            "type": "patient_info_updated",
            "session_id": session_id,
            "name": data.get('patient_name', 'Не указано'),
            "week": data.get('pregnancy_week')
        })
    
    return {
        "status": "ok",
        "message": "Sample patients loaded",
        "loaded_patients": list(sample_patients.keys())
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket эндпоинт для real-time обновлений"""
    await manager.connect(websocket)
    
    try:
        # Отправляем приветственное сообщение
        await websocket.send_json({
            "type": "welcome",
            "message": "Connected to Guardian Angel real-time stream",
            "server_time": datetime.now().isoformat()
        })
        
        # Отправляем текущий статус
        await websocket.send_json({
            "type": "status",
            "emulator_connected": emulator_client.reader is not None,
            "data_points": emulator_client.data_counter
        })
        
        # Отправляем информацию о текущем пациенте
        current_session = emulator_client.current_session_id
        if current_session in patient_clinical_data:
            patient_data = patient_clinical_data[current_session]
            await websocket.send_json({
                "type": "patient_info_updated",
                "session_id": current_session,
                "name": patient_data.get('patient_name', 'Не указано'),
                "week": patient_data.get('pregnancy_week')
            })
        else:
            # Если данных нет, отправляем значения по умолчанию
            await websocket.send_json({
                "type": "patient_info_updated",
                "session_id": current_session,
                "name": "Не указано",
                "week": None
            })
        
        # Держим соединение открытым
        while True:
            data = await websocket.receive_text()
            
            # Обработка команд от клиента
            if data == "ping":
                await websocket.send_text("pong")
            
            elif data == "status":
                await websocket.send_json({
                    "type": "status",
                    "emulator_connected": emulator_client.reader is not None,
                    "total_clients": len(manager.active_connections),
                    "data_points": emulator_client.data_counter
                })
            
            elif data.startswith("session:"):
                # Смена активной сессии
                new_session = data.split(":", 1)[1]
                emulator_client.current_session_id = new_session
                logger.info(f"Сессия изменена на: {new_session}")
                
                await websocket.send_json({
                    "type": "session_switched",
                    "session_id": new_session
                })
                
                # Отправляем информацию о пациенте для новой сессии
                if new_session in patient_clinical_data:
                    patient_data = patient_clinical_data[new_session]
                    await websocket.send_json({
                        "type": "patient_info_updated",
                        "session_id": new_session,
                        "name": patient_data.get('patient_name', 'Не указано'),
                        "week": patient_data.get('pregnancy_week')
                    })
                
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await manager.disconnect(websocket)


@app.get('/status')
async def get_status():
    """Получить полный статус системы"""
    try:
        db = DBManager()
        total_records = len(db.get(sys.maxsize))
        
        return {
            "system": "Guardian Angel API",
            "version": "4.2",
            "emulator": {
                "connected": emulator_client.reader is not None,
                "host": f"{EMULATOR_HOST}:{EMULATOR_PORT}",
                "data_received": emulator_client.data_counter
            },
            "database": {
                "path": DB_PATH,
                "total_records": total_records
            },
            "websocket": {
                "active_clients": len(manager.active_connections)
            },
            "clinical_data": {
                "sessions_count": len(patient_clinical_data),
                "sessions": list(patient_clinical_data.keys())
            },
            "current_session": emulator_client.current_session_id,
            "current_patient": patient_clinical_data.get(
                emulator_client.current_session_id, {}
            ).get('patient_name', 'Не указано'),
            "server_time": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Ошибка при получении статуса: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/session/current")
async def get_current_session():
    """Получить информацию о текущей сессии"""
    db = DBManager()
    record_count = len(db.get(100))
    
    clinical_data = patient_clinical_data.get(
        emulator_client.current_session_id, 
        {}
    )
    
    return {
        "session_id": emulator_client.current_session_id,
        "patient_name": clinical_data.get("patient_name", "Не указано"),
        "pregnancy_week": clinical_data.get("pregnancy_week"),
        "risk_factors": clinical_data.get("risk_factors", []),
        "records_collected": record_count,
        "data_points_received": emulator_client.data_counter,
        "emulator_connected": emulator_client.reader is not None
    }


@app.post("/session/export-preview")
async def preview_export_data():
    """
    Предпросмотр данных, которые будут архивированы при завершении сессии.
    Полезно для проверки перед финальной архивацией.
    """
    db = DBManager()
    all_records = db.get(sys.maxsize)
    
    if not all_records:
        return {
            "status": "no_data",
            "message": "No data to preview"
        }
    
    # Показываем только первые и последние 5 записей для предпросмотра
    preview_records = []
    if len(all_records) <= 10:
        preview_records = all_records
    else:
        preview_records = all_records[:5] + all_records[-5:]
    
    formatted_preview = []
    for record in preview_records:
        formatted_preview.append({
            "id": record[0],
            "timestamp": record[1],
            "bpm_value": record[3],
            "uterus_value": record[5]
        })
    
    clinical_data = patient_clinical_data.get(
        emulator_client.current_session_id, 
        {}
    )
    
    return {
        "session_id": emulator_client.current_session_id,
        "total_records": len(all_records),
        "patient_info": {
            "name": clinical_data.get("patient_name", "Не указано"),
            "pregnancy_week": clinical_data.get("pregnancy_week"),
            "risk_factors": clinical_data.get("risk_factors", [])
        },
        "data_preview": formatted_preview,
        "preview_note": f"Showing {len(formatted_preview)} of {len(all_records)} records"
    }


@app.post("/session/end")
async def end_session(request: SessionEndRequest):
    """
    Завершить текущую сессию мониторинга (отказоустойчивая версия):
    1. Собрать все данные
    2. Сохранить в локальную очередь
    3. Немедленно очистить БД для нового пациента
    4. Фоновый процесс отправит архив когда появится сеть
    """
    try:
        session_id = emulator_client.current_session_id
        logger.info(f"[SESSION END] Завершение сессии {session_id}")
        
        # ===== 1. СБОР ДАННЫХ =====
        db = DBManager()
        
        # Получаем статистику перед очисткой
        stats = db.get_session_statistics() if hasattr(db, 'get_session_statistics') else {}
        
        # Получаем все записи КТГ
        all_ctg_records = db.get(sys.maxsize)
        
        if not all_ctg_records:
            logger.warning("Нет данных для архивации")
            return {
                "status": "no_data",
                "message": "No data to archive",
                "session_id": session_id
            }
        
        # Форматируем записи
        ctg_data_formatted = []
        for record in all_ctg_records:
            ctg_data_formatted.append({
                "id": record[0],
                "timestamp": record[1],
                "bpm_time": record[2],
                "bpm_value": record[3],
                "uterus_time": record[4],
                "uterus_value": record[5]
            })
        
        # Получаем клинические данные
        clinical_data = patient_clinical_data.get(
            session_id, 
            {"risk_factors": [], "patient_name": "Не указано"}
        )
        
        # ===== 2. ФОРМИРОВАНИЕ АРХИВА =====
        archive_payload = {
            "session_id": session_id,
            "metadata": {
                "archive_server_url": request.archive_server_url,  # Сохраняем URL в архив
                "created_at": datetime.now().isoformat(),
                "doctor_name": request.doctor_name,
                "session_notes": request.session_notes
            },
            "session_info": {
                "start_time": ctg_data_formatted[0]["timestamp"] if ctg_data_formatted else None,
                "end_time": datetime.now().isoformat(),
                "total_records": len(ctg_data_formatted),
                "duration_seconds": stats.get("duration_seconds", 0),
                "avg_bpm": stats.get("avg_bpm", 0),
                "avg_uterus": stats.get("avg_uterus", 0)
            },
            "patient_info": {
                "name": clinical_data.get("patient_name", "Не указано"),
                "age": clinical_data.get("patient_age"),
                "pregnancy_week": clinical_data.get("pregnancy_week"),
                "risk_factors": clinical_data.get("risk_factors", []),
                "medications": clinical_data.get("medications", []),
                "previous_pregnancies": clinical_data.get("previous_pregnancies")
            },
            "ctg_records": ctg_data_formatted
        }
        
        # ===== 3. СОХРАНЕНИЕ В ОЧЕРЕДЬ =====
        os.makedirs(ARCHIVES_QUEUE_DIR, exist_ok=True)
        
        # Генерируем уникальное имя файла с timestamp для правильной сортировки
        timestamp = int(time.time() * 1000)  # Миллисекунды для уникальности
        archive_filename = f"archive_{session_id}_{timestamp}.json"
        archive_path = os.path.join(ARCHIVES_QUEUE_DIR, archive_filename)
        
        # Сохраняем архив
        with open(archive_path, 'w', encoding='utf-8') as f:
            json.dump(archive_payload, f, indent=2, default=str)
        
        logger.info(f"[QUEUE] Архив сохранен в очередь: {archive_filename}")
        
        # ===== 4. НЕМЕДЛЕННАЯ ОЧИСТКА ДАННЫХ =====
        cleared_records = db.clear_data()
        logger.info(f"[CLEANUP] Очищено {cleared_records} записей из БД")
        
        # Очищаем клинические данные
        if session_id in patient_clinical_data:
            del patient_clinical_data[session_id]
            logger.info(f"[CLEANUP] Очищены клинические данные для сессии {session_id}")
        
        # Сбрасываем счетчик
        emulator_client.data_counter = 0
        
        # ===== 5. СОЗДАНИЕ НОВОЙ СЕССИИ =====
        new_session_id = f"session_{int(time.time())}"
        emulator_client.current_session_id = new_session_id
        
        # Инициализируем данные для новой сессии
        patient_clinical_data[new_session_id] = {
            "risk_factors": [],
            "patient_name": "Не указано",
            "pregnancy_week": None
        }
        
        logger.info(f"[NEW SESSION] Создана новая сессия: {new_session_id}")
        
        # ===== 6. УВЕДОМЛЕНИЯ ЧЕРЕЗ WEBSOCKET =====
        await manager.broadcast({
            "type": "session_ended",
            "session_id": session_id,
            "message": "Сессия завершена, архив поставлен в очередь на отправку",
            "archived_records": len(ctg_data_formatted),
            "queue_status": "pending"
        })
        
        await manager.broadcast({
            "type": "new_session_started",
            "session_id": new_session_id,
            "message": "Начата новая сессия мониторинга"
        })
        
        # Проверяем статус очереди
        queue_files = glob.glob(os.path.join(ARCHIVES_QUEUE_DIR, "*.json"))
        
        return {
            "status": "success",
            "message": "Сессия завершена, данные очищены, архив поставлен в очередь",
            "archived_session": {
                "session_id": session_id,
                "records_count": len(ctg_data_formatted),
                "archive_filename": archive_filename,
                "queue_position": len(queue_files)
            },
            "new_session": {
                "session_id": new_session_id,
                "status": "ready"
            },
            "queue_info": {
                "total_in_queue": len(queue_files),
                "message": "Архив будет отправлен автоматически при наличии соединения"
            }
        }
        
    except Exception as e:
        logger.error(f"[SESSION END ERROR] Критическая ошибка: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/archives/queue")
async def get_archives_queue():
    """Получить информацию об очереди архивов"""
    try:
        # Архивы в очереди
        pending_files = glob.glob(os.path.join(ARCHIVES_QUEUE_DIR, "*.json"))
        
        # Архивы с ошибками
        error_dir = os.path.join(ARCHIVES_QUEUE_DIR, "errors")
        error_files = glob.glob(os.path.join(error_dir, "*.json")) if os.path.exists(error_dir) else []
        
        # Успешно отправленные
        sent_dir = os.path.join(ARCHIVES_QUEUE_DIR, "sent")
        sent_files = glob.glob(os.path.join(sent_dir, "*.json")) if os.path.exists(sent_dir) else []
        
        # Детальная информация о файлах в очереди
        pending_details = []
        for file_path in sorted(pending_files):
            file_stat = os.stat(file_path)
            file_size = file_stat.st_size
            
            # Пытаемся прочитать session_id из файла
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    session_id = data.get("session_id", "unknown")
                    server_url = data.get("metadata", {}).get("archive_server_url", "unknown")
            except:
                session_id = "error"
                server_url = "error"
            
            pending_details.append({
                "filename": os.path.basename(file_path),
                "session_id": session_id,
                "server_url": server_url,
                "size_bytes": file_size,
                "created": datetime.fromtimestamp(file_stat.st_ctime).isoformat()
            })
        
        return {
            "queue_status": {
                "pending": len(pending_files),
                "errors": len(error_files),
                "sent": len(sent_files)
            },
            "pending_archives": pending_details,
            "next_check": f"in {ARCHIVE_SENDER_INTERVAL} seconds"
        }
        
    except Exception as e:
        logger.error(f"Ошибка при получении статуса очереди: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/archives/retry/{filename}")
async def retry_archive_send(filename: str):
    """Повторить попытку отправки конкретного архива"""
    try:
        # Проверяем, есть ли файл в папке ошибок
        error_path = os.path.join(ARCHIVES_QUEUE_DIR, "errors", filename)
        queue_path = os.path.join(ARCHIVES_QUEUE_DIR, filename)
        
        if os.path.exists(error_path):
            # Перемещаем обратно в очередь
            os.rename(error_path, queue_path)
            logger.info(f"[RETRY] Архив {filename} возвращен в очередь")
            
            return {
                "status": "success",
                "message": f"Archive {filename} moved back to queue for retry"
            }
        else:
            raise HTTPException(status_code=404, detail=f"Archive {filename} not found in errors")
            
    except Exception as e:
        logger.error(f"Ошибка при повторной отправке: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/archives/clear-sent")
async def clear_sent_archives():
    """Очистить папку с успешно отправленными архивами"""
    try:
        sent_dir = os.path.join(ARCHIVES_QUEUE_DIR, "sent")
        if os.path.exists(sent_dir):
            files = glob.glob(os.path.join(sent_dir, "*.json"))
            for file in files:
                os.remove(file)
            
            return {
                "status": "success",
                "message": f"Cleared {len(files)} sent archives"
            }
        else:
            return {
                "status": "success",
                "message": "No sent archives to clear"
            }
            
    except Exception as e:
        logger.error(f"Ошибка при очистке отправленных архивов: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ТОЧКА ВХОДА ====================

if __name__ == "__main__":
    import uvicorn
    
    # Запускаем сервер
    uvicorn.run(
        "guardian_angel.api:app",  # Используем полный путь к модулю
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )