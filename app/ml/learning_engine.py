# app/ml/learning_engine.py
"""
Learning Engine - Motor de aprendizado contínuo.

Este módulo fornece:
- Aprendizado baseado em feedback
- Calibração automática de thresholds
- Detecção de drift de conceito
- Memória de padrões conhecidos
- Atualização de modelos em tempo real
"""

from __future__ import annotations

import json
import logging
import os
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import statistics

log = logging.getLogger("semppre-bridge.ml.learning")


@dataclass
class LearningEvent:
    """Evento de aprendizado."""
    event_id: str
    event_type: str
    device_id: Optional[str]
    timestamp: datetime
    data: Dict[str, Any]
    feedback: Optional[str] = None  # positive/negative/neutral
    applied: bool = False


@dataclass
class PatternMemory:
    """Padrão memorizado pelo sistema."""
    pattern_id: str
    pattern_type: str
    signature: Dict[str, Any]
    first_seen: datetime
    last_seen: datetime
    occurrence_count: int
    confidence: float
    associated_actions: List[str] = field(default_factory=list)
    outcomes: Dict[str, int] = field(default_factory=dict)  # outcome -> count


@dataclass
class ThresholdConfig:
    """Configuração de threshold adaptativo."""
    metric_name: str
    base_value: float
    current_value: float
    min_value: float
    max_value: float
    last_updated: datetime
    adjustment_history: List[Tuple[datetime, float, str]] = field(default_factory=list)


