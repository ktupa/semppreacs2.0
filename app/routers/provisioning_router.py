# app/routers/provisioning_router.py
"""
API Router para gerenciamento de Auto-Provisioning
"""

from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field

from app.services.provisioning_service import provisioning_service, ProvisioningRule


router = APIRouter(prefix="/provisioning", tags=["Auto-Provisioning"])


# ============ Schemas ============

class ProvisioningRuleCreate(BaseModel):
    """Schema para criação de regra de provisionamento"""
    name: str = Field(..., description="Nome único da regra")
    match_criteria: Dict[str, Any] = Field(
        ...,
        description="Critérios para match (manufacturer, model, etc)",
        example={"manufacturer": "TP-Link", "model": "EC220*"}
    )
    parameters: Dict[str, Any] = Field(
        ...,
        description="Parâmetros a serem aplicados",
        example={
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID": "MinhaRede",
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable": True
        }
    )
    priority: int = Field(100, description="Prioridade (maior = mais importante)")
    enabled: bool = Field(True, description="Se a regra está ativa")


class ProvisionDeviceRequest(BaseModel):
    """Schema para provisionamento manual de dispositivo"""
    device_info: Optional[Dict[str, Any]] = Field(
        None,
        description="Informações do dispositivo (se não fornecido, busca do GenieACS)",
        example={"manufacturer": "TP-Link", "model": "EC220-G5"}
    )
    extra_params: Optional[Dict[str, Any]] = Field(
        None,
        description="Parâmetros extras a serem aplicados além das regras",
        example={"InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID": "MinhaRede"}
    )


class SimulateProvisionRequest(BaseModel):
    """Schema para simulação de provisionamento"""
    device_info: Dict[str, Any] = Field(
        ...,
        description="Informações do dispositivo para simular",
        example={"manufacturer": "TP-Link", "model": "EC220-G5"}
    )


# ============ Endpoints ============

@router.get("/rules")
async def list_provisioning_rules():
    """
    Lista todas as regras de provisionamento configuradas
    
    Retorna lista de regras ordenadas por prioridade
    """
    rules = []
    for rule in provisioning_service.rules:
        rules.append({
            "name": rule.name,
            "match_criteria": rule.match_criteria,
            "parameters_count": len(rule.parameters),
            "priority": rule.priority,
            "enabled": rule.enabled
        })
    
    return {
        "total_rules": len(rules),
        "rules": rules
    }


@router.get("/rules/{rule_name}")
async def get_provisioning_rule(rule_name: str):
    """
    Retorna detalhes de uma regra específica
    """
    for rule in provisioning_service.rules:
        if rule.name == rule_name:
            return {
                "name": rule.name,
                "match_criteria": rule.match_criteria,
                "parameters": rule.parameters,
                "priority": rule.priority,
                "enabled": rule.enabled
            }
    
    raise HTTPException(status_code=404, detail=f"Regra '{rule_name}' não encontrada")


@router.post("/rules")
async def create_provisioning_rule(request: ProvisioningRuleCreate):
    """
    Cria uma nova regra de provisionamento
    
    A regra será aplicada automaticamente a dispositivos que correspondam
    aos critérios de match quando:
    - Dispositivo fizer BOOTSTRAP (primeiro boot)
    - Detectado factory reset
    - Provisionamento manual solicitado
    """
    # Verificar se já existe
    for rule in provisioning_service.rules:
        if rule.name == request.name:
            raise HTTPException(
                status_code=400, 
                detail=f"Regra '{request.name}' já existe"
            )
    
    new_rule = ProvisioningRule(
        name=request.name,
        match_criteria=request.match_criteria,
        parameters=request.parameters,
        priority=request.priority,
        enabled=request.enabled
    )
    
    provisioning_service.add_rule(new_rule)
    
    return {
        "success": True,
        "message": f"Regra '{request.name}' criada com sucesso",
        "rule": {
            "name": new_rule.name,
            "match_criteria": new_rule.match_criteria,
            "parameters_count": len(new_rule.parameters),
            "priority": new_rule.priority,
            "enabled": new_rule.enabled
        }
    }


