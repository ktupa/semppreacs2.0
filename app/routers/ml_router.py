# app/routers/ml_router.py
# API de Machine Learning e análise preditiva

from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.services.ml_service import MLService

router = APIRouter(prefix="/ml", tags=["Machine Learning"])


# ============ Schemas ============

class AnomalyOut(BaseModel):
    metric: str
    value: float
    threshold: Optional[float] = None
    zscore: Optional[float] = None
    severity: str
    message: str


class AnomalyAnalysisOut(BaseModel):
    device_id: str
    anomalies: List[AnomalyOut]
    health_score: int
    samples_analyzed: int
    period_hours: int


class RiskFactorOut(BaseModel):
    factor: str
    weight: int
    message: str
    trend: Optional[str] = None
    reboots: Optional[int] = None
    count: Optional[int] = None


class RiskAnalysisOut(BaseModel):
    device_id: str
    risk_level: str
    risk_score: int
    risk_factors: List[RiskFactorOut]
    analysis_period_days: int
    samples_analyzed: int


class RecommendationOut(BaseModel):
    priority: str
    category: str
    action: str
    title: str
    description: str
    trigger: str


class DeviceProblemOut(BaseModel):
    device_id: str
    manufacturer: Optional[str]
    model: Optional[str]
    pppoe_login: Optional[str]
    health_score: int
    anomaly_count: int


class FleetSummary(BaseModel):
    total_devices: int
    online: int
    offline: int
    online_percentage: float


class FleetAnalysisOut(BaseModel):
    summary: FleetSummary
    by_manufacturer: List[Dict[str, Any]]
    by_model: List[Dict[str, Any]]
    problem_devices: List[DeviceProblemOut]
    analysis_timestamp: str


# ============ Endpoints ============

@router.get("/health/{device_id}")
def get_device_health(
    device_id: str,
    hours: int = Query(24, description="Período de análise em horas"),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Análise de saúde completa de um dispositivo.
    Retorna anomalias, score de saúde e recomendações.
    """
    ml = MLService(db)
    
    anomalies = ml.detect_anomalies(device_id, hours=hours)
    risk = ml.predict_failure_risk(device_id, days=7)
    recommendations = ml.get_recommendations(device_id)
    
    return {
        "device_id": device_id,
        "health_score": anomalies.get("health_score", 0),
        "risk_level": risk.get("risk_level", "unknown"),
        "risk_score": risk.get("risk_score", 0),
        "anomalies": anomalies.get("anomalies", []),
        "risk_factors": risk.get("risk_factors", []),
        "recommendations": recommendations,
        "analysis": {
            "anomaly_period_hours": hours,
            "risk_period_days": 7,
            "anomaly_samples": anomalies.get("samples_analyzed", 0),
            "risk_samples": risk.get("samples_analyzed", 0)
        }
    }


@router.get("/anomalies/{device_id}", response_model=AnomalyAnalysisOut)
def detect_anomalies(
    device_id: str,
    hours: int = Query(24, description="Período de análise em horas"),
    db: Session = Depends(get_db)
):
    """
    Detecta anomalias em métricas de um dispositivo.
    """
    ml = MLService(db)
    result = ml.detect_anomalies(device_id, hours=hours)
    
    if "message" in result:
        raise HTTPException(status_code=404, detail=result["message"])
    
    return result


@router.get("/risk/{device_id}", response_model=RiskAnalysisOut)
def predict_risk(
    device_id: str,
    days: int = Query(7, description="Período de análise em dias"),
    db: Session = Depends(get_db)
):
    """
    Avalia risco de falha de um dispositivo.
    """
    ml = MLService(db)
    result = ml.predict_failure_risk(device_id, days=days)
    
    if result.get("risk") == "unknown":
        raise HTTPException(status_code=404, detail=result.get("message", "Dados insuficientes"))
    
    return result


@router.get("/recommendations/{device_id}", response_model=List[RecommendationOut])
def get_recommendations(
    device_id: str,
    db: Session = Depends(get_db)
):
    """
    Obtém recomendações automáticas para um dispositivo.
    """
    ml = MLService(db)
    return ml.get_recommendations(device_id)


@router.get("/fleet", response_model=FleetAnalysisOut)
def fleet_analysis(db: Session = Depends(get_db)):
    """
    Análise geral da frota de dispositivos.
    """
    ml = MLService(db)
    return ml.fleet_analysis()


@router.get("/traffic/{device_id}")
def predict_traffic(
    device_id: str,
    hours_ahead: int = Query(6, description="Horas para prever"),
    db: Session = Depends(get_db)
):
    """
    Previsão de tráfego para um dispositivo.
    """
    ml = MLService(db)
    result = ml.predict_traffic(device_id, hours_ahead=hours_ahead)
    
    if result.get("prediction") is None and "message" in result:
        raise HTTPException(status_code=404, detail=result["message"])
    
    return result


@router.get("/batch/health")
def batch_health_check(
    limit: int = Query(50, le=200),
    only_problems: bool = Query(False, description="Filtrar apenas dispositivos com problemas"),
    db: Session = Depends(get_db)
):
    """
    Verificação de saúde em lote de múltiplos dispositivos.
    """
    from app.database.models import Device
    
    ml = MLService(db)
    
    devices = db.query(Device)\
        .filter(Device.is_online == True)\
        .limit(limit)\
        .all()
    
    results = []
    for device in devices:
        anomalies = ml.detect_anomalies(device.device_id, hours=6)
        health_score = anomalies.get("health_score", 100)
        
        if only_problems and health_score >= 70:
            continue
        
        results.append({
            "device_id": device.device_id,
            "manufacturer": device.manufacturer,
            "model": device.product_class,
            "pppoe_login": device.pppoe_login,
            "wan_ip": device.wan_ip,
            "health_score": health_score,
            "anomaly_count": len(anomalies.get("anomalies", [])),
            "anomalies": anomalies.get("anomalies", [])[:3]  # Máximo 3 anomalias
        })
    
    # Ordenar por health_score (menor primeiro)
    results.sort(key=lambda x: x["health_score"])
    
    return {
        "devices_analyzed": len(devices),
        "problems_found": len([r for r in results if r["health_score"] < 70]),
        "results": results,
        "timestamp": datetime.utcnow().isoformat()
    }


@router.post("/thresholds")
def update_thresholds(
    thresholds: Dict[str, float],
    db: Session = Depends(get_db)
):
    """
    Atualiza thresholds de detecção de anomalias.
    """
    ml = MLService(db)
    
    valid_keys = list(ml.thresholds.keys())
    updated = {}
    
    for key, value in thresholds.items():
        if key in valid_keys:
            ml.thresholds[key] = value
            updated[key] = value
    
    return {
        "updated": updated,
        "current_thresholds": ml.thresholds
    }


@router.get("/thresholds")
def get_thresholds(db: Session = Depends(get_db)):
    """
    Obtém thresholds atuais de detecção.
    """
    ml = MLService(db)
    return ml.thresholds
