# app/integrations/ixc.py
from __future__ import annotations

import base64
import json
import logging
from typing import Any, Dict, Optional

import httpx
from app.settings import settings

log = logging.getLogger("semppre-bridge")

# ---------------------- Helpers ----------------------
def _auth_header_value(raw_token: str) -> str:
    raw_token = (raw_token or "").strip()
    if not raw_token:
        return ""
    b64 = base64.b64encode(raw_token.encode("utf-8")).decode("ascii")
    return f"Basic {b64}"

def _resolve_auth_header() -> tuple[str, str]:
    name = (getattr(settings, "IXC_AUTH_HEADER_NAME", None) or "Authorization").strip()
    ready = (getattr(settings, "IXC_AUTH_HEADER_VALUE", None) or "").strip()
    if ready:
        return name, ready
    token = (getattr(settings, "IXC_TOKEN_BASIC", None) or "").strip()
    return name, _auth_header_value(token)

def _base_headers(ixcsoft: Optional[str] = None) -> Dict[str, str]:
    name, value = _resolve_auth_header()
    headers: Dict[str, str] = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if value:
        headers[name] = value
    if ixcsoft:
        headers["ixcsoft"] = ixcsoft  # ex.: "listar"
    return headers

def _join_url(path: str) -> str:
    base = (settings.IXC_BASE_URL or "").rstrip("/")
    path = path.lstrip("/")
    if base.endswith("/webservice/v1"):
        return f"{base}/{path}"
    return f"{base}/webservice/v1/{path}"

def _mk_timeout() -> httpx.Timeout:
    t = getattr(settings, "IXC_TIMEOUT", 30)
    try:
        return httpx.Timeout(t, read=max(10, float(t)), write=max(10, float(t)), connect=min(30, float(t)))
    except Exception:
        return httpx.Timeout(30.0, read=30.0, write=30.0, connect=15.0)

# ---------------------- Core request ----------------------
async def _request(
    method: str,
    path: str,
    *,
    json_body: Any | None = None,
    params: Dict[str, Any] | None = None,
    headers: Dict[str, str] | None = None,
    raw_content: bytes | None = None,
) -> Any:
    url = _join_url(path)
    hdrs = headers or _base_headers()
    timeout = _mk_timeout()
    verify_ssl = bool(getattr(settings, "IXC_VERIFY_SSL", True))

    req_kwargs: Dict[str, Any] = dict(
        params=params,
        headers=hdrs,
        timeout=timeout,
        follow_redirects=True,
    )
    if raw_content is not None:
        req_kwargs["content"] = raw_content
    elif json_body is not None:
        req_kwargs["json"] = json_body

    log.info(f"[IXC] {method.upper()} {url} ixcsoft={hdrs.get('ixcsoft')}")
    async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout) as client:
        resp = await client.request(method.upper(), url, **req_kwargs)
        ct = resp.headers.get("content-type", "-")
        log.info(f"[IXC] status={resp.status_code} ct={ct}")
        resp.raise_for_status()
        try:
            return resp.json()
        except Exception:
            return {"raw_text": resp.text, "status": resp.status_code, "content_type": ct}

# ---------------------- API pública ----------------------
__all__ = [
    "ixc_list_radusuarios_por_login",
    "ixc_get_cliente_por_id",
    "ixc_get_contratos_por_cliente",
    "ixc_get_contrato_por_id",
    "ixc_get_faturas_por_contrato",
    "ixc_get_faturas_por_cliente",
    "ixc_get_cliente_completo",
]

