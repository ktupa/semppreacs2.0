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
