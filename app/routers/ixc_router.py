# app/routers/ixc_router.py
"""
API Router para integração com IXC Provedor.

Endpoints para buscar dados de clientes, contratos e faturas do IXC.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from app.routers.auth_router import get_current_user_optional

log = logging.getLogger("semppre-bridge.ixc")

router = APIRouter(prefix="/api/ixc", tags=["IXC Integration"])


# ============ Schemas ============

class ClienteBasico(BaseModel):
    """Dados básicos do cliente"""
    id: Optional[str] = None
    razao: Optional[str] = None
    cpf_cnpj: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = None
    status: Optional[str] = None


class ContratoInfo(BaseModel):
    """Informações de contrato"""
    id: Optional[str] = None
    id_cliente: Optional[str] = None
    status: Optional[str] = None
    data_inicio: Optional[str] = None
    dia_vencimento: Optional[int] = None
    valor: Optional[float] = None
    plano_nome: Optional[str] = None


class FaturaInfo(BaseModel):
    """Informações de fatura"""
    id: Optional[str] = None
    data_vencimento: Optional[str] = None
    valor: Optional[float] = None
    liquidado: Optional[str] = None  # S/N
    vencida: bool = False


class ResumoFinanceiro(BaseModel):
    """Resumo financeiro do cliente"""
    total_faturas: int = 0
    faturas_pagas: int = 0
    faturas_abertas: int = 0
    faturas_vencidas: int = 0
    valor_total: float = 0.0
    valor_pago: float = 0.0
    valor_em_aberto: float = 0.0
    valor_vencido: float = 0.0
    situacao: str = "desconhecido"  # em_dia, pendente, inadimplente


# ============ Endpoints ============

@router.get("/cliente/login/{login}")
async def get_cliente_por_login(
    login: str,
    completo: bool = Query(True, description="Buscar dados completos (contratos, faturas)"),
    _user: Optional[dict] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    """
    Busca dados do cliente pelo login PPPoE.
    
    Fluxo:
    1. Busca radusuarios pelo login
    2. Com id_cliente, busca dados completos do cliente
    3. Opcionalmente busca contratos e faturas
    
    Args:
        login: Login PPPoE do cliente (ex: "cliente@provedor")
        completo: Se True, busca também contratos e faturas
    
    Returns:
        Dados do cliente, contratos e faturas
    """
    from app.services.ixc_service import (
        find_cliente_by_pppoe_login,
        get_cliente_dados_completos,
    )
    
    login = (login or "").strip()
    if not login:
        raise HTTPException(status_code=400, detail="Login não informado")
    
    try:
        if completo:
            result = await get_cliente_dados_completos(login)
        else:
            result = await find_cliente_by_pppoe_login(login)
        
        if not result.get("found"):
            raise HTTPException(
                status_code=404, 
                detail=result.get("message", "Cliente não encontrado")
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        log.exception(f"Erro ao buscar cliente por login {login}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao consultar IXC: {str(e)}")


@router.get("/cliente/{cliente_id}")
async def get_cliente_por_id(
    cliente_id: str,
    _user: Optional[dict] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    """
    Busca dados do cliente pelo ID no IXC.
    
    Args:
        cliente_id: ID do cliente no IXC
    
    Returns:
        Dados cadastrais do cliente
    """
    from app.integrations.ixc import ixc_get_cliente_por_id
    
    cliente_id = (cliente_id or "").strip()
    if not cliente_id:
        raise HTTPException(status_code=400, detail="ID do cliente não informado")
    
    try:
        result = await ixc_get_cliente_por_id(cliente_id)
        return {"found": True, "cliente_id": cliente_id, "cliente": result}
        
    except Exception as e:
        log.exception(f"Erro ao buscar cliente {cliente_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao consultar IXC: {str(e)}")


@router.get("/cliente/{cliente_id}/completo")
async def get_cliente_completo(
    cliente_id: str,
    _user: Optional[dict] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    """
    Busca dados completos do cliente: cadastro, contratos e faturas.
    
    Args:
        cliente_id: ID do cliente no IXC
    
    Returns:
        Dados completos do cliente
    """
    from app.integrations.ixc import ixc_get_cliente_completo
    
    cliente_id = (cliente_id or "").strip()
    if not cliente_id:
        raise HTTPException(status_code=400, detail="ID do cliente não informado")
    
    try:
        result = await ixc_get_cliente_completo(cliente_id)
        return {"found": True, **result}
        
    except Exception as e:
        log.exception(f"Erro ao buscar dados completos do cliente {cliente_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao consultar IXC: {str(e)}")


@router.get("/cliente/{cliente_id}/contratos")
async def get_contratos_cliente(
    cliente_id: str,
    _user: Optional[dict] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    """
    Busca contratos de um cliente.
    
    Args:
        cliente_id: ID do cliente no IXC
    
    Returns:
        Lista de contratos do cliente
    """
    from app.services.ixc_service import get_contratos_cliente
    
    cliente_id = (cliente_id or "").strip()
    if not cliente_id:
        raise HTTPException(status_code=400, detail="ID do cliente não informado")
    
    try:
        result = await get_contratos_cliente(cliente_id)
        return result
        
    except Exception as e:
        log.exception(f"Erro ao buscar contratos do cliente {cliente_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao consultar IXC: {str(e)}")


@router.get("/cliente/{cliente_id}/faturas")
async def get_faturas_cliente(
    cliente_id: str,
    limit: int = Query(20, ge=1, le=100, description="Quantidade máxima de faturas"),
    _user: Optional[dict] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    """
    Busca faturas de um cliente.
    
    Args:
        cliente_id: ID do cliente no IXC
        limit: Quantidade máxima de faturas a retornar
    
    Returns:
        Lista de faturas e resumo financeiro
    """
    from app.services.ixc_service import get_faturas_cliente
    
    cliente_id = (cliente_id or "").strip()
    if not cliente_id:
        raise HTTPException(status_code=400, detail="ID do cliente não informado")
    
    try:
        result = await get_faturas_cliente(cliente_id, limit=limit)
        return result
        
    except Exception as e:
        log.exception(f"Erro ao buscar faturas do cliente {cliente_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao consultar IXC: {str(e)}")


@router.get("/contrato/{contrato_id}")
async def get_contrato(
    contrato_id: str,
    _user: Optional[dict] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    """
    Busca dados de um contrato específico.
    
    Args:
        contrato_id: ID do contrato no IXC
    
    Returns:
        Dados do contrato
    """
    from app.integrations.ixc import ixc_get_contrato_por_id
    
    contrato_id = (contrato_id or "").strip()
    if not contrato_id:
        raise HTTPException(status_code=400, detail="ID do contrato não informado")
    
    try:
        result = await ixc_get_contrato_por_id(contrato_id)
        return {"found": True, "contrato_id": contrato_id, "contrato": result}
        
    except Exception as e:
        log.exception(f"Erro ao buscar contrato {contrato_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao consultar IXC: {str(e)}")


@router.get("/contrato/{contrato_id}/faturas")
async def get_faturas_contrato(
    contrato_id: str,
    limit: int = Query(20, ge=1, le=100, description="Quantidade máxima de faturas"),
    _user: Optional[dict] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    """
    Busca faturas de um contrato específico.
    
    Args:
        contrato_id: ID do contrato no IXC
        limit: Quantidade máxima de faturas a retornar
    
    Returns:
        Lista de faturas do contrato
    """
    from app.services.ixc_service import get_faturas_contrato
    
    contrato_id = (contrato_id or "").strip()
    if not contrato_id:
        raise HTTPException(status_code=400, detail="ID do contrato não informado")
    
    try:
        result = await get_faturas_contrato(contrato_id, limit=limit)
        return result
        
    except Exception as e:
        log.exception(f"Erro ao buscar faturas do contrato {contrato_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao consultar IXC: {str(e)}")
