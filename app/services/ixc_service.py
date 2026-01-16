# app/services/ixc_service.py
from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import datetime
import logging

from app.integrations.ixc import (
    ixc_list_radusuarios_por_login,
    ixc_get_cliente_por_id,
    ixc_get_contratos_por_cliente,
    ixc_get_contrato_por_id,
    ixc_get_faturas_por_contrato,
    ixc_get_faturas_por_cliente,
    ixc_get_cliente_completo,
)

log = logging.getLogger("semppre-bridge")

def _extract_rows(data: Any) -> Optional[List[dict]]:
    if isinstance(data, dict):
        for key in ("rows", "data", "registros"):
            val = data.get(key)
            if isinstance(val, list):
                if val and isinstance(val[0], dict) and "cell" in val[0]:
                    return [r.get("cell", r) for r in val]
                return val
        return None
    if isinstance(data, list):
        return data
    return None

async def find_cliente_by_pppoe_login(login: str) -> Dict[str, Any]:
    """
    (Mantido) Retorna dados básicos do radusuarios.
    """
    login = (login or "").strip()
    if not login:
        return {"found": False, "login": login, "message": "login vazio"}
    try:
        raw = await ixc_list_radusuarios_por_login(login)
    except Exception as e:
        log.exception(f"[IXC SVC] erro consultando radusuarios login={login}: {e}")
        return {"found": False, "login": login, "error": {"message": str(e)}, "message": "Erro ao consultar IXC"}

    rows = _extract_rows(raw) or []
    if not rows:
        return {"found": False, "login": login}

    cli = rows[0] if isinstance(rows, list) else rows
    return {
        "found": True,
        "login": login,
        "id": cli.get("id"),
        "cliente": cli.get("cliente") or cli.get("id_cliente"),
        "id_contrato": cli.get("id_contrato"),
        "status": cli.get("ativo"),
        "plano": cli.get("id_contrato_plano_venda") or cli.get("contrato_plano_venda_"),
        "raw": cli,
    }

async def find_cliente_full_by_pppoe_login(login: str) -> Dict[str, Any]:
    """
    NOVO: usa radusuarios -> pega id_cliente -> consulta tabela cliente e retorna completo.
    """
    base = await find_cliente_by_pppoe_login(login)
    if not base.get("found"):
        return base

    id_cliente = base.get("cliente")
    if not id_cliente:
        return {**base, "cliente_found": False, "cliente_message": "id_cliente não encontrado no radusuarios"}

    try:
        cli = await ixc_get_cliente_por_id(id_cliente)
    except Exception as e:
        log.exception(f"[IXC SVC] erro consultando cliente id={id_cliente}: {e}")
        return {**base, "cliente_found": False, "cliente_error": {"message": str(e)}}

    # tentativa de mapear campos comuns (varia por instalação IXC)
    nome = cli.get("razao") or cli.get("nome") or cli.get("fantasia") or cli.get("razao_social")
    cpf_cnpj = cli.get("cnpj_cpf") or cli.get("cpf_cnpj") or cli.get("cpf") or cli.get("cnpj")
    email = cli.get("email")
    telefone = cli.get("telefone") or cli.get("fone") or cli.get("celular")
    cidade = cli.get("cidade")
    uf = cli.get("uf") or cli.get("estado")

    return {
        **base,
        "cliente_found": True,
        "cliente_id": str(id_cliente),
        "cliente_basic": {
            "nome": nome,
            "cpf_cnpj": cpf_cnpj,
            "email": email,
            "telefone": telefone,
            "cidade": cidade,
            "uf": uf,
            "status": cli.get("ativo") or cli.get("status"),
            "codigo": cli.get("id"),
        },
        "cliente_raw": cli,  # frontend pode consumir o que precisar
    }