async def ixc_list_radusuarios_por_login(login: str) -> Any:
    payload = {
        "qtype": "radusuarios.login",
        "query": (login or "").strip(),
        "oper": "=",
        "page": "1",
        "rp": "20",
        "sortname": "radusuarios.id",
        "sortorder": "desc",
    }
    headers = _base_headers(ixcsoft="listar")

    try:
        # 1) GET com body
        return await _request(
            "GET", "radusuarios",
            headers=headers,
            raw_content=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        )
    except httpx.HTTPStatusError as ex:
        if ex.response.status_code in (400, 405, 411, 415):
            try:
                # 2) GET com querystring
                return await _request("GET", "radusuarios", headers=headers, params=payload)
            except httpx.HTTPStatusError:
                # 3) POST JSON
                return await _request("POST", "radusuarios", headers=headers, json_body=payload)
        raise

async def ixc_get_cliente_por_id(cliente_id: str | int) -> Any:
    """
    Busca dados do cliente (tabela 'cliente') pelo ID.

    Tentativas:
      A) GET /cliente/{id}
      B) ixcsoft:listar em /cliente com filtro 'cliente.id' (fallback)
    """
    cid = str(cliente_id).strip()
    if not cid:
        raise ValueError("cliente_id vazio")

    # A) Tentar /cliente/{id}
    try:
        return await _request("GET", f"cliente/{cid}", headers=_base_headers())
    except httpx.HTTPStatusError:
        # B) Fallback via listar
        payload = {
            "qtype": "cliente.id",
            "query": cid,
            "oper": "=",
            "page": "1",
            "rp": "1",
            "sortname": "cliente.id",
            "sortorder": "asc",
        }
        headers = _base_headers(ixcsoft="listar")
        data = await _request(
            "GET", "cliente",
            headers=headers,
            raw_content=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        )
        # normalizar quando vier rows/cell
        if isinstance(data, dict) and "rows" in data and isinstance(data["rows"], list) and data["rows"]:
            row0 = data["rows"][0]
            return row0.get("cell") or row0
        return data


async def ixc_get_contratos_por_cliente(cliente_id: str | int) -> Any:
    """
    Busca contratos do cliente usando /cliente_contrato.
    Filtra por id_cliente para pegar todos os contratos.
    """
    cid = str(cliente_id).strip()
    if not cid:
        raise ValueError("cliente_id vazio")

    payload = {
        "qtype": "cliente_contrato.id_cliente",
        "query": cid,
        "oper": "=",
        "page": "1",
        "rp": "50",
        "sortname": "cliente_contrato.id",
        "sortorder": "desc",
    }
    headers = _base_headers(ixcsoft="listar")

    try:
        return await _request(
            "GET", "cliente_contrato",
            headers=headers,
            raw_content=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        )
    except httpx.HTTPStatusError as ex:
        if ex.response.status_code in (400, 405, 411, 415):
            try:
                return await _request("GET", "cliente_contrato", headers=headers, params=payload)
            except httpx.HTTPStatusError:
                return await _request("POST", "cliente_contrato", headers=headers, json_body=payload)
        raise


async def ixc_get_contrato_por_id(contrato_id: str | int) -> Any:
    """
    Busca contrato específico pelo ID.
    """
    cid = str(contrato_id).strip()
    if not cid:
        raise ValueError("contrato_id vazio")

    payload = {
        "qtype": "cliente_contrato.id",
        "query": cid,
        "oper": "=",
        "page": "1",
        "rp": "1",
        "sortname": "cliente_contrato.id",
        "sortorder": "desc",
    }
    headers = _base_headers(ixcsoft="listar")

    try:
        # Tentar GET direto primeiro
        return await _request("GET", f"cliente_contrato/{cid}", headers=_base_headers())
    except httpx.HTTPStatusError:
        # Fallback via listar
        data = await _request(
            "GET", "cliente_contrato",
            headers=headers,
            raw_content=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        )
        if isinstance(data, dict) and "rows" in data and isinstance(data["rows"], list) and data["rows"]:
            row0 = data["rows"][0]
            return row0.get("cell") or row0
        return data