@router.delete("/rules/{rule_name}")
async def delete_provisioning_rule(rule_name: str):
    """
    Remove uma regra de provisionamento
    """
    for i, rule in enumerate(provisioning_service.rules):
        if rule.name == rule_name:
            provisioning_service.rules.pop(i)
            return {"success": True, "message": f"Regra '{rule_name}' removida"}
    
    raise HTTPException(status_code=404, detail=f"Regra '{rule_name}' não encontrada")


@router.patch("/rules/{rule_name}/toggle")
async def toggle_provisioning_rule(rule_name: str):
    """
    Ativa/desativa uma regra de provisionamento
    """
    for rule in provisioning_service.rules:
        if rule.name == rule_name:
            rule.enabled = not rule.enabled
            return {
                "success": True,
                "rule": rule_name,
                "enabled": rule.enabled
            }
    
    raise HTTPException(status_code=404, detail=f"Regra '{rule_name}' não encontrada")


@router.post("/provision/{device_id}")
async def provision_device(
    device_id: str,
    request: ProvisionDeviceRequest = Body(default=None)
):
    """
    Aplica provisionamento em um dispositivo manualmente
    
    - **device_id**: ID do dispositivo no GenieACS
    - **device_info**: Informações do dispositivo (opcional, busca automaticamente)
    - **extra_params**: Parâmetros extras além das regras
    
    Isso irá:
    1. Identificar regras aplicáveis ao dispositivo
    2. Merge de todos os parâmetros (por prioridade)
    3. Aplicar via SetParameterValues
    4. Fazer refresh dos dados
    """
    import httpx
    from app.settings import settings
    
    device_info = request.device_info if request else None
    extra_params = request.extra_params if request else None
    
    # Se não forneceu device_info, buscar do GenieACS
    if not device_info:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{settings.GENIE_NBI}/devices/",
                params={"query": f'{{"_id":"{device_id}"}}'})
            
            if res.status_code != 200 or not res.json():
                raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
            
            device = res.json()[0]
            device_info = {
                "manufacturer": device.get("_deviceId", {}).get("_Manufacturer", "Unknown"),
                "model": device.get("_deviceId", {}).get("_ProductClass", "Unknown"),
                "serial": device.get("_deviceId", {}).get("_SerialNumber", "Unknown"),
            }
    
    try:
        result = await provisioning_service.provision_device(
            device_id,
            device_info,
            extra_params
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no provisionamento: {str(e)}")


@router.post("/simulate")
async def simulate_provisioning(request: SimulateProvisionRequest):
    """
    Simula quais regras e parâmetros seriam aplicados a um dispositivo
    
    Útil para testar regras sem aplicar de fato
    """
    rules = provisioning_service.get_matching_rules(request.device_info)
    parameters = provisioning_service.merge_parameters(rules)
    
    return {
        "device_info": request.device_info,
        "matching_rules": [
            {"name": r.name, "priority": r.priority}
            for r in rules
        ],
        "parameters_to_apply": len(parameters),
        "parameters": parameters
    }


@router.get("/check-reset/{device_id}")
async def check_factory_reset(device_id: str):
    """
    Verifica se um dispositivo parece ter sido resetado para fábrica
    
    Baseado em indicadores como:
    - SSID padrão
    - Senha WiFi vazia ou padrão
    - PPPoE sem usuário
    - IP padrão
    """
    try:
        is_reset = await provisioning_service.detect_factory_reset(device_id)
        return {
            "device_id": device_id,
            "likely_factory_reset": is_reset,
            "recommendation": "Executar provisionamento" if is_reset else "Dispositivo configurado"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao verificar: {str(e)}")


@router.get("/history")
async def get_provisioning_history(
    device_id: Optional[str] = Query(None, description="Filtrar por dispositivo"),
    limit: int = Query(50, description="Limite de registros")
):
    """
    Retorna histórico de provisionamentos executados
    
    (Implementação futura com banco de dados)
    """
    # TODO: Implementar com banco de dados
    return {
        "message": "Histórico será implementado com persistência em banco",
        "device_id": device_id,
        "limit": limit,
        "history": []
    }
