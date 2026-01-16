# app/services/ixc_service.py
from __future__ import annotations
from typing import Any, Dict, List, Optional
import logging

from app.integrations.ixc import (
    ixc_list_radusuarios_por_login,
    ixc_get_cliente_por_id,
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