async def get_cliente_dados_completos(login: str) -> Dict[str, Any]:
    """
    NOVO: Busca dados completos do cliente a partir do login PPPoE.
    
    Fluxo:
    1. Busca radusuarios pelo login
    2. Com id_cliente, busca dados completos do cliente
    3. Busca contratos do cliente
    4. Busca faturas do cliente
    
    Retorna tudo consolidado.
    """
    login = (login or "").strip()
    if not login:
        return {"found": False, "login": login, "message": "login vazio"}

    # 1) Buscar radusuarios pelo login
    try:
        raw = await ixc_list_radusuarios_por_login(login)
    except Exception as e:
        log.exception(f"[IXC SVC] erro consultando radusuarios login={login}: {e}")
        return {"found": False, "login": login, "error": {"message": str(e)}, "message": "Erro ao consultar IXC"}

    rows = _extract_rows(raw) or []
    if not rows:
        return {"found": False, "login": login, "message": "Login não encontrado"}

    rad = rows[0] if isinstance(rows, list) else rows
    id_cliente = rad.get("id_cliente") or rad.get("cliente")
    id_contrato = rad.get("id_contrato")

    result: Dict[str, Any] = {
        "found": True,
        "login": login,
        "radusuarios": {
            "id": rad.get("id"),
            "login": rad.get("login"),
            "id_cliente": id_cliente,
            "id_contrato": id_contrato,
            "status": rad.get("ativo"),
            "online": rad.get("online"),
            "mac": rad.get("mac"),
            "ip": rad.get("ip") or rad.get("framedipaddress"),
            "plano_id": rad.get("id_contrato_plano_venda"),
        },
        "radusuarios_raw": rad,
        "cliente": None,
        "contratos": [],
        "faturas": [],
        "resumo_financeiro": None,
        "errors": [],
    }

    if not id_cliente:
        result["errors"].append({"type": "cliente", "message": "id_cliente não encontrado no radusuarios"})
        return result

    # 2) Buscar dados completos do cliente
    try:
        cliente_completo = await ixc_get_cliente_completo(id_cliente)
        
        # Mapear dados do cliente
        cli = cliente_completo.get("cliente") or {}
        result["cliente"] = _map_cliente_data(cli)
        result["cliente_raw"] = cli
        
        # Contratos
        contratos = cliente_completo.get("contratos") or []
        result["contratos"] = [_map_contrato_data(c) for c in contratos]
        result["contratos_raw"] = contratos
        
        # Faturas
        faturas = cliente_completo.get("faturas") or []
        result["faturas"] = [_map_fatura_data(f) for f in faturas]
        result["faturas_raw"] = faturas
        
        # Resumo financeiro
        result["resumo_financeiro"] = _calcular_resumo_financeiro(faturas)
        
        # Propagar erros
        if cliente_completo.get("errors"):
            result["errors"].extend(cliente_completo["errors"])
            
    except Exception as e:
        log.exception(f"[IXC SVC] erro buscando dados completos cliente={id_cliente}: {e}")
        result["errors"].append({"type": "cliente_completo", "message": str(e)})

    return result


async def get_contratos_cliente(cliente_id: str | int) -> Dict[str, Any]:
    """Busca contratos de um cliente específico."""
    try:
        raw = await ixc_get_contratos_por_cliente(cliente_id)
        rows = _extract_rows(raw) or []
        return {
            "found": True,
            "cliente_id": str(cliente_id),
            "total": len(rows),
            "contratos": [_map_contrato_data(c) for c in rows],
            "contratos_raw": rows,
        }
    except Exception as e:
        log.exception(f"[IXC SVC] erro buscando contratos cliente={cliente_id}: {e}")
        return {"found": False, "cliente_id": str(cliente_id), "error": str(e)}


async def get_faturas_cliente(cliente_id: str | int, limit: int = 20) -> Dict[str, Any]:
    """Busca faturas de um cliente específico."""
    try:
        raw = await ixc_get_faturas_por_cliente(cliente_id, limit=limit)
        rows = _extract_rows(raw) or []
        faturas = [_map_fatura_data(f) for f in rows]
        return {
            "found": True,
            "cliente_id": str(cliente_id),
            "total": len(faturas),
            "faturas": faturas,
            "faturas_raw": rows,
            "resumo": _calcular_resumo_financeiro(rows),
        }
    except Exception as e:
        log.exception(f"[IXC SVC] erro buscando faturas cliente={cliente_id}: {e}")
        return {"found": False, "cliente_id": str(cliente_id), "error": str(e)}


async def get_faturas_contrato(contrato_id: str | int, limit: int = 20) -> Dict[str, Any]:
    """Busca faturas de um contrato específico."""
    try:
        raw = await ixc_get_faturas_por_contrato(contrato_id, limit=limit)
        rows = _extract_rows(raw) or []
        faturas = [_map_fatura_data(f) for f in rows]
        return {
            "found": True,
            "contrato_id": str(contrato_id),
            "total": len(faturas),
            "faturas": faturas,
            "faturas_raw": rows,
            "resumo": _calcular_resumo_financeiro(rows),
        }
    except Exception as e:
        log.exception(f"[IXC SVC] erro buscando faturas contrato={contrato_id}: {e}")
        return {"found": False, "contrato_id": str(contrato_id), "error": str(e)}


def _map_cliente_data(cli: dict) -> Dict[str, Any]:
    """Mapeia dados do cliente para formato padronizado."""
    return {
        "id": cli.get("id"),
        "razao": cli.get("razao") or cli.get("nome") or cli.get("fantasia"),
        "fantasia": cli.get("fantasia"),
        "cpf_cnpj": cli.get("cnpj_cpf") or cli.get("cpf_cnpj") or cli.get("cpf") or cli.get("cnpj"),
        "tipo_pessoa": cli.get("tipo_pessoa"),  # F=Física, J=Jurídica
        "email": cli.get("email"),
        "telefone": cli.get("telefone_celular") or cli.get("fone") or cli.get("telefone"),
        "celular": cli.get("telefone_celular"),
        "endereco": cli.get("endereco"),
        "numero": cli.get("numero"),
        "bairro": cli.get("bairro"),
        "cidade": cli.get("cidade"),
        "cidade_nome": cli.get("cidade_nome"),  # Pode vir em algumas instalações
        "uf": cli.get("uf") or cli.get("estado"),
        "cep": cli.get("cep"),
        "status": cli.get("ativo"),  # S=Ativo, N=Inativo
        "data_cadastro": cli.get("data_cadastro"),
        "filial_id": cli.get("filial_id"),
        "hotsite_email": cli.get("hotsite_email"),  # Login central do assinante
    }


