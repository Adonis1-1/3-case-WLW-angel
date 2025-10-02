"""
final_prediction_service.py

Production-ready сервис для анализа КТГ в реальном времени
Версия 2.2.0 - с поддержкой временных меток для всех событий
"""

import os
import pickle
import numpy as np
import pandas as pd
import asyncio
import aiosqlite
import json
import logging
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timedelta
from scipy import signal as scipy_signal
from scipy.stats import skew, kurtosis
from scipy.interpolate import interp1d
import warnings

warnings.filterwarnings('ignore')

__version__ = "2.2.0"
__author__ = "CTG Analysis Team"

# ============================================================================
# НАСТРОЙКА ЛОГИРОВАНИЯ
# ============================================================================
os.makedirs('logs', exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/ctg_analysis.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# ============================================================================
# КОНСТАНТЫ
# ============================================================================
ORIGINAL_SAMPLING_RATE = 1
TARGET_SAMPLING_RATE = 4
INTERPOLATION_FACTOR = TARGET_SAMPLING_RATE // ORIGINAL_SAMPLING_RATE

LONG_WINDOW_MINUTES = 10
SHORT_WINDOW_MINUTES = 0.25
LONG_WINDOW_SAMPLES = LONG_WINDOW_MINUTES * 60 * TARGET_SAMPLING_RATE
SHORT_WINDOW_SAMPLES = int(SHORT_WINDOW_MINUTES * 60 * TARGET_SAMPLING_RATE)

SHORT_PATTERN_MIN_DURATION = 5 * TARGET_SAMPLING_RATE
SHORT_PROLONGED_DURATION = 30 * TARGET_SAMPLING_RATE
ANALYSIS_INTERVAL_SECONDS = 15

# ============================================================================
# ЭКСТРАКТОР ПРИЗНАКОВ С ПОДДЕРЖКОЙ ИНТЕРПОЛЯЦИИ
# ============================================================================
class CTGFeatureExtractor:
    """
    Извлекает признаки из сырых данных КТГ с поддержкой интерполяции
    """
    def __init__(self, sampling_rate: int = TARGET_SAMPLING_RATE):
        self.sampling_rate = sampling_rate
        self.logger = logging.getLogger(f"{__name__}.CTGFeatureExtractor")
        
    def interpolate_signal(self, signal_1hz: np.ndarray) -> np.ndarray:
        if len(signal_1hz) < 2:
            return signal_1hz
        x_original = np.arange(len(signal_1hz))
        x_interpolated = np.linspace(0, len(signal_1hz) - 1, len(signal_1hz) * INTERPOLATION_FACTOR)
        f = interp1d(x_original, signal_1hz, kind='linear', fill_value='extrapolate')
        return f(x_interpolated)
    
    def extract_features(self, fhr: np.ndarray, uc: np.ndarray, window_type: str = 'long') -> Dict[str, float]:
        features = {}
        min_pattern_duration = SHORT_PATTERN_MIN_DURATION if window_type == 'short' else 15 * self.sampling_rate
        prolonged_duration = SHORT_PROLONGED_DURATION if window_type == 'short' else 90 * self.sampling_rate
        
        signal_loss_mask = (fhr == 0) | (fhr < 50) | (fhr > 210)
        signal_loss_ratio = np.sum(signal_loss_mask) / len(fhr) if len(fhr) > 0 else 0
        features['signal_loss_ratio'] = signal_loss_ratio
        
        fhr_clean = self._clean_signal(fhr, signal_loss_mask)
        baseline = self._calculate_baseline(fhr_clean)
        
        features.update({
            'baseline_bpm': baseline,
            'fhr_median': baseline,
            'fhr_mean': np.mean(fhr_clean),
            'fhr_std': np.std(fhr_clean),
            'fhr_min': np.min(fhr_clean),
            'fhr_max': np.max(fhr_clean),
            'fhr_q25': np.percentile(fhr_clean, 25),
            'fhr_q75': np.percentile(fhr_clean, 75),
            'fhr_iqr': np.percentile(fhr_clean, 75) - np.percentile(fhr_clean, 25),
            'stv': self._calculate_stv(fhr_clean),
            'ltv': self._calculate_stv(fhr_clean) * 2 if window_type == 'short' else self._calculate_ltv(fhr_clean),
            'variability': self._calculate_stv(fhr_clean) * 2 if window_type == 'short' else self._calculate_ltv(fhr_clean)
        })
        
        patterns = self._detect_patterns(fhr_clean, baseline, min_pattern_duration, prolonged_duration)
        features.update(patterns)
        
        uc_clean = uc[uc > 0] if len(uc) > 0 and np.any(uc > 0) else np.array([0])
        features.update({
            'uc_mean': np.mean(uc_clean),
            'uc_max': np.max(uc_clean),
            'uc_std': np.std(uc_clean),
            'fhr_entropy': self._calculate_entropy(fhr_clean),
            'fhr_skewness': skew(fhr_clean) if len(fhr_clean) > 1 else 0,
            'fhr_kurtosis': kurtosis(fhr_clean) if len(fhr_clean) > 1 else 0,
            'accelerations': patterns.get('accelerations_count', 0),
            'decelerations': patterns.get('decelerations_count', 0)
        })
        
        return features
    
    def _clean_signal(self, fhr: np.ndarray, signal_loss_mask: np.ndarray) -> np.ndarray:
        clean_fhr = np.copy(fhr)
        valid_mask = ~signal_loss_mask
        if np.sum(valid_mask) > 0:
            median_val = np.median(fhr[valid_mask])
            clean_fhr[signal_loss_mask] = median_val
        return clean_fhr
    
    def _calculate_baseline(self, fhr: np.ndarray) -> float:
        if len(fhr) == 0:
            return 140
        p10, p90 = np.percentile(fhr, [10, 90])
        trimmed = fhr[(fhr >= p10) & (fhr <= p90)]
        return np.median(trimmed) if len(trimmed) > 0 else np.median(fhr)
    
    def _calculate_stv(self, fhr: np.ndarray) -> float:
        return np.mean(np.abs(np.diff(fhr))) if len(fhr) >= 2 else 0
    
    def _calculate_ltv(self, fhr: np.ndarray) -> float:
        if len(fhr) < 10:
            return self._calculate_stv(fhr) * 2
        p5, p95 = np.percentile(fhr, [5, 95])
        trimmed = fhr[(fhr >= p5) & (fhr <= p95)]
        return np.std(trimmed) if len(trimmed) > 10 else np.std(fhr)
    
    def _detect_patterns(self, fhr: np.ndarray, baseline: float, min_duration: int, prolonged_duration: int) -> Dict[str, int]:
        patterns = {}
        accel_threshold = baseline + 15
        decel_threshold = baseline - 15
        deep_threshold = baseline - 30
        
        above_accel = fhr > accel_threshold
        accel_segments = self._find_segments(above_accel, min_duration)
        patterns['accelerations_count'] = len(accel_segments)
        
        below_decel = fhr < decel_threshold
        decel_segments = self._find_segments(below_decel, min_duration)
        patterns['decelerations_count'] = len(decel_segments)
        
        deep_count = prolonged_count = 0
        for start, end in decel_segments:
            if np.min(fhr[start:end]) < deep_threshold:
                deep_count += 1
            if end - start >= prolonged_duration:
                prolonged_count += 1
        patterns['deep_decelerations_count'] = deep_count
        patterns['prolonged_decelerations'] = prolonged_count
        
        return patterns
    
    def _find_segments(self, mask: np.ndarray, min_length: int) -> List[Tuple[int, int]]:
        segments = []
        in_segment = False
        start = 0
        for i in range(len(mask)):
            if mask[i] and not in_segment:
                in_segment = True
                start = i
            elif not mask[i] and in_segment:
                in_segment = False
                if i - start >= min_length:
                    segments.append((start, i))
        if in_segment and len(mask) - start >= min_length:
            segments.append((start, len(mask)))
        return segments
    
    def _calculate_entropy(self, signal: np.ndarray, bins: int = 10) -> float:
        if len(signal) == 0:
            return 0
        hist, _ = np.histogram(signal, bins=bins)
        hist = hist[hist > 0]
        if len(hist) == 0:
            return 0
        probs = hist / np.sum(hist)
        return -np.sum(probs * np.log2(probs + 1e-10))

# ============================================================================
# КАЛЬКУЛЯТОР ШКАЛЫ ФИШЕРА С ПОВЫШЕННОЙ ЧУВСТВИТЕЛЬНОСТЬЮ
# ============================================================================
class FischerScoreCalculator:
    """
    Расчет баллов по шкале Фишера с повышенной чувствительностью к патологиям
    """
    def calculate(self, features: Dict[str, float]) -> Dict[str, Any]:
        scores = {}
        baseline = features.get('baseline_bpm', 140)
        scores['baseline'] = 2 if 110 <= baseline <= 160 else 1 if (100 <= baseline < 110 or 160 < baseline <= 170) else 0
        
        variability = features.get('variability', 0)
        scores['variability'] = 2 if variability >= 5 else 1 if variability >= 3 else 0
        
        accel_count = features.get('accelerations_count', 0)
        scores['accelerations'] = 2 if accel_count >= 2 else 1 if accel_count >= 1 else 0
        
        decel_count = features.get('decelerations_count', 0)
        deep_decel = features.get('deep_decelerations_count', 0)
        prolonged_decel = features.get('prolonged_decelerations', 0)
        scores['decelerations'] = 2 if decel_count == 0 else 1 if decel_count == 1 and deep_decel == 0 and prolonged_decel == 0 else 0
        
        scores['movements'] = scores['accelerations']
        total_score = sum(scores.values())
        
        interpretation, risk_category = ("Normal", "LOW") if total_score >= 8 else ("Suspicious", "MODERATE") if total_score >= 6 else ("Pathological", "HIGH")
        
        return {
            'total_score': total_score,
            'max_score': 10,
            'interpretation': interpretation,
            'risk_category': risk_category,
            'detailed_scores': scores
        }

# ============================================================================
# АНАЛИЗАТОР ТРЕНДОВ
# ============================================================================
class TrendAnalyzer:
    """
    Анализ трендов для оценки динамики состояния плода
    """
    def analyze(self, history_df: pd.DataFrame) -> Dict[str, Any]:
        if len(history_df) < LONG_WINDOW_SAMPLES:
            return {
                'status': 'insufficient_data',
                'description': 'Недостаточно данных для анализа тренда',
                'confidence': 0.0,
                'trend_score': 0.5,
                'baseline_change': 0,
                'recent_change': 0
            }
        
        fhr = history_df['fhr'].values
        third = len(fhr) // 3
        first_third_median = np.median(fhr[:third])
        middle_third_median = np.median(fhr[third:2*third])
        last_third_median = np.median(fhr[-third:])
        
        total_change = last_third_median - first_third_median
        recent_change = last_third_median - middle_third_median
        
        if abs(total_change) < 5:
            status, description, trend_score = 'stable', 'Стабильное состояние', 0.0
        elif total_change > 10:
            status, description, trend_score = 'increasing', 'Повышение базального ритма', 0.3
        elif total_change < -10:
            status, description, trend_score = 'decreasing', 'Снижение базального ритма', 0.4
        elif recent_change < -5:
            status, description, trend_score = 'deteriorating', 'Ухудшение в последнее время', 0.5
        else:
            status, description, trend_score = 'stable', 'Незначительные изменения', 0.1
        
        confidence = min(1.0, len(history_df) / LONG_WINDOW_SAMPLES)
        
        return {
            'status': status,
            'description': description,
            'confidence': confidence,
            'trend_score': trend_score,
            'baseline_change': total_change,
            'recent_change': recent_change
        }

# ============================================================================
# ГЛАВНЫЙ СЕРВИС ПРЕДСКАЗАНИЙ С АСИНХРОННОЙ ПОДДЕРЖКОЙ
# ============================================================================
class PredictionService:
    """
    Главный сервис для анализа КТГ с поддержкой реального времени
    """
    def __init__(self, model_path: str = "ml_model.pkl", db_path: str = "guardian_angel_data.db"):
        self.logger = logging.getLogger(f"{__name__}.PredictionService")
        self.feature_extractor = CTGFeatureExtractor()
        self.fischer_calculator = FischerScoreCalculator()
        self.trend_analyzer = TrendAnalyzer()
        self.db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), db_path) if db_path else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'guardian_angel_data.db')
        self.model_path = model_path
        self.model = None
        self.scaler = None
        self.model_available = False
        self.model_threshold = 0.5
        self.feature_names = None
        self._load_ml_model(model_path)
        self.last_analysis_result = {}
        self.analysis_history = []
        self.version = __version__
        self.initialized_at = datetime.now()
        self.logger.info(f"PredictionService v{self.version} initialized")
        self.logger.info(f"ML Model: {'Loaded' if self.model_available else 'Not Available'}")
    
    def _load_ml_model(self, model_path: str):
        try:
            if os.path.exists(model_path):
                with open(model_path, 'rb') as f:
                    model_data = pickle.load(f)
                self.model = model_data.get('model')
                self.scaler = model_data.get('scaler')
                self.model_threshold = model_data.get('optimal_threshold', 0.5)
                if hasattr(self.scaler, 'feature_names_in_'):
                    self.feature_names = self.scaler.feature_names_in_
                self.model_available = True
                self.logger.info(f"ML model loaded from {model_path}")
            else:
                self.logger.warning(f"ML model file not found: {model_path}")
        except Exception as e:
            self.logger.error(f"Error loading ML model: {e}")
            self.model_available = False
    
    async def get_data_from_db(self, limit: int = 600) -> pd.DataFrame:
        async with aiosqlite.connect(self.db_path) as db:
            query = """
            SELECT ts, bpm_time as time_sec, bpm_value as fhr, uterus_value as uc
            FROM ctg_data
            ORDER BY id DESC
            LIMIT ?
            """
            async with db.execute(query, (limit,)) as cursor:
                rows = await cursor.fetchall()
                if not rows:
                    return pd.DataFrame()
                df = pd.DataFrame(rows, columns=['ts', 'time_sec', 'fhr', 'uc'])
                return df.iloc[::-1].reset_index(drop=True)
    
    async def save_analysis_result(self, result: Dict[str, Any]):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute('''
                CREATE TABLE IF NOT EXISTS analysis_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts INTEGER,
                    fwbs REAL,
                    action_priority TEXT,
                    urgency_level INTEGER,
                    baseline_fhr REAL,
                    variability REAL,
                    accelerations INTEGER,
                    decelerations INTEGER,
                    signal_quality REAL,
                    ml_probability REAL,
                    fischer_score INTEGER,
                    trend_status TEXT,
                    full_result TEXT
                )
            ''')
            await db.execute('''
                INSERT INTO analysis_results (
                    ts, fwbs, action_priority, urgency_level,
                    baseline_fhr, variability, accelerations, decelerations,
                    signal_quality, ml_probability, fischer_score, trend_status,
                    full_result
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                int(datetime.now().timestamp()),
                result.get('fetal_wellbeing_index', 0),
                result.get('action_priority', 'UNKNOWN'),
                result.get('urgency_level', 0),
                result.get('baseline_fhr', 0),
                result.get('variability', 0),
                result.get('accelerations', 0),
                result.get('decelerations', 0),
                result.get('signal_quality', 0),
                result.get('ml_probability', 0),
                result.get('fischer_score', 0),
                result.get('trend_status', 'unknown'),
                json.dumps(result)
            ))
            await db.commit()
            self.logger.info("Analysis result saved to database")
    
    def _predict_with_ml(self, features: Dict[str, float]) -> Dict[str, Any]:
        if not self.model_available:
            self.logger.warning("ML model unavailable, falling back to expert rules")
            return self._predict_with_rules(features)
        try:
            self.logger.info(f"Expected features: {self.feature_names}")
            self.logger.info(f"Provided features: {list(features.keys())}")
            if self.feature_names is not None:
                feature_vector = np.array([features.get(name, 0) for name in self.feature_names])
                if len(feature_vector) != len(self.feature_names):
                    self.logger.error(f"Feature vector length mismatch: expected {len(self.feature_names)}, got {len(feature_vector)}")
                    return self._predict_with_rules(features)
            else:
                feature_vector = np.array([features[key] for key in sorted(features.keys())])
            
            self.logger.info(f"Feature vector: {feature_vector}")
            self.logger.info(f"Feature vector shape: {feature_vector.shape}")
            feature_scaled = self.scaler.transform(feature_vector.reshape(1, -1))
            probability = self.model.predict_proba(feature_scaled)[0, 1]
            risk_level = "CRITICAL" if probability > 0.75 else "HIGH" if probability > 0.5 else "MODERATE" if probability > 0.25 else "LOW"
            return {
                'hypoxia_probability': float(probability),
                'risk_level': risk_level,
                'confidence': 0.95,
                'method': 'ml_model'
            }
        except Exception as e:
            self.logger.error(f"ML prediction failed: {e}")
            return self._predict_with_rules(features)
    
    def _predict_with_rules(self, features: Dict[str, float]) -> Dict[str, Any]:
        risk_score = 0.0
        risk_factors = []
        baseline = features.get('baseline_bpm', 140)
        variability = features.get('variability', 10)
        accelerations = features.get('accelerations_count', 0)
        decelerations = features.get('decelerations_count', 0)
        deep_decels = features.get('deep_decelerations_count', 0)
        prolonged_decels = features.get('prolonged_decelerations', 0)
        
        if baseline < 100:
            risk_score += 0.8
            risk_factors.append(f"Критическая брадикардия: {baseline:.0f} bpm")
        elif baseline < 110:
            risk_score += 0.5
            risk_factors.append(f"Брадикардия: {baseline:.0f} bpm")
        if baseline > 170:
            risk_score += 0.7
            risk_factors.append(f"Выраженная тахикардия: {baseline:.0f} bpm")
        elif baseline > 160:
            risk_score += 0.4
            risk_factors.append(f"Тахикардия: {baseline:.0f} bpm")
        if variability < 2:
            risk_score += 0.7
            risk_factors.append(f"Критически низкая вариабельность: {variability:.1f} bpm")
        elif variability < 3:
            risk_score += 0.5
            risk_factors.append(f"Сниженная вариабельность: {variability:.1f} bpm")
        elif variability < 5:
            risk_score += 0.3
            risk_factors.append(f"Пограничная вариабельность: {variability:.1f} bpm")
        if accelerations == 0:
            risk_score += 0.4
            risk_factors.append("Отсутствие акселераций")
        if decelerations >= 3:
            risk_score += 0.5
            risk_factors.append(f"Множественные децелерации: {decelerations}")
        elif decelerations >= 1:
            risk_score += 0.3
            risk_factors.append(f"Децелерации: {decelerations}")
        if deep_decels > 0:
            risk_score += 0.5
            risk_factors.append(f"Глубокие децелерации: {deep_decels}")
        if prolonged_decels > 0:
            risk_score += 0.6
            risk_factors.append(f"Пролонгированные децелерации: {prolonged_decels}")
        
        probability = min(1.0, risk_score)
        risk_level = "CRITICAL" if probability > 0.6 else "HIGH" if probability > 0.4 else "MODERATE" if probability > 0.2 else "LOW"
        
        if risk_factors:
            self.logger.warning(f"Обнаружены факторы риска: {'; '.join(risk_factors)}")
        
        return {
            'hypoxia_probability': probability,
            'risk_level': risk_level,
            'confidence': 0.85,
            'method': 'expert_rules',
            'risk_factors': risk_factors
        }
    
    def _calculate_fwbs(self, fischer_result: Dict, ml_result: Dict, trend_result: Dict, signal_quality: float, clinical_risks: int) -> float:
        fwbs = 100.0
        rule_weight = 0.7 if ml_result['method'] == 'expert_rules' else 0.6
        fischer_weight = 0.3 if ml_result['method'] == 'expert_rules' else 0.2
        
        fischer_penalty = (10 - fischer_result['total_score']) * 2
        fwbs -= fischer_penalty * fischer_weight
        ml_penalty = ml_result['hypoxia_probability'] * 100
        fwbs -= ml_penalty * rule_weight
        if trend_result['status'] != 'insufficient_data':
            trend_penalty = trend_result.get('trend_score', 0) * 40
            fwbs -= trend_penalty * 0.2
        if 'risk_factors' in ml_result:
            for factor in ml_result['risk_factors']:
                if 'Критическая' in factor:
                    fwbs -= 20
                elif 'Выраженная' in factor:
                    fwbs -= 15
                elif 'Сниженная вариабельность' in factor:
                    fwbs -= 10
        if signal_quality < 0.5:
            fwbs -= 10
        elif signal_quality < 0.7:
            fwbs -= 5
        fwbs -= clinical_risks * 3
        return max(0, min(100, fwbs))
    
    def _determine_priority(self, fwbs: float) -> Tuple[str, int, str]:
        if fwbs >= 80:
            return ("NORMAL", 1, "Продолжить стандартное наблюдение")
        elif fwbs >= 65:
            return ("ATTENTION", 2, "Усилить наблюдение, повторная оценка через 5 минут")
        elif fwbs >= 50:
            return ("WARNING", 3, "Требуется осмотр врача в течение 10 минут")
        elif fwbs >= 35:
            return ("URGENT", 4, "Немедленный осмотр врача")
        else:
            return ("CRITICAL", 5, "Экстренное вмешательство")
    
    def _detect_clinical_patterns(self, features: Dict, signal_quality: float, 
                              start_time: datetime = None) -> List[Dict]:
        """
        Обнаружение клинических паттернов с временными метками
        """
        patterns = []
        current_time = start_time if start_time else datetime.now()
        
        # Словарь переводов паттернов
        PATTERN_TRANSLATIONS = {
            'prolonged_deceleration': 'Пролонгированная децелерация',
            'repeated_deep_decelerations': 'Повторные глубокие децелерации',
            'reduced_variability': 'Сниженная вариабельность',
            'absent_accelerations': 'Отсутствие акселераций',
            'bradycardia': 'Брадикардия',
            'tachycardia': 'Тахикардия',
            'poor_signal_quality': 'Низкое качество сигнала'
        }
        
        if features.get('prolonged_decelerations', 0) > 0:
            pattern_type = 'prolonged_deceleration'
            patterns.append({
                'type': pattern_type,
                'name': PATTERN_TRANSLATIONS.get(pattern_type, pattern_type),
                'severity': 'high',
                'count': features['prolonged_decelerations'],
                'detected_at': current_time.isoformat(),
                'detected_at_readable': current_time.strftime('%H:%M:%S'),
                'clinical_significance': 'Требует немедленного внимания'
            })
        
        if features.get('deep_decelerations_count', 0) > 1:
            pattern_type = 'repeated_deep_decelerations'
            patterns.append({
                'type': pattern_type,
                'name': PATTERN_TRANSLATIONS.get(pattern_type, pattern_type),
                'severity': 'high',
                'count': features['deep_decelerations_count'],
                'detected_at': current_time.isoformat(),
                'detected_at_readable': current_time.strftime('%H:%M:%S'),
                'clinical_significance': 'Возможная компрессия пуповины'
            })
        
        variability = features.get('variability', 10)
        if variability < 4:
            pattern_type = 'reduced_variability'
            patterns.append({
                'type': pattern_type,
                'name': PATTERN_TRANSLATIONS.get(pattern_type, pattern_type),
                'severity': 'high' if variability < 2 else 'moderate',
                'value': variability,
                'detected_at': current_time.isoformat(),
                'detected_at_readable': current_time.strftime('%H:%M:%S'),
                'clinical_significance': 'Возможное угнетение ЦНС плода'
            })
        
        if features.get('accelerations_count', 0) == 0:
            pattern_type = 'absent_accelerations'
            patterns.append({
                'type': pattern_type,
                'name': PATTERN_TRANSLATIONS.get(pattern_type, pattern_type),
                'severity': 'moderate',
                'detected_at': current_time.isoformat(),
                'detected_at_readable': current_time.strftime('%H:%M:%S'),
                'clinical_significance': 'Снижение реактивности плода'
            })
        
        baseline = features.get('baseline_bpm', 140)
        if baseline < 110 and baseline > 0:
            pattern_type = 'bradycardia'
            patterns.append({
                'type': pattern_type,
                'name': PATTERN_TRANSLATIONS.get(pattern_type, pattern_type),
                'severity': 'high' if baseline < 100 else 'moderate',
                'value': baseline,
                'detected_at': current_time.isoformat(),
                'detected_at_readable': current_time.strftime('%H:%M:%S'),
                'clinical_significance': 'Возможная гипоксия'
            })
        
        if baseline > 160:
            pattern_type = 'tachycardia'
            patterns.append({
                'type': pattern_type,
                'name': PATTERN_TRANSLATIONS.get(pattern_type, pattern_type),
                'severity': 'high' if baseline > 170 else 'moderate',
                'value': baseline,
                'detected_at': current_time.isoformat(),
                'detected_at_readable': current_time.strftime('%H:%M:%S'),
                'clinical_significance': 'Возможная инфекция или гипоксия'
            })
        
        if signal_quality < 0.6:
            pattern_type = 'poor_signal_quality'
            patterns.append({
                'type': pattern_type,
                'name': PATTERN_TRANSLATIONS.get(pattern_type, pattern_type),
                'severity': 'low',
                'value': signal_quality,
                'detected_at': current_time.isoformat(),
                'detected_at_readable': current_time.strftime('%H:%M:%S'),
                'clinical_significance': 'Требуется переустановка датчиков'
            })
        
        return patterns

    def get_graph_data(self, fhr_4hz: np.ndarray, baseline: float, 
                      start_time: datetime = None) -> Dict[str, Any]:
        """
        Подготовка данных для графика с детальными временными метками
        """
        if start_time is None:
            start_time = datetime.now()
        
        timestamps = [(start_time + timedelta(seconds=i * 0.25)).isoformat() 
                     for i in range(len(fhr_4hz))]
        
        brady_threshold = 110
        tachy_threshold = 160
        severe_tachy_threshold = 170
        accel_threshold = baseline + 15
        decel_threshold = baseline - 15
        deep_decel_threshold = baseline - 30
        
        anomaly_zones = []
        current_anomaly = None
        anomaly_start_idx = None
        anomaly_severity = None
        
        for i, value in enumerate(fhr_4hz):
            anomaly_type = None
            severity = None
            
            if value == 0 or value < 50 or value > 210:
                anomaly_type = 'signal_loss'
                severity = 'warning'
            elif value < brady_threshold:
                anomaly_type = 'bradycardia'
                severity = 'critical' if value < 100 else 'high'
            elif value > severe_tachy_threshold:
                anomaly_type = 'severe_tachycardia'
                severity = 'critical'
            elif value > tachy_threshold:
                anomaly_type = 'tachycardia'
                severity = 'high'
            elif value > accel_threshold:
                anomaly_type = 'acceleration'
                severity = 'good'
            elif value < deep_decel_threshold:
                anomaly_type = 'deep_deceleration'
                severity = 'critical'
            elif value < decel_threshold:
                anomaly_type = 'deceleration'
                severity = 'high'
            
            if anomaly_type != current_anomaly:
                if current_anomaly is not None and anomaly_start_idx is not None:
                    end_idx = i - 1
                    duration_seconds = (end_idx - anomaly_start_idx + 1) * 0.25
                    
                    if duration_seconds >= 1.0:
                        zone_start_time = start_time + timedelta(seconds=anomaly_start_idx * 0.25)
                        zone_end_time = start_time + timedelta(seconds=end_idx * 0.25)
                        
                        anomaly_zones.append({
                            'type': current_anomaly,
                            'severity': anomaly_severity,
                            'start_time': zone_start_time.isoformat(),
                            'end_time': zone_end_time.isoformat(),
                            'start_time_readable': zone_start_time.strftime('%H:%M:%S'),
                            'end_time_readable': zone_end_time.strftime('%H:%M:%S'),
                            'start_index': anomaly_start_idx,
                            'end_index': end_idx,
                            'duration_seconds': round(duration_seconds, 1),
                            'min_value': float(np.min(fhr_4hz[anomaly_start_idx:end_idx+1])),
                            'max_value': float(np.max(fhr_4hz[anomaly_start_idx:end_idx+1])),
                            'color': self._get_anomaly_color(current_anomaly, anomaly_severity)
                        })
                
                if anomaly_type is not None:
                    current_anomaly = anomaly_type
                    anomaly_severity = severity
                    anomaly_start_idx = i
                else:
                    current_anomaly = None
                    anomaly_start_idx = None
                    anomaly_severity = None
        
        if current_anomaly is not None and anomaly_start_idx is not None:
            end_idx = len(fhr_4hz) - 1
            duration_seconds = (end_idx - anomaly_start_idx + 1) * 0.25
            
            if duration_seconds >= 1.0:
                zone_start_time = start_time + timedelta(seconds=anomaly_start_idx * 0.25)
                zone_end_time = start_time + timedelta(seconds=end_idx * 0.25)
                
                anomaly_zones.append({
                    'type': current_anomaly,
                    'severity': anomaly_severity,
                    'start_time': zone_start_time.isoformat(),
                    'end_time': zone_end_time.isoformat(),
                    'start_time_readable': zone_start_time.strftime('%H:%M:%S'),
                    'end_time_readable': zone_end_time.strftime('%H:%M:%S'),
                    'start_index': anomaly_start_idx,
                    'end_index': end_idx,
                    'duration_seconds': round(duration_seconds, 1),
                    'min_value': float(np.min(fhr_4hz[anomaly_start_idx:end_idx+1])),
                    'max_value': float(np.max(fhr_4hz[anomaly_start_idx:end_idx+1])),
                    'color': self._get_anomaly_color(current_anomaly, anomaly_severity)
                })
        
        anomaly_stats = {}
        for zone in anomaly_zones:
            zone_type = zone['type']
            if zone_type not in anomaly_stats:
                anomaly_stats[zone_type] = {
                    'count': 0,
                    'total_duration': 0,
                    'episodes': []
                }
            anomaly_stats[zone_type]['count'] += 1
            anomaly_stats[zone_type]['total_duration'] += zone['duration_seconds']
            anomaly_stats[zone_type]['episodes'].append({
                'time': f"{zone['start_time_readable']} - {zone['end_time_readable']}",
                'duration': f"{zone['duration_seconds']} сек",
                'severity': zone['severity'],
                'values': f"{zone['min_value']:.0f}-{zone['max_value']:.0f} bpm"
            })
        
        return {
            'timestamps': timestamps,
            'fhr_values': fhr_4hz.tolist(),
            'baseline': baseline,
            'normal_range': {'min': 110, 'max': 160},
            'anomaly_zones': anomaly_zones,
            'anomaly_statistics': anomaly_stats,
            'total_duration_seconds': len(fhr_4hz) * 0.25,
            'sampling_rate': 4,
            'analysis_period': {
                'start': start_time.isoformat(),
                'end': (start_time + timedelta(seconds=len(fhr_4hz) * 0.25)).isoformat(),
                'start_readable': start_time.strftime('%Y-%m-%d %H:%M:%S'),
                'end_readable': (start_time + timedelta(seconds=len(fhr_4hz) * 0.25)).strftime('%H:%M:%S')
            }
        }
    
    def _get_anomaly_color(self, anomaly_type: str, severity: str) -> str:
        colors = {
            'acceleration': '#00ff00',
            'normal': '#90ee90',
            'deceleration': '#ff6b6b',
            'deep_deceleration': '#cc0000',
            'bradycardia': '#800020',
            'tachycardia': '#ff9500',
            'severe_tachycardia': '#ff4500',
            'signal_loss': '#808080',
            'unknown': '#ffff00'
        }
        return colors.get(anomaly_type, '#ffff00')
    
    async def analyze(self, timeseries_data: pd.DataFrame = None, 
                     clinical_data: Optional[Dict[str, Any]] = None, 
                     include_graph_data: bool = False,
                     analysis_type: str = 'full') -> Dict[str, Any]:
        """
        Главный метод анализа с исправленным расчетом времени
        
        Args:
            timeseries_data: DataFrame с данными КТГ
            clinical_data: Клинические данные пациента
            include_graph_data: Включить данные для графика
            analysis_type: Тип анализа ('full' или 'short_term')
        """
        # Фиксируем время начала анализа
        analysis_start_time = datetime.now()

        # Получение данных
        if timeseries_data is None:
            timeseries_data = await self.get_data_from_db(limit=600)
        
        if timeseries_data is None or len(timeseries_data) < 15:
            return {
                'type': 'analysis_update',
                'error': True,
                'message': 'Недостаточно данных для анализа',
                'fetal_wellbeing_index': 0,
                'action_priority': 'ERROR',
                'timestamp': datetime.now().isoformat()
            }
        
        # Определяем время начала данных
        if 'timestamp' in timeseries_data.columns:
            data_start_time = pd.to_datetime(timeseries_data.iloc[0]['timestamp'])
        elif 'ts' in timeseries_data.columns:
            data_start_time = datetime.fromtimestamp(timeseries_data.iloc[0]['ts'])
        else:
            data_start_time = datetime.now() - timedelta(seconds=len(timeseries_data))
        
        # Интерполяция данных
        if 'fhr' in timeseries_data.columns:
            fhr_1hz = timeseries_data['fhr'].values
            uc_1hz = timeseries_data['uc'].values if 'uc' in timeseries_data else np.zeros_like(fhr_1hz)
            fhr_4hz = self.feature_extractor.interpolate_signal(fhr_1hz)
            uc_4hz = self.feature_extractor.interpolate_signal(uc_1hz)
            self.logger.info(f"Data interpolated: {len(fhr_1hz)} samples @ 1Hz -> {len(fhr_4hz)} samples @ 4Hz")
        else:
            return {
                'type': 'analysis_update',
                'error': True,
                'message': 'Неверный формат данных',
                'fetal_wellbeing_index': 0,
                'action_priority': 'ERROR',
                'timestamp': datetime.now().isoformat()
            }
        
        # Извлечение признаков
        if len(fhr_4hz) >= LONG_WINDOW_SAMPLES:
            fhr_long = fhr_4hz[-LONG_WINDOW_SAMPLES:]
            uc_long = uc_4hz[-LONG_WINDOW_SAMPLES:]
            features_long = self.feature_extractor.extract_features(fhr_long, uc_long, 'long')
            trend_df = pd.DataFrame({'fhr': fhr_long})
            trend_result = self.trend_analyzer.analyze(trend_df)
        else:
            features_long = self.feature_extractor.extract_features(fhr_4hz, uc_4hz, 'short')
            trend_result = {
                'status': 'insufficient_data',
                'description': 'Недостаточно данных для тренда',
                'confidence': 0.0,
                'trend_score': 0.1,
                'baseline_change': 0,
                'recent_change': 0
            }
        
        if len(fhr_4hz) >= SHORT_WINDOW_SAMPLES:
            fhr_short = fhr_4hz[-SHORT_WINDOW_SAMPLES:]
            uc_short = uc_4hz[-SHORT_WINDOW_SAMPLES:]
            features_short = self.feature_extractor.extract_features(fhr_short, uc_short, 'short')
        else:
            features_short = features_long
        
        # Проверка типа анализа - если требуется только краткосрочный
        if analysis_type == 'short_term':
            # Формируем упрощенный результат только с краткосрочными данными
            decelerations = features_short.get('decelerations_count', 0)
            deep_decelerations = features_short.get('deep_decelerations_count', 0)
            prolonged_decelerations = features_short.get('prolonged_decelerations', 0)
            
            # Быстрая оценка приоритета на основе краткосрочных данных
            if prolonged_decelerations > 0 or deep_decelerations > 1:
                priority = 'CRITICAL'
                risk_level = 'HIGH'
            elif deep_decelerations > 0 or decelerations > 2:
                priority = 'WARNING'
                risk_level = 'MODERATE'
            elif decelerations > 0:
                priority = 'ATTENTION'
                risk_level = 'LOW'
            else:
                priority = 'NORMAL'
                risk_level = 'LOW'
            
            processing_time_seconds = (datetime.now() - analysis_start_time).total_seconds()
            
            return {
                'type': 'short_term_analysis',
                'analysis_type': 'short_term',
                'decelerations': {
                    'total': decelerations,
                    'deep': deep_decelerations,
                    'prolonged': prolonged_decelerations
                },
                'priority': priority,
                'risk_level': risk_level,
                'features': {
                    'baseline_bpm': round(features_short.get('baseline_bpm', 0), 1),
                    'variability': round(features_short.get('variability', 0), 1),
                    'accelerations': features_short.get('accelerations_count', 0),
                    'signal_loss_ratio': round(features_short.get('signal_loss_ratio', 0), 3)
                },
                'timestamp': datetime.now().isoformat(),
                'timestamp_readable': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'processing_time_ms': round(processing_time_seconds * 1000, 1),
                'data_window_seconds': len(fhr_short) / TARGET_SAMPLING_RATE
            }
        
        # Полный анализ (выполняется только если analysis_type == 'full')
        fischer_result = self.fischer_calculator.calculate(features_long)
        ml_result = self._predict_with_ml(features_long)
        clinical_risks = len(clinical_data.get('risk_factors', [])) if clinical_data else 0
        signal_quality = 1.0 - features_long.get('signal_loss_ratio', 0)
        detected_patterns = self._detect_clinical_patterns(features_short, signal_quality, data_start_time)
        
        # Расчет весов для FWBS
        rule_weight = 0.7 if ml_result['method'] == 'expert_rules' else 0.6
        fischer_weight = 0.3 if ml_result['method'] == 'expert_rules' else 0.2
        
        # Расчет FWBS и приоритета
        fwbs = self._calculate_fwbs(fischer_result, ml_result, trend_result, signal_quality, clinical_risks)
        action_priority, urgency_level, recommendation = self._determine_priority(fwbs)
        
        # Подготовка данных графика
        graph_data = None
        if include_graph_data and len(fhr_4hz) > 0:
            graph_data = self.get_graph_data(fhr_4hz, features_long['baseline_bpm'], data_start_time)
        
        # Правильный расчет времени обработки
        processing_time_seconds = (datetime.now() - analysis_start_time).total_seconds()
        
        # Формирование результата
        result = {
            'type': 'analysis_update',
            'analysis_type': 'full',
            'fetal_wellbeing_index': round(fwbs, 1),
            'action_priority': action_priority,
            'urgency_level': urgency_level,
            'recommendation': recommendation,
            'expert_assessments': {
                'fischer': {
                    'total_score': fischer_result['total_score'],
                    'max_score': fischer_result['max_score'],
                    'interpretation': fischer_result['interpretation'],
                    'risk_category': fischer_result['risk_category'],
                    'weight_in_fwbs': f'{fischer_weight*100:.0f}%',
                    'components': fischer_result['detailed_scores']
                },
                'ml_model': {
                    'hypoxia_probability': round(ml_result['hypoxia_probability'], 3),
                    'risk_level': ml_result['risk_level'],
                    'confidence': round(ml_result['confidence'], 2),
                    'method': ml_result['method'],
                    'weight_in_fwbs': f'{rule_weight*100:.0f}%',
                    'model_available': self.model_available,
                    'risk_factors': ml_result.get('risk_factors', [])
                },
                'trend': {
                    'status': trend_result['status'],
                    'description': trend_result['description'],
                    'confidence': round(trend_result['confidence'], 2),
                    'baseline_change': round(trend_result.get('baseline_change', 0), 1),
                    'weight_in_fwbs': '20%'
                }
            },
            'key_metrics': {
                'baseline_fhr': round(features_long['baseline_bpm'], 1),
                'variability': round(features_long['variability'], 1),
                'accelerations': features_short.get('accelerations_count', 0),
                'decelerations': features_short.get('decelerations_count', 0),
                'deep_decelerations': features_short.get('deep_decelerations_count', 0),
                'prolonged_decelerations': features_short.get('prolonged_decelerations', 0),
                'signal_quality': round(signal_quality, 2),
                'signal_loss_ratio': round(features_long.get('signal_loss_ratio', 0), 3)
            },
            'detected_patterns': detected_patterns,
            'detected_patterns_count': len(detected_patterns),
            'metadata': {
                'analysis_timestamp': datetime.now().isoformat(),
                'analysis_timestamp_readable': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'service_version': self.version,
                'analysis_window_minutes': len(fhr_4hz) / (TARGET_SAMPLING_RATE * 60),
                'processing_time_ms': round(processing_time_seconds * 1000, 1),
                'clinical_risk_factors_count': clinical_risks,
                'data_source': 'realtime' if timeseries_data is None else 'provided',
                'data_period': {
                    'start': data_start_time.isoformat(),
                    'end': (data_start_time + timedelta(seconds=len(fhr_1hz))).isoformat(),
                    'start_readable': data_start_time.strftime('%Y-%m-%d %H:%M:%S'),
                    'end_readable': (data_start_time + timedelta(seconds=len(fhr_1hz))).strftime('%Y-%m-%d %H:%M:%S'),
                    'duration_seconds': len(fhr_1hz)
                }
            },
            'fischer_score': fischer_result['total_score'],
            'ml_probability': round(ml_result['hypoxia_probability'], 3),
            'trend_status': trend_result['status'],
            'baseline_fhr': round(features_long['baseline_bpm'], 1),
            'variability': round(features_long['variability'], 1),
            'accelerations': features_short.get('accelerations_count', 0),
            'decelerations': features_short.get('decelerations_count', 0),
            'signal_quality': round(signal_quality, 2)
        }
        
        # Добавляем данные графика
        if graph_data:
            result['graph_data'] = graph_data
            
            # Добавляем сводку по времени аномалий
            if graph_data['anomaly_zones']:
                result['anomaly_timeline'] = []
                for zone in graph_data['anomaly_zones']:
                    result['anomaly_timeline'].append({
                        'type': zone['type'],
                        'severity': zone['severity'],
                        'time_range': f"{zone['start_time_readable']} - {zone['end_time_readable']}",
                        'duration': f"{zone['duration_seconds']} сек",
                        'values': f"{zone['min_value']:.0f}-{zone['max_value']:.0f} bpm"
                    })
        
        # Сохранение результата
        self.last_analysis_result = result
        self.analysis_history.append({
            'timestamp': datetime.now().isoformat(),
            'fwbs': result['fetal_wellbeing_index'],
            'priority': result['action_priority']
        })
        if len(self.analysis_history) > 100:
            self.analysis_history.pop(0)
        
        await self.save_analysis_result(result)
        self.logger.info(f"Analysis completed in {processing_time_seconds:.3f}s: FWBS={fwbs:.1f}, Priority={action_priority}")
        return result
    
    async def start_analysis_loop(self, websocket_callback=None):
        self.logger.info(f"Starting analysis loop (interval: {ANALYSIS_INTERVAL_SECONDS}s)")
        while True:
            try:
                result = await self.analyze(include_graph_data=True)
                if websocket_callback and not result.get('error'):
                    await websocket_callback(result)
                if result.get('action_priority') in ['CRITICAL', 'URGENT']:
                    self.logger.warning(f"⚠️ CRITICAL STATE DETECTED: {result.get('action_priority')}")
                    self.logger.warning(f"   Recommendation: {result.get('recommendation')}")
            except Exception as e:
                self.logger.error(f"Error in analysis loop: {e}")
            await asyncio.sleep(ANALYSIS_INTERVAL_SECONDS)

# ============================================================================
# ТЕСТОВЫЙ БЛОК
# ============================================================================
if __name__ == "__main__":
    async def test_service():
        print("\n" + "="*80)
        print("🏥 FINAL PREDICTION SERVICE v2.2 - Real-time CTG Analysis with Timeline")
        print("="*80)
        print("\n📦 Инициализация сервиса...")
        service = PredictionService(model_path="ml_model.pkl")
        
        print("\n📊 Генерация тестовых данных (1 Гц)...")
        n_samples_1hz = 60
        baseline = 140
        fhr_1hz = np.full(n_samples_1hz, baseline, dtype=float) + np.random.normal(0, 4, n_samples_1hz)
        fhr_1hz[30:40] += 20  # Акселерация
        fhr_1hz[45:50] -= 25  # Децелерация
        uc_1hz = np.random.uniform(10, 30, n_samples_1hz)
        fhr_1hz = np.clip(fhr_1hz, 50, 210)
        uc_1hz = np.clip(uc_1hz, 0, 100)
        
        # Создаем DataFrame с временными метками
        start_time = datetime.now() - timedelta(seconds=n_samples_1hz)
        test_data = pd.DataFrame({
            'fhr': fhr_1hz,
            'uc': uc_1hz,
            'timestamp': pd.date_range(start=start_time, periods=n_samples_1hz, freq='1s')
        })
        
        print(f"✅ Тестовые данные готовы")
        print(f"   • Длительность: {n_samples_1hz} секунд")
        print(f"   • Частота: 1 Гц")
        print(f"   • Baseline: ~{baseline} bpm")
        print(f"   • Акселерация: 30-40 сек")
        print(f"   • Децелерация: 45-50 сек")
        
        print("\n🔬 Запуск анализа...")
        result = await service.analyze(test_data, include_graph_data=True)
        
        if not result.get('error'):
            print("\n" + "="*80)
            print("📈 РЕЗУЛЬТАТЫ АНАЛИЗА")
            print("="*80)
            print(f"\n🎯 ГЛАВНЫЕ ПОКАЗАТЕЛИ:")
            print(f"   • Type: {result['type']}")
            print(f"   • FWBS: {result['fetal_wellbeing_index']}/100")
            print(f"   • Приоритет: {result['action_priority']}")
            print(f"   • Срочность: {result['urgency_level']}/5")
            print(f"   • Рекомендация: {result['recommendation']}")
            
            print(f"\n💓 МЕТРИКИ:")
            metrics = result['key_metrics']
            print(f"   • Baseline: {metrics['baseline_fhr']} bpm")
            print(f"   • Вариабельность: {metrics['variability']} bpm")
            print(f"   • Акселерации: {metrics['accelerations']}")
            print(f"   • Децелерации: {metrics['decelerations']}")
            print(f"   • Качество сигнала: {metrics['signal_quality']:.0%}")
            
            print(f"\n⚙️ МЕТАДАННЫЕ:")
            metadata = result['metadata']
            print(f"   • Время анализа: {metadata['analysis_timestamp_readable']}")
            print(f"   • Время обработки: {metadata['processing_time_ms']} мс")
            print(f"   • Окно анализа: {metadata['analysis_window_minutes']:.1f} минут")
            print(f"   • Период данных: {metadata['data_period']['start_readable']} - {metadata['data_period']['end_readable']}")
            
            if 'graph_data' in result:
                print(f"\n📊 ДАННЫЕ ГРАФИКА:")
                graph = result['graph_data']
                print(f"   • Период анализа: {graph['analysis_period']['start_readable']} - {graph['analysis_period']['end_readable']}")
                print(f"   • Длительность: {graph['total_duration_seconds']} сек")
                print(f"   • Обнаружено аномалий: {len(graph['anomaly_zones'])}")
                
                if graph['anomaly_zones']:
                    print(f"\n⏱️ ВРЕМЕННАЯ ШКАЛА АНОМАЛИЙ:")
                    for zone in graph['anomaly_zones']:
                        print(f"   • {zone['type'].upper()} ({zone['severity']})")
                        print(f"     Время: {zone['start_time_readable']} - {zone['end_time_readable']}")
                        print(f"     Длительность: {zone['duration_seconds']} сек")
                        print(f"     Значения: {zone['min_value']:.0f}-{zone['max_value']:.0f} bpm")
            
            if 'anomaly_timeline' in result:
                print(f"\n📅 СВОДКА АНОМАЛИЙ:")
                for anomaly in result['anomaly_timeline']:
                    print(f"   • {anomaly['type']}: {anomaly['time_range']} ({anomaly['duration']})")
                    print(f"     Диапазон значений: {anomaly['values']}")
            
            if 'detected_patterns' in result and result['detected_patterns']:
                print(f"\n🔍 ОБНАРУЖЕННЫЕ ПАТТЕРНЫ:")
                for pattern in result['detected_patterns']:
                    print(f"   • {pattern['type']} ({pattern['severity']})")
                    print(f"     Обнаружено в: {pattern.get('detected_at_readable', 'N/A')}")
                    print(f"     Значимость: {pattern['clinical_significance']}")
            
            print("\n" + "="*80)
            print("✅ Тест завершен успешно!")
        else:
            print(f"\n❌ Ошибка: {result['message']}")
        print("="*80)
    
    asyncio.run(test_service())