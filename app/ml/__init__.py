# app/ml/__init__.py
"""
Módulo de Machine Learning para análise de dispositivos CPE.

Componentes:
- LatencyPredictor: previsão de latência futura com base em histórico
- DropoutClassifier: classificação de risco de queda de conexão
- WifiQualityScorer: scoring de qualidade de WiFi
- NetworkAnalyzer: análise avançada de rede com detecção de anomalias
- LearningEngine: motor de aprendizado contínuo com feedback
"""

from app.ml.latency_predictor import LatencyPredictor
from app.ml.dropout_classifier import DropoutClassifier
from app.ml.wifi_quality_scorer import WifiQualityScorer
from app.ml.network_analyzer import NetworkAnalyzer, network_analyzer
from app.ml.learning_engine import LearningEngine, learning_engine

__all__ = [
    "LatencyPredictor",
    "DropoutClassifier", 
    "WifiQualityScorer",
    "NetworkAnalyzer",
    "network_analyzer",
    "LearningEngine",
    "learning_engine",
]