class LearningEngine:
    """
    Motor de aprendizado contínuo para o sistema de IA.
    
    Funcionalidades:
    - Aprende com feedback do operador
    - Ajusta thresholds automaticamente
    - Memoriza padrões conhecidos
    - Detecta drift de conceito
    - Persiste conhecimento em disco
    """
    
    def __init__(self, data_dir: str = "data/ml"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        # Memórias
        self._patterns: Dict[str, PatternMemory] = {}
        self._thresholds: Dict[str, ThresholdConfig] = {}
        self._learning_events: List[LearningEvent] = []
        self._metric_baselines: Dict[str, Dict[str, float]] = defaultdict(dict)
        
        # Contadores de performance
        self._prediction_accuracy: Dict[str, List[bool]] = defaultdict(list)
        self._false_positives: int = 0
        self._true_positives: int = 0
        
        # Carregar estado persistido
        self._load_state()
        
        log.info("LearningEngine inicializado com data_dir=%s", data_dir)
    
    # ============ Persistência ============
    
    def _load_state(self):
        """Carrega estado do disco."""
        try:
            # Carregar thresholds
            thresholds_file = self.data_dir / "thresholds.json"
            if thresholds_file.exists():
                with open(thresholds_file, "r") as f:
                    data = json.load(f)
                    for name, config in data.items():
                        self._thresholds[name] = ThresholdConfig(
                            metric_name=config["metric_name"],
                            base_value=config["base_value"],
                            current_value=config["current_value"],
                            min_value=config["min_value"],
                            max_value=config["max_value"],
                            last_updated=datetime.fromisoformat(config["last_updated"]),
                        )
                log.info("Carregados %d thresholds do disco", len(self._thresholds))
            
            # Carregar baselines
            baselines_file = self.data_dir / "baselines.json"
            if baselines_file.exists():
                with open(baselines_file, "r") as f:
                    self._metric_baselines = defaultdict(dict, json.load(f))
                log.info("Carregados baselines de %d dispositivos", len(self._metric_baselines))
            
            # Carregar patterns (resumido)
            patterns_file = self.data_dir / "patterns.json"
            if patterns_file.exists():
                with open(patterns_file, "r") as f:
                    data = json.load(f)
                    for pid, pdata in data.items():
                        self._patterns[pid] = PatternMemory(
                            pattern_id=pdata["pattern_id"],
                            pattern_type=pdata["pattern_type"],
                            signature=pdata["signature"],
                            first_seen=datetime.fromisoformat(pdata["first_seen"]),
                            last_seen=datetime.fromisoformat(pdata["last_seen"]),
                            occurrence_count=pdata["occurrence_count"],
                            confidence=pdata["confidence"],
                            associated_actions=pdata.get("associated_actions", []),
                            outcomes=pdata.get("outcomes", {}),
                        )
                log.info("Carregados %d padrões do disco", len(self._patterns))
                
        except Exception as e:
            log.warning("Erro ao carregar estado: %s", e)
    
    def _save_state(self):
        """Salva estado no disco."""
        try:
            # Salvar thresholds
            thresholds_data = {
                name: {
                    "metric_name": t.metric_name,
                    "base_value": t.base_value,
                    "current_value": t.current_value,
                    "min_value": t.min_value,
                    "max_value": t.max_value,
                    "last_updated": t.last_updated.isoformat(),
                }
                for name, t in self._thresholds.items()
            }
            with open(self.data_dir / "thresholds.json", "w") as f:
                json.dump(thresholds_data, f, indent=2)
            
            # Salvar baselines
            with open(self.data_dir / "baselines.json", "w") as f:
                json.dump(dict(self._metric_baselines), f, indent=2)
            
            # Salvar patterns
            patterns_data = {
                pid: {
                    "pattern_id": p.pattern_id,
                    "pattern_type": p.pattern_type,
                    "signature": p.signature,
                    "first_seen": p.first_seen.isoformat(),
                    "last_seen": p.last_seen.isoformat(),
                    "occurrence_count": p.occurrence_count,
                    "confidence": p.confidence,
                    "associated_actions": p.associated_actions,
                    "outcomes": p.outcomes,
                }
                for pid, p in self._patterns.items()
            }
            with open(self.data_dir / "patterns.json", "w") as f:
                json.dump(patterns_data, f, indent=2)
            
            log.debug("Estado salvo no disco")
            
        except Exception as e:
            log.error("Erro ao salvar estado: %s", e)
    
    # ============ Gerenciamento de Thresholds ============
    
    def get_threshold(self, metric_name: str) -> float:
        """Obtém threshold atual para uma métrica."""
        if metric_name in self._thresholds:
            return self._thresholds[metric_name].current_value
        
        # Valores padrão por tipo de métrica
        defaults = {
            "latency_ms": 100.0,
            "packet_loss_pct": 5.0,
            "rssi_dbm": -70.0,
            "cpu_usage_pct": 80.0,
            "memory_usage_pct": 85.0,
            "disconnection_count": 3.0,
            "wifi_noise_dbm": -85.0,
        }
        
        for key, value in defaults.items():
            if key in metric_name.lower():
                return value
        
        return 100.0  # Default genérico
    
    def adjust_threshold(
        self,
        metric_name: str,
        adjustment: float,
        reason: str,
    ) -> ThresholdConfig:
        """
        Ajusta threshold de uma métrica.
        
        Args:
            metric_name: Nome da métrica
            adjustment: Ajuste relativo (-1.0 a 1.0)
            reason: Motivo do ajuste
            
        Returns:
            Configuração atualizada
        """
        if metric_name not in self._thresholds:
            # Criar nova configuração
            default = self.get_threshold(metric_name)
            self._thresholds[metric_name] = ThresholdConfig(
                metric_name=metric_name,
                base_value=default,
                current_value=default,
                min_value=default * 0.5,
                max_value=default * 2.0,
                last_updated=datetime.utcnow(),
            )
        
        config = self._thresholds[metric_name]
        
        # Calcular novo valor
        range_size = config.max_value - config.min_value
        new_value = config.current_value + (adjustment * range_size * 0.1)
        
        # Clamp entre min e max
        new_value = max(config.min_value, min(config.max_value, new_value))
        
        # Aplicar
        old_value = config.current_value
        config.current_value = new_value
        config.last_updated = datetime.utcnow()
        config.adjustment_history.append((config.last_updated, adjustment, reason))
        
        # Manter apenas últimos 50 ajustes
        if len(config.adjustment_history) > 50:
            config.adjustment_history = config.adjustment_history[-50:]
        
        log.info(
            "Threshold %s ajustado: %.2f -> %.2f (reason: %s)",
            metric_name, old_value, new_value, reason
        )
        
        self._save_state()
        
        return config
    
    def auto_calibrate_thresholds(
        self,
        recent_metrics: Dict[str, List[float]],
        feedback_rate: float = 0.0,  # Taxa de feedback negativo
    ):
        """
        Calibra thresholds automaticamente baseado em métricas recentes.
        
        Se muitos alertas falsos (feedback negativo alto), relaxa thresholds.
        Se poucos alertas e métricas degradando, ajusta thresholds.
        """
        for metric_name, values in recent_metrics.items():
            if len(values) < 10:
                continue
            
            # Calcular estatísticas
            mean = statistics.mean(values)
            stdev = statistics.stdev(values) if len(values) > 1 else 0
            
            current_threshold = self.get_threshold(metric_name)
            
            # Se média está próxima do threshold, pode precisar ajustar
            threshold_ratio = mean / current_threshold if current_threshold > 0 else 0
            
            if threshold_ratio > 0.9 and feedback_rate < 0.1:
                # Muitas métricas próximas do threshold, poucas reclamações
                # Pode precisar aumentar threshold
                self.adjust_threshold(
                    metric_name,
                    adjustment=0.1,
                    reason="auto_calibrate: métricas próximas do threshold",
                )
            elif feedback_rate > 0.3:
                # Muitos feedbacks negativos (falsos positivos)
                # Relaxar threshold
                self.adjust_threshold(
                    metric_name,
                    adjustment=0.2,
                    reason="auto_calibrate: reduzindo falsos positivos",
                )
    
    # ============ Gerenciamento de Baselines ============
    
    def update_baseline(
        self,
        device_id: str,
        metrics: Dict[str, float],
        weight: float = 0.1,
    ):
        """
        Atualiza baseline de um dispositivo com média móvel exponencial.
        
        Args:
            device_id: ID do dispositivo
            metrics: Métricas atuais
            weight: Peso para novas observações (0-1)
        """
        current = self._metric_baselines[device_id]
        
        for metric_name, value in metrics.items():
            if metric_name in current:
                # Média móvel exponencial
                current[metric_name] = (
                    weight * value + (1 - weight) * current[metric_name]
                )
            else:
                current[metric_name] = value
        
        self._metric_baselines[device_id] = current
    
    def get_baseline(
        self,
        device_id: str,
        metric_name: Optional[str] = None,
    ) -> Dict[str, float]:
        """Obtém baseline de um dispositivo."""
        baseline = dict(self._metric_baselines.get(device_id, {}))
        
        if metric_name:
            return {metric_name: baseline.get(metric_name, 0.0)}
        
        return baseline
    
    def detect_baseline_drift(
        self,
        device_id: str,
        current_metrics: Dict[str, float],
        threshold_pct: float = 0.3,
    ) -> List[Dict[str, Any]]:
        """
        Detecta drift significativo em relação ao baseline.
        
        Returns:
            Lista de métricas com drift detectado
        """
        drifts = []
        baseline = self._metric_baselines.get(device_id, {})
        
        for metric_name, current_value in current_metrics.items():
            if metric_name not in baseline:
                continue
            
            baseline_value = baseline[metric_name]
            
            if baseline_value == 0:
                continue
            
            pct_change = abs(current_value - baseline_value) / baseline_value
            
            if pct_change > threshold_pct:
                direction = "increase" if current_value > baseline_value else "decrease"
                
                drifts.append({
                    "metric": metric_name,
                    "baseline": baseline_value,
                    "current": current_value,
                    "change_pct": pct_change * 100,
                    "direction": direction,
                    "significant": pct_change > threshold_pct * 2,
                })
        
        return drifts
    
    # ============ Gerenciamento de Padrões ============
    
    def record_pattern(
        self,
        pattern_type: str,
        signature: Dict[str, Any],
        device_id: Optional[str] = None,
    ) -> PatternMemory:
        """
        Registra ocorrência de um padrão.
        
        Se padrão já existe, atualiza contagem.
        Se é novo, cria entrada.
        """
        # Gerar ID do padrão baseado na assinatura
        sig_str = json.dumps(signature, sort_keys=True)
        pattern_id = f"{pattern_type}_{hash(sig_str) % 10000:04d}"
        
        now = datetime.utcnow()
        
        if pattern_id in self._patterns:
            pattern = self._patterns[pattern_id]
            pattern.last_seen = now
            pattern.occurrence_count += 1
            
            # Aumentar confiança com mais ocorrências (max 0.99)
            pattern.confidence = min(
                0.99,
                pattern.confidence + 0.01 * (1 - pattern.confidence)
            )
        else:
            pattern = PatternMemory(
                pattern_id=pattern_id,
                pattern_type=pattern_type,
                signature=signature,
                first_seen=now,
                last_seen=now,
                occurrence_count=1,
                confidence=0.5,  # Começa com confiança média
            )
            self._patterns[pattern_id] = pattern
        
        self._save_state()
        
        return pattern
    
    def find_similar_patterns(
        self,
        signature: Dict[str, Any],
        pattern_type: Optional[str] = None,
        min_confidence: float = 0.3,
    ) -> List[PatternMemory]:
        """
        Encontra padrões similares à assinatura fornecida.
        """
        similar = []
        
        for pattern in self._patterns.values():
            if pattern.confidence < min_confidence:
                continue
            
            if pattern_type and pattern.pattern_type != pattern_type:
                continue
            
            # Calcular similaridade
            similarity = self._calculate_signature_similarity(
                signature, pattern.signature
            )
            
            if similarity > 0.7:
                similar.append(pattern)
        
        # Ordenar por confiança
        similar.sort(key=lambda p: p.confidence, reverse=True)
        
        return similar
    
    def _calculate_signature_similarity(
        self,
        sig1: Dict[str, Any],
        sig2: Dict[str, Any],
    ) -> float:
        """Calcula similaridade entre duas assinaturas."""
        all_keys = set(sig1.keys()) | set(sig2.keys())
        
        if not all_keys:
            return 0.0
        
        matching = 0
        for key in all_keys:
            if key in sig1 and key in sig2:
                if sig1[key] == sig2[key]:
                    matching += 1
                elif isinstance(sig1[key], (int, float)) and isinstance(sig2[key], (int, float)):
                    # Similaridade numérica
                    max_val = max(abs(sig1[key]), abs(sig2[key]), 1)
                    diff = abs(sig1[key] - sig2[key]) / max_val
                    if diff < 0.2:
                        matching += 0.8
                    elif diff < 0.5:
                        matching += 0.5
        
        return matching / len(all_keys)
    
    def record_pattern_outcome(
        self,
        pattern_id: str,
        outcome: str,  # resolved, escalated, ignored, false_alarm
        action_taken: Optional[str] = None,
    ):
        """
        Registra resultado de um padrão detectado.
        
        Usado para aprender quais ações funcionam.
        """
        if pattern_id not in self._patterns:
            return
        
        pattern = self._patterns[pattern_id]
        
        # Atualizar outcomes
        if outcome not in pattern.outcomes:
            pattern.outcomes[outcome] = 0
        pattern.outcomes[outcome] += 1
        
        # Atualizar ações associadas
        if action_taken and action_taken not in pattern.associated_actions:
            pattern.associated_actions.append(action_taken)
        
        # Ajustar confiança baseado no outcome
        if outcome == "resolved":
            pattern.confidence = min(0.99, pattern.confidence + 0.05)
        elif outcome == "false_alarm":
            pattern.confidence = max(0.1, pattern.confidence - 0.1)
        
        self._save_state()
    
    def get_recommended_action(
        self,
        pattern_type: str,
        signature: Dict[str, Any],
    ) -> Optional[str]:
        """
        Obtém ação recomendada baseada em padrões similares bem-sucedidos.
        """
        similar = self.find_similar_patterns(signature, pattern_type)
        
        for pattern in similar:
            if "resolved" in pattern.outcomes:
                resolved_count = pattern.outcomes.get("resolved", 0)
                total_outcomes = sum(pattern.outcomes.values())
                
                # Se taxa de resolução > 60%, recomendar ação
                if total_outcomes > 0 and resolved_count / total_outcomes > 0.6:
                    if pattern.associated_actions:
                        return pattern.associated_actions[0]
        
        return None
    
    # ============ Feedback Loop ============
    
    def record_feedback(
        self,
        event_type: str,
        device_id: Optional[str],
        feedback: str,  # positive, negative, neutral
        context: Dict[str, Any],
    ):
        """
        Registra feedback do operador.
        
        Args:
            event_type: Tipo do evento (alert, prediction, recommendation)
            device_id: ID do dispositivo relacionado
            feedback: Tipo de feedback
            context: Contexto adicional
        """
        event = LearningEvent(
            event_id=f"fb_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            event_type=event_type,
            device_id=device_id,
            timestamp=datetime.utcnow(),
            data=context,
            feedback=feedback,
        )
        
        self._learning_events.append(event)
        
        # Atualizar contadores
        if feedback == "negative":
            self._false_positives += 1
            
            # Ajustar thresholds se muitos falsos positivos
            if self._false_positives > 10:
                self._handle_excessive_false_positives(event_type)
        elif feedback == "positive":
            self._true_positives += 1
        
        # Manter apenas últimos 1000 eventos
        if len(self._learning_events) > 1000:
            self._learning_events = self._learning_events[-1000:]
        
        log.info(
            "Feedback registrado: type=%s, feedback=%s, device=%s",
            event_type, feedback, device_id
        )
    
    def _handle_excessive_false_positives(self, event_type: str):
        """Trata excesso de falsos positivos."""
        log.warning("Detectado excesso de falsos positivos para %s", event_type)
        
        # Relaxar thresholds relacionados
        related_metrics = {
            "alert": ["latency_ms", "packet_loss_pct"],
            "prediction": ["disconnection_count"],
            "anomaly": ["all"],
        }
        
        metrics_to_adjust = related_metrics.get(event_type, [])
        
        for metric in metrics_to_adjust:
            if metric == "all":
                for m in self._thresholds:
                    self.adjust_threshold(m, 0.15, "excessive_false_positives")
            else:
                if metric in self._thresholds:
                    self.adjust_threshold(metric, 0.15, "excessive_false_positives")
        
        # Reset contador
        self._false_positives = 0
    
    def get_learning_stats(self) -> Dict[str, Any]:
        """Retorna estatísticas de aprendizado."""
        total_events = len(self._learning_events)
        
        if total_events == 0:
            return {
                "total_events": 0,
                "accuracy": 0.0,
                "patterns_learned": len(self._patterns),
                "thresholds_adjusted": len(self._thresholds),
                "baselines_tracked": len(self._metric_baselines),
            }
        
        feedback_counts = {
            "positive": 0,
            "negative": 0,
            "neutral": 0,
        }
        
        for event in self._learning_events:
            if event.feedback:
                feedback_counts[event.feedback] = feedback_counts.get(event.feedback, 0) + 1
        
        total_feedback = sum(feedback_counts.values())
        accuracy = (
            feedback_counts.get("positive", 0) / total_feedback
            if total_feedback > 0
            else 0.0
        )
        
        return {
            "total_events": total_events,
            "feedback_distribution": feedback_counts,
            "accuracy": round(accuracy, 3),
            "patterns_learned": len(self._patterns),
            "thresholds_adjusted": len(self._thresholds),
            "baselines_tracked": len(self._metric_baselines),
            "false_positive_count": self._false_positives,
            "true_positive_count": self._true_positives,
        }


# Instância global
learning_engine = LearningEngine(data_dir="data/ml")