async def ixc_get_faturas_por_contrato(contrato_id: str | int, limit: int = 20) -> Any:
    """
    Busca faturas (vd_saida) de um contrato específico.
    """
    cid = str(contrato_id).strip()
    if not cid:
        raise ValueError("contrato_id vazio")

    payload = {
        "qtype": "vd_saida.id_contrato",
        "query": cid,
        "oper": "=",
        "page": "1",
        "rp": str(limit),
        "sortname": "vd_saida.data_vencimento",
        "sortorder": "desc",
    }
    headers = _base_headers(ixcsoft="listar")

    try:
        return await _request(
            "GET", "vd_saida",
            headers=headers,
            raw_content=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        )
    except httpx.HTTPStatusError as ex:
        if ex.response.status_code in (400, 405, 411, 415):
            try:
                return await _request("GET", "vd_saida", headers=headers, params=payload)
            except httpx.HTTPStatusError:
                return await _request("POST", "vd_saida", headers=headers, json_body=payload)
        raise


async def ixc_get_faturas_por_cliente(cliente_id: str | int, limit: int = 20) -> Any:
    """
    Busca faturas (vd_saida) de um cliente pelo ID do cliente.
    """
    cid = str(cliente_id).strip()
    if not cid:
        raise ValueError("cliente_id vazio")

    payload = {
        "qtype": "vd_saida.id_cliente",
        "query": cid,
        "oper": "=",
        "page": "1",
        "rp": str(limit),
        "sortname": "vd_saida.data_vencimento",
        "sortorder": "desc",
    }
    headers = _base_headers(ixcsoft="listar")

    try:
        return await _request(
            "GET", "vd_saida",
            headers=headers,
            raw_content=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        )
    except httpx.HTTPStatusError as ex:
        if ex.response.status_code in (400, 405, 411, 415):
            try:
                return await _request("GET", "vd_saida", headers=headers, params=payload)
            except httpx.HTTPStatusError:
                return await _request("POST", "vd_saida", headers=headers, json_body=payload)
        raise


async def ixc_get_cliente_completo(cliente_id: str | int) -> Dict[str, Any]:
    """
    Busca dados completos do cliente: dados cadastrais, contratos e faturas.
    Retorna tudo consolidado em um único objeto.
    """
    cid = str(cliente_id).strip()
    if not cid:
        raise ValueError("cliente_id vazio")

    result: Dict[str, Any] = {
        "cliente_id": cid,
        "cliente": None,
        "contratos": [],
        "faturas": [],
        "errors": [],
    }

    # 1) Buscar dados do cliente
    try:
        cliente_data = await ixc_get_cliente_por_id(cid)
        result["cliente"] = cliente_data
    except Exception as e:
        log.warning(f"[IXC] Erro ao buscar cliente {cid}: {e}")
        result["errors"].append({"type": "cliente", "message": str(e)})

    # 2) Buscar contratos do cliente
    try:
        contratos_raw = await ixc_get_contratos_por_cliente(cid)
        rows = _extract_rows_from_response(contratos_raw)
        result["contratos"] = rows
    except Exception as e:
        log.warning(f"[IXC] Erro ao buscar contratos do cliente {cid}: {e}")
        result["errors"].append({"type": "contratos", "message": str(e)})

    # 3) Buscar faturas do cliente
    try:
        faturas_raw = await ixc_get_faturas_por_cliente(cid, limit=50)
        rows = _extract_rows_from_response(faturas_raw)
        result["faturas"] = rows
    except Exception as e:
        log.warning(f"[IXC] Erro ao buscar faturas do cliente {cid}: {e}")
        result["errors"].append({"type": "faturas", "message": str(e)})

    return result


def _extract_rows_from_response(data: Any) -> list:
    """Helper para extrair rows de diferentes formatos de resposta IXC."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        # Formato rows/cell
        if "rows" in data and isinstance(data["rows"], list):
            rows = data["rows"]
            if rows and isinstance(rows[0], dict) and "cell" in rows[0]:
                return [r.get("cell", r) for r in rows]
            return rows
        # Formato data/registros
        for key in ("data", "registros"):
            if key in data and isinstance(data[key], list):
                return data[key]
    return []