def _map_contrato_data(contrato: dict) -> Dict[str, Any]:
    """Mapeia dados do contrato para formato padronizado."""
    return {
        "id": contrato.get("id"),
        "id_cliente": contrato.get("id_cliente"),
        "status": contrato.get("status"),  # A=Ativo, I=Inativo, etc
        "status_internet": contrato.get("status_internet"),
        "data_inicio": contrato.get("data_inicio") or contrato.get("data_ativacao"),
        "data_fim": contrato.get("data_fim") or contrato.get("data_cancelamento"),
        "dia_vencimento": contrato.get("dia_vencimento"),
        "valor": _safe_float(contrato.get("valor")),
        "id_plano": contrato.get("id_plano") or contrato.get("id_contrato_plano"),
        "plano_nome": contrato.get("plano") or contrato.get("descricao_plano"),
        "tipo": contrato.get("tipo"),  # I=Internet, etc
        "desbloqueio_confianca": contrato.get("desbloqueio_confianca"),
        "bloqueio_automatico": contrato.get("bloqueio_automatico"),
    }


def _map_fatura_data(fatura: dict) -> Dict[str, Any]:
    """Mapeia dados da fatura para formato padronizado."""
    valor = _safe_float(fatura.get("valor"))
    valor_pago = _safe_float(fatura.get("valor_pago"))
    
    # Determinar status da fatura
    status = fatura.get("status") or ""
    data_venc = fatura.get("data_vencimento") or ""
    liquidado = fatura.get("liquidado") or fatura.get("pago") or "N"
    
    # Calcular se está vencida
    vencida = False
    if data_venc and liquidado != "S":
        try:
            dt_venc = datetime.strptime(data_venc[:10], "%Y-%m-%d")
            vencida = dt_venc < datetime.now()
        except:
            pass
    
    return {
        "id": fatura.get("id"),
        "id_cliente": fatura.get("id_cliente"),
        "id_contrato": fatura.get("id_contrato"),
        "data_emissao": fatura.get("data_emissao"),
        "data_vencimento": data_venc,
        "data_pagamento": fatura.get("data_pagamento") or fatura.get("data_liquidacao"),
        "valor": valor,
        "valor_pago": valor_pago,
        "liquidado": liquidado,  # S=Sim, N=Não
        "status": status,
        "vencida": vencida,
        "nosso_numero": fatura.get("nosso_numero"),
        "linha_digitavel": fatura.get("linha_digitavel"),
        "pix_copia_cola": fatura.get("pix_copia_cola") or fatura.get("pix"),
        "url_boleto": fatura.get("gateway_link") or fatura.get("url"),
    }


def _safe_float(val: Any) -> float:
    """Converte valor para float de forma segura."""
    if val is None:
        return 0.0
    try:
        return float(str(val).replace(",", "."))
    except:
        return 0.0


def _calcular_resumo_financeiro(faturas: List[dict]) -> Dict[str, Any]:
    """Calcula resumo financeiro das faturas."""
    total_faturas = len(faturas)
    faturas_pagas = 0
    faturas_abertas = 0
    faturas_vencidas = 0
    valor_total = 0.0
    valor_pago = 0.0
    valor_em_aberto = 0.0
    valor_vencido = 0.0
    
    hoje = datetime.now()
    
    for f in faturas:
        valor = _safe_float(f.get("valor"))
        v_pago = _safe_float(f.get("valor_pago"))
        liquidado = f.get("liquidado") or f.get("pago") or "N"
        data_venc = f.get("data_vencimento") or ""
        
        valor_total += valor
        
        if liquidado == "S":
            faturas_pagas += 1
            valor_pago += v_pago or valor
        else:
            faturas_abertas += 1
            valor_em_aberto += valor
            
            # Verificar se vencida
            if data_venc:
                try:
                    dt_venc = datetime.strptime(data_venc[:10], "%Y-%m-%d")
                    if dt_venc < hoje:
                        faturas_vencidas += 1
                        valor_vencido += valor
                except:
                    pass
    
    return {
        "total_faturas": total_faturas,
        "faturas_pagas": faturas_pagas,
        "faturas_abertas": faturas_abertas,
        "faturas_vencidas": faturas_vencidas,
        "valor_total": round(valor_total, 2),
        "valor_pago": round(valor_pago, 2),
        "valor_em_aberto": round(valor_em_aberto, 2),
        "valor_vencido": round(valor_vencido, 2),
        "situacao": "inadimplente" if faturas_vencidas > 0 else ("em_dia" if faturas_abertas == 0 else "pendente"),
    }
