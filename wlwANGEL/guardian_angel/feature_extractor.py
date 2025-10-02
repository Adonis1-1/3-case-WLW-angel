import numpy as np
import pandas as pd
from scipy import signal
from scipy.stats import skew, kurtosis
from typing import Dict
class CTGFeatureExtractor:
    """Класс для извлечения признаков из окон КТГ"""
    
    def __init__(self, window_size_min: int = 10, sampling_rate: int = 4):
        self.window_size_min = window_size_min
        self.sampling_rate = sampling_rate
        self.window_size_samples = window_size_min * 60 * sampling_rate
        
    def extract_features(self, fhr: np.ndarray, uc: np.ndarray) -> Dict[str, float]:
        """
        Извлекает признаки из окна КТГ
        
        Args:
            fhr: массив значений ЧСС
            uc: массив значений схваток
            
        Returns:
            Словарь с признаками
        """
        features = {}
        
        # Очистка FHR от артефактов (0 и экстремальных значений)
        fhr_clean = fhr[(fhr > 50) & (fhr < 210)]
        if len(fhr_clean) < len(fhr) * 0.5:  # Если больше 50% артефактов
            fhr_clean = fhr  # Используем исходные данные
        
        # === Базовые статистики ЧСС ===
        features['fhr_mean'] = np.mean(fhr_clean) if len(fhr_clean) > 0 else np.mean(fhr)
        features['fhr_std'] = np.std(fhr_clean) if len(fhr_clean) > 0 else np.std(fhr)
        features['fhr_min'] = np.min(fhr_clean) if len(fhr_clean) > 0 else np.min(fhr)
        features['fhr_max'] = np.max(fhr_clean) if len(fhr_clean) > 0 else np.max(fhr)
        features['fhr_median'] = np.median(fhr_clean) if len(fhr_clean) > 0 else np.median(fhr)
        features['fhr_q25'] = np.percentile(fhr_clean, 25) if len(fhr_clean) > 0 else np.percentile(fhr, 25)
        features['fhr_q75'] = np.percentile(fhr_clean, 75) if len(fhr_clean) > 0 else np.percentile(fhr, 75)
        features['fhr_iqr'] = features['fhr_q75'] - features['fhr_q25']
        
        # === Вариабельность ===
        # Short term variability (STV) - среднее абсолютное изменение между соседними точками
        fhr_diff = np.diff(fhr_clean) if len(fhr_clean) > 1 else np.diff(fhr)
        features['stv'] = np.mean(np.abs(fhr_diff)) if len(fhr_diff) > 0 else 0
        
        # Long term variability (LTV) - стандартное отклонение в минутных интервалах
        minute_samples = 60 * self.sampling_rate
        if len(fhr) >= minute_samples:
            minute_means = []
            for i in range(0, len(fhr) - minute_samples + 1, minute_samples):
                minute_means.append(np.mean(fhr[i:i+minute_samples]))
            features['ltv'] = np.std(minute_means) if len(minute_means) > 1 else 0
        else:
            features['ltv'] = features['fhr_std']
            
        # === Детекция паттернов ===
        baseline = features['fhr_median']
        
        # Акселерации (подъемы > 15 уд/мин от baseline длительностью > 15 сек)
        accel_threshold = baseline + 15
        accel_mask = fhr > accel_threshold
        features['accelerations_count'] = self._count_episodes(accel_mask, min_duration_sec=15)
        features['accelerations_time_ratio'] = np.sum(accel_mask) / len(fhr)
        
        # Децелерации (снижения > 15 уд/мин от baseline)
        decel_threshold = baseline - 15
        decel_mask = fhr < decel_threshold
        features['decelerations_count'] = self._count_episodes(decel_mask, min_duration_sec=15)
        features['decelerations_time_ratio'] = np.sum(decel_mask) / len(fhr)
        
        # Глубокие децелерации (> 30 уд/мин)
        deep_decel_mask = fhr < (baseline - 30)
        features['deep_decelerations_count'] = self._count_episodes(deep_decel_mask, min_duration_sec=10)
        
        # Пролонгированные децелерации (> 90 сек)
        features['prolonged_decelerations'] = self._count_episodes(decel_mask, min_duration_sec=90)
        
        # === Статистики по схваткам (UC) ===
        uc_clean = uc[uc >= 0]  # Убираем отрицательные значения
        if len(uc_clean) == 0:
            uc_clean = uc
            
        features['uc_mean'] = np.mean(uc_clean)
        features['uc_max'] = np.max(uc_clean)
        features['uc_std'] = np.std(uc_clean)
        
        # Детекция пиков схваток
        if len(uc) > 20:
            uc_smooth = signal.medfilt(uc, kernel_size=5)
            peaks, _ = signal.find_peaks(uc_smooth, height=np.percentile(uc_smooth, 75), distance=30*self.sampling_rate)
            features['uc_peak_count'] = len(peaks)
            features['uc_peak_rate_per_10min'] = len(peaks) * (10 / self.window_size_min)
        else:
            features['uc_peak_count'] = 0
            features['uc_peak_rate_per_10min'] = 0
            
        # === Дополнительные признаки ===
        # Энтропия (мера хаотичности сигнала)
        features['fhr_entropy'] = self._calculate_entropy(fhr_clean)
        
        # Асимметрия и эксцесс
        features['fhr_skewness'] = skew(fhr_clean) if len(fhr_clean) > 0 else 0
        features['fhr_kurtosis'] = kurtosis(fhr_clean) if len(fhr_clean) > 0 else 0
        
        # Процент потерянного сигнала
        features['signal_loss_ratio'] = 1 - (len(fhr_clean) / len(fhr))
        
        return features
    
    def _count_episodes(self, mask: np.ndarray, min_duration_sec: int) -> int:
        """Подсчет эпизодов с минимальной длительностью"""
        min_samples = min_duration_sec * self.sampling_rate
        episodes = 0
        current_episode_length = 0
        
        for val in mask:
            if val:
                current_episode_length += 1
            else:
                if current_episode_length >= min_samples:
                    episodes += 1
                current_episode_length = 0
                
        # Проверяем последний эпизод
        if current_episode_length >= min_samples:
            episodes += 1
            
        return episodes
    
    def _calculate_entropy(self, signal: np.ndarray, bins: int = 10) -> float:
        """Вычисление энтропии Шеннона"""
        if len(signal) == 0:
            return 0
        hist, _ = np.histogram(signal, bins=bins)
        hist = hist[hist > 0]  # Убираем нулевые бины
        if len(hist) == 0:
            return 0
        probs = hist / np.sum(hist)
        return -np.sum(probs * np.log2(probs + 1e-10))
