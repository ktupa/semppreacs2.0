# app/main.py
from __future__ import annotations

from typing import Dict, Optional, Iterable, Tuple, List
from fastapi import FastAPI, Request, HTTPException, Response, Query, Body, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.settings import settings
from app.proxy import stream_proxy
from app.services.ixc_service import find_cliente_by_pppoe_login, find_cliente_full_by_pppoe_login  # integra com integrations/ixc.py
from app.routers.tr069_router import router as tr069_router  # normalização TR-069
from app.routers.metrics_router import router as metrics_router  # métricas e histórico
from app.routers.ml_router import router as ml_router  # Machine Learning e previsões
from app.routers.analytics_router import router as analytics_router  # analytics e IA
from app.routers.feeds_router import router as feeds_router  # ingest de métricas (feeds)
from app.routers.webhook_router import router as webhook_router  # webhooks / alerts
from app.routers.config_router import router as config_router  # configurações do sistema
from app.routers.auth_router import router as auth_router  # autenticação JWT
from app.routers.backup_router import router as backup_router  # backup e restore de configs
from app.routers.device_params_router import router as device_params_router  # gerenciamento completo de parâmetros
from app.routers.provisioning_router import router as provisioning_router  # auto-provisioning
from app.routers.mobile_api_router import router as mobile_api_router  # API para aplicativo mobile
from app.routers.update_router import router as update_router  # sistema de atualizações
from app.database import init_db  # inicialização do banco

import base64
import httpx
import asyncio
import ipaddress
import re
import os
import json
import socket
import time
import shutil
import logging
from logging import Logger

APP_TITLE = "Semppre Bridge"
APP_VERSION = "1.3.0"  # Sprint 3: Database

# =========================
# LOGGING
# =========================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
log: Logger = logging.getLogger("semppre-bridge")

# =========================
# APP
# =========================
app = FastAPI(
    title=APP_TITLE,
    version=APP_VERSION,
    redirect_slashes=False,  # evita 301 automáticos
)

# =========================
# CORS
# =========================
origins = (
    [o.strip() for o in settings.CORS_ALLOW_ORIGINS.split(",")]
    if getattr(settings, "CORS_ALLOW_ORIGINS", None)
    else ["*"]
)

# Se o backend estiver rodando localmente, adicionamos origens comuns do dev server Vite
# (ajuda para desenvolvimento sem precisar alterar o unit systemd/.env imediatamente).
_dev_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
for _o in _dev_origins:
    if _o not in origins:
        origins.append(_o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    # Se for curinga '*' não habilitamos allow_credentials (navegadores bloqueiam '*' com credentials)
    allow_credentials=(False if origins == ["*"] else True),
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# MIDDLEWARE DE ACCESS LOG
# =========================
@app.middleware("http")
async def access_log_middleware(request: Request, call_next):
    path = request.url.path
    query = request.url.query
    method = request.method
    ua = request.headers.get("user-agent", "-")
    xff = request.headers.get("x-forwarded-for", "-")
    log.info(f"REQ {method} {path} ?{query} UA={ua} XFF={xff}")

    try:
        response = await call_next(request)
    except Exception as e:
        log.exception(f"UNHANDLED {method} {path}: {e}")
        raise

    log.info(f"RES {method} {path} -> {response.status_code} ({response.headers.get('content-type','-')})")
    return response

# =========================
# ROTAS DEBUG
# =========================
def _list_routes():
    routes_info = []
    for r in app.router.routes:
        if hasattr(r, "path"):
            routes_info.append({
                "path": getattr(r, "path", None),
                "name": getattr(r, "name", None),
                "methods": sorted(list(getattr(r, "methods", []) or [])),
                "type": r.__class__.__name__,
            })
    return routes_info

@app.get("/__debug/routes")
async def debug_routes():
    return _list_routes()

@app.on_event("startup")
async def _debug_startup_routes():
    routes = _list_routes()
    for r in routes:
        log.info(f"ROUTE {r['methods']} {r['path']} ({r['type']})")
    # alerta de duplicadas
    seen: Dict[tuple, int] = {}
    for r in routes:
        key = (tuple(r["methods"]), r["path"])
        seen[key] = seen.get(key, 0) + 1
    dups = [k for k, c in seen.items() if c > 1]
    if dups:
        log.warning(f"⚠️ ROTAS DUPLICADAS: {dups}")

# =========================
# PROXY HELPERS
# =========================
HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-length",
    "host",
}

def _filtered_headers(headers: Iterable[Tuple[str, str]]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for k, v in headers:
        if k.lower() in HOP_BY_HOP_HEADERS:
            continue
        out[k] = v
    # X-Forwarded coerentes com PUBLIC_* quando houver
    xf_proto = settings.PUBLIC_SCHEME or out.get("x-forwarded-proto") or "http"
    xf_host = settings.PUBLIC_HOST or out.get("x-forwarded-host") or out.get("host") or "localhost"
    out["X-Forwarded-Proto"] = xf_proto
    out["X-Forwarded-Host"] = xf_host
    if settings.PUBLIC_PORT:
        out["X-Forwarded-Port"] = str(settings.PUBLIC_PORT)
    out.setdefault("X-Forwarded-For", "127.0.0.1")
    return out

async def _do_upstream_request(
    method: str,
    url: str,
    headers: Dict[str, str],
    body: bytes,
    verify_ssl: bool = False,
    timeout: Optional[httpx.Timeout] = None,
) -> httpx.Response:
    timeout = timeout or httpx.Timeout(60.0, read=120.0, write=60.0, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout, verify=verify_ssl) as client:
        return await client.request(method, url, headers=headers, content=body)

async def _pipe_response(r: httpx.Response) -> Response:
    ignored = {"content-encoding", "transfer-encoding", "connection"}
    resp_headers = [(k, v) for k, v in r.headers.items() if k.lower() not in ignored]
    return Response(
        content=r.content,
        status_code=r.status_code,
        headers=dict(resp_headers),
        media_type=r.headers.get("content-type"),
    )

# =========================
# HELPERS (diagnóstico local)
# =========================
HOST_RE = re.compile(r"^[A-Za-z0-9\.\-:]+$")

def _is_valid_host(host: str) -> bool:
    if not host or not HOST_RE.match(host):
        return False
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return True  # hostname válido

async def _run_cmd(*args: str, timeout: int = 60) -> str:
    """Executa comando externo e retorna stdout (UTF-8)."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT
    )
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise HTTPException(status_code=504, detail=f"Timeout executando: {' '.join(args)}")
    return out.decode("utf-8", errors="ignore")

async def _run_ping(host: str, count: int = 3, timeout: int = 4) -> str:
    # Linux: ping -c N -w T
    bin_ping = shutil.which("ping") or "ping"
    return await _run_cmd(bin_ping, "-c", str(count), "-w", str(timeout), host, timeout=timeout+2)

def _parse_avg_rtt(stdout: str) -> Optional[float]:
    # formato Linux: rtt min/avg/max/mdev = 9.474/10.001/10.452/0.311 ms
    m = re.search(r"= ([0-9\.]+)/([0-9\.]+)/([0-9\.]+)/", stdout)
    if m:
        try:
            return float(m.group(2))
        except Exception:
            return None
    return None

def _iface_stats_paths(iface: str) -> Tuple[str, str]:
    base = f"/sys/class/net/{iface}/statistics"
    return os.path.join(base, "rx_bytes"), os.path.join(base, "tx_bytes")

def _read_bytes(path: str) -> int:
    with open(path, "r") as f:
        return int(f.read().strip())

# =========================
# HEALTH
# =========================
@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": APP_TITLE,
        "version": APP_VERSION,
        "genie_nbi": settings.GENIE_NBI,
        "genie_fs": settings.GENIE_FS,
        "ixc_enabled": bool(getattr(settings, "IXC_BASE_URL", "")),
    }

# =========================
# GENIE NBI (REST)
# =========================
@app.api_route("/genie/nbi/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy_genie_nbi(path: str, request: Request):
    upstream = settings.GENIE_NBI.rstrip("/")
    return await stream_proxy(request, upstream)

@app.get("/genie/devices/{device_id}")
async def genie_device(device_id: str):
    # GenieACS doesn't support /devices/{id} directly, need to use query
    import json
    url = f"{settings.GENIE_NBI.rstrip('/')}/devices"
    query = json.dumps({"_id": device_id})
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as c:
            r = await c.get(url, params={"query": query})
        data = r.json()
        if data and len(data) > 0:
            return data[0]
        raise HTTPException(status_code=404, detail=f"Device {device_id} not found")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Genie NBI upstream error: {e!s}")

@app.get("/genie/devices")
async def genie_devices(query: str = ""):
    url = f"{settings.GENIE_NBI.rstrip('/')}/devices"
    params = {"query": query} if query else {}
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as c:
            r = await c.get(url, params=params)
        return r.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Genie NBI upstream error: {e!s}")

# =========================================================
# IXC – router dedicado (rotas específicas antes do catch-all)
# =========================================================
def _ixc_auth_header_value() -> str:
    """
    Retorna 'Authorization' no formato esperado pelo IXC.
    Prioriza IXC_AUTH_HEADER_VALUE (se já estiver pronto no .env),
    senão gera 'Basic <base64(token_cru)>' a partir de IXC_TOKEN_BASIC.
    """
    if settings.IXC_AUTH_HEADER_VALUE:
        return settings.IXC_AUTH_HEADER_VALUE
    token = (settings.IXC_TOKEN_BASIC or "").strip()
    if not token:
        return ""
    b64 = base64.b64encode(token.encode("utf-8")).decode("ascii")
    return f"Basic {b64}"

router_ixc = APIRouter(prefix="/ixc", tags=["IXC"])

@router_ixc.get("/_raw/by-login/{login}")
async def ixc_raw_by_login(login: str):
    # chama SEMPRE a integração 'radusuarios' (GET com body ou fallback)
    from app.integrations.ixc import ixc_list_radusuarios_por_login
    raw = await ixc_list_radusuarios_por_login(login.strip())
    return raw

@router_ixc.get("/cliente/by-login/{login}")
async def ixc_cliente_by_login(login: str):
    data = await find_cliente_by_pppoe_login(login.strip())
    if not data.get("found"):
        # 200 + found:false facilita no frontend (pode trocar para 404 se preferir)
        return {
            "found": False,
            "login": login,
            "message": "Não foi possível obter dados do IXC para este login."
        }
    return data


@router_ixc.get("/cliente/dados/by-login/{login}")
async def ixc_cliente_dados_by_login(login: str):
    """
    Retorna: radusuario + cliente completo (tabela cliente).
    """
    data = await find_cliente_full_by_pppoe_login(login.strip())
    if not data.get("found"):
        return {"found": False, "login": login, "message": "Não foi possível obter dados do IXC para este login."}
    return data

# --------- CATCH-ALL (deve vir por ÚLTIMO no router) ---------
@router_ixc.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy_ixc(path: str, request: Request):
    log.info(f"[IXC PROXY] handler entrou | path={path} method={request.method}")
    if not getattr(settings, "IXC_BASE_URL", None):
        log.error("[IXC PROXY] IXC_BASE_URL não configurada")
        raise HTTPException(status_code=503, detail="IXC base URL não configurada")

    base = settings.IXC_BASE_URL.rstrip("/")
    url = f"{base}/{path.lstrip('/')}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    in_headers = _filtered_headers(request.headers.items())

    # Auth header (pronto no .env ou gerado do token)
    if settings.IXC_AUTH_HEADER_NAME and (settings.IXC_AUTH_HEADER_VALUE or settings.IXC_TOKEN_BASIC):
        in_headers[settings.IXC_AUTH_HEADER_NAME] = (
            settings.IXC_AUTH_HEADER_VALUE or _ixc_auth_header_value()
        )

    body = await request.body()
    log.info(f"[IXC PROXY] upstream URL={url}")

    try:
        upstream_resp = await _do_upstream_request(
            request.method.upper(), url, in_headers, body, verify_ssl=settings.IXC_VERIFY_SSL
        )
    except httpx.HTTPError as e:
        log.exception(f"[IXC PROXY] upstream error: {e}")
        raise HTTPException(status_code=502, detail=f"IXC upstream error: {e!s}")

    log.info(f"[IXC PROXY] upstream status={upstream_resp.status_code} ct={upstream_resp.headers.get('content-type','-')}")
    return await _pipe_response(upstream_resp)

# registra o router IXC (mantém ordem correta interna)
app.include_router(router_ixc)

# registra o router TR-069 (normalização TR-098/TR-181)
app.include_router(tr069_router)

# registra o router de métricas (persistência e histórico)
app.include_router(metrics_router)

# registra o router de Machine Learning (previsões e anomalias)
app.include_router(ml_router)

# registra o router de analytics (IA e ML)
app.include_router(analytics_router)

# registra router de ingest (feeds) e webhooks
app.include_router(feeds_router)
app.include_router(webhook_router)

# registra router de configurações do sistema
app.include_router(config_router)

# registra router de autenticação
app.include_router(auth_router)

# registra router de backup e restore
app.include_router(backup_router)

# registra router de parâmetros de dispositivos (completo)
app.include_router(device_params_router)

# registra router de auto-provisioning
app.include_router(provisioning_router)

# registra router da API Mobile
app.include_router(mobile_api_router)

# registra router de atualizações do sistema
app.include_router(update_router)

# =========================
# SERVIR FRONTEND (SPA)
# =========================
# Serve arquivos estáticos do frontend buildado (se existir)
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")

if os.path.exists(FRONTEND_DIST) and os.path.isdir(FRONTEND_DIST):
    log.info(f"📦 Servindo frontend estático de: {FRONTEND_DIST}")
    
    # Servir assets estáticos (JS, CSS, imagens, etc)
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")
    
    # Catch-all para SPA - deve vir por ÚLTIMO
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """
        Serve o index.html para todas as rotas não-API.
        Isso permite que o React Router funcione corretamente em produção.
        """
        # Se for uma rota API, não interceptar
        if full_path.startswith(("api/", "genie/", "ixc/", "diagnostico/", "config/", 
                                "auth/", "backup/", "metrics/", "analytics/", "feeds/", 
                                "webhooks/", "ml/", "provisioning/", "device-params/",
                                "__debug/", "health")):
            raise HTTPException(status_code=404, detail="Not Found")
        
        # Tentar servir arquivo estático se existir
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        
        # Caso contrário, servir index.html (SPA routing)
        index_path = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        
        raise HTTPException(status_code=404, detail="Frontend não encontrado")
else:
    log.warning(f"⚠️ Frontend dist não encontrado em: {FRONTEND_DIST}")
    log.warning("⚠️ Execute 'cd frontend && npm run build' para gerar o build de produção")

# =========================
# INICIALIZAÇÃO DO BANCO
# =========================
@app.on_event("startup")
async def startup_event():
    """Inicializa o banco de dados na inicialização."""
    init_db()
    log.info("🚀 Semppre Bridge started successfully")

# =========================
# DIAGNÓSTICO (ferramentas locais)
# =========================
@app.get("/diagnostico/health")
async def diag_health():
    return {"ok": True, "diagnostico": "ready"}

# --- PING ---
@app.get("/diagnostico/ping")
async def diag_ping_query(host: str = Query(..., description="Host/IP a testar")):
    if not _is_valid_host(host):
        raise HTTPException(status_code=400, detail="host inválido")
    stdout = await _run_ping(host)
    return {"host": host, "stdout": stdout, "avg_ms": _parse_avg_rtt(stdout)}

@app.get("/diagnostico/ping/{host}")
async def diag_ping_path(host: str):
    return await diag_ping_query(host)

# --- TRACEROUTE ---
@app.get("/diagnostico/traceroute")
async def diag_traceroute_query(host: str = Query(...)):
    if not _is_valid_host(host):
        raise HTTPException(status_code=400, detail="host inválido")

    bin_tr = shutil.which("traceroute") or shutil.which("tracepath")
    if not bin_tr:
        return {"host": host, "status": "unavailable", "hops": [], "stdout": "traceroute/tracepath não encontrados"}

    if os.path.basename(bin_tr) == "tracepath":
        out = await _run_cmd(bin_tr, "-n", host, timeout=60)
    else:
        out = await _run_cmd(bin_tr, "-n", "-q", "1", "-w", "2", host, timeout=60)

    hops: List[Dict[str, Optional[str]]] = []
    for line in out.splitlines():
        m = re.match(r"\s*(\d+)\s+([\d\.]+)\s+([\d\.]+)\s*ms", line)
        if m:
            hops.append({"hop": int(m.group(1)), "ip": m.group(2), "rtt_ms": m.group(3)})

    return {"host": host, "hops": hops, "stdout": out}

@app.get("/diagnostico/traceroute/{host}")
async def diag_traceroute_path(host: str):
    return await diag_traceroute_query(host)

# --- SPEEDTEST (stub controlado) ---
@app.get("/diagnostico/speedtest")
async def diag_speedtest(ip: Optional[str] = None):
    return {"status": "placeholder", "ip": ip, "download_mbps": None, "upload_mbps": None, "latency_ms": None}

# --- WHOIS ---
@app.get("/diagnostico/whois")
async def diag_whois(host: str = Query(..., description="Domínio ou IP")):
    if not _is_valid_host(host):
        raise HTTPException(status_code=400, detail="host inválido")
    bin_whois = shutil.which("whois")
    if not bin_whois:
        raise HTTPException(status_code=501, detail="whois não instalado no servidor")
    out = await _run_cmd(bin_whois, host, timeout=40)
    return {"host": host, "raw": out}

# --- DNS RESOLVE ---
@app.get("/diagnostico/dns/resolve")
async def diag_dns_resolve(
    name: str = Query(..., description="Nome DNS"),
    type: str = Query("A", regex="^(A|AAAA|CNAME|MX|TXT|NS)$")
):
    bin_dig = shutil.which("dig")
    if bin_dig:
        out = await _run_cmd(bin_dig, "+short", name, type, timeout=20)
        answers = [l.strip() for l in out.splitlines() if l.strip()]
        return {"name": name, "type": type, "answers": answers}

    if type in ("A", "AAAA"):
        try:
            loop = asyncio.get_running_loop()
            infos = await loop.getaddrinfo(name, None, proto=socket.IPPROTO_TCP)
            ips = sorted({ai[4][0] for ai in infos})
            return {"name": name, "type": type, "answers": ips}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"DNS fallback falhou: {e!s}")
    raise HTTPException(status_code=501, detail="dig não encontrado e fallback só cobre A/AAAA")

# --- ARP SCAN ---
@app.get("/diagnostico/arp/scan")
async def diag_arp_scan(
    iface: Optional[str] = Query(None, description="Interface, ex.: eth0"),
    timeout_s: int = Query(2, ge=1, le=10)
):
    bin_ip = shutil.which("ip")
    if bin_ip:
        args = [bin_ip, "-j", "neigh"]
        if iface:
            args += ["show", "dev", iface]
        out = await _run_cmd(*args, timeout=10)
        try:
            data = json.loads(out)
            hosts = []
            for item in data:
                ip = item.get("dst") or item.get("to")
                mac = item.get("lladdr") or item.get("lladdr")
                if ip and mac:
                    hosts.append({"ip": ip, "mac": mac})
            return {"iface": iface, "hosts": hosts}
        except Exception:
            pass

    bin_arp = shutil.which("arp")
    if bin_arp:
        out = await _run_cmd(bin_arp, "-an", timeout=10)
        hosts = []
        for line in out.splitlines():
            m = re.search(r"\(([\d\.]+)\)\s+at\s+([0-9a-f:]{11,17})", line, re.I)
            if m:
                hosts.append({"ip": m.group(1), "mac": m.group(2)})
        return {"iface": iface, "hosts": hosts}

    raise HTTPException(status_code=501, detail="nem 'ip' nem 'arp' disponíveis")

# --- WAN BANDWIDTH ---
@app.get("/diagnostico/wan/bandwidth")
async def diag_wan_bandwidth(iface: str = Query(..., description="Interface, ex.: eth0")):
    rx_p, tx_p = _iface_stats_paths(iface)
    if not (os.path.exists(rx_p) and os.path.exists(tx_p)):
        raise HTTPException(status_code=404, detail=f"Interface '{iface}' não encontrada")

    try:
        rx1, tx1 = _read_bytes(rx_p), _read_bytes(tx_p)
        t1 = time.time()
        await asyncio.sleep(1.0)
        rx2, tx2 = _read_bytes(rx_p), _read_bytes(tx_p)
        t2 = time.time()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha lendo contadores: {e!s}")

    dt = max(0.001, t2 - t1)
    rx_mbps = ((rx2 - rx1) * 8 / dt) / 1_000_000
    tx_mbps = ((tx2 - tx1) * 8 / dt) / 1_000_000
    return {
        "iface": iface,
        "rx_mbps": round(rx_mbps, 3),
        "tx_mbps": round(tx_mbps, 3),
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S")
    }

# --- IPERF CLIENT ---
@app.post("/diagnostico/iperf/client")
async def diag_iperf_client(payload: Dict[str, Optional[str | int]] = Body(...)):
    target = str(payload.get("target") or "").strip()
    seconds = int(payload.get("seconds") or 10)
    if not _is_valid_host(target):
        raise HTTPException(status_code=400, detail="target inválido")

    bin_iperf3 = shutil.which("iperf3")
    if not bin_iperf3:
        raise HTTPException(status_code=501, detail="iperf3 não instalado no servidor")

    out = await _run_cmd(bin_iperf3, "-c", target, "-J", "-t", str(seconds), timeout=seconds + 20)
    try:
        data = json.loads(out)
        summary = data.get("end", {}).get("sum_received") or data.get("end", {}).get("sum")
        bps = float(summary.get("bits_per_second", 0.0))
        mbps = bps / 1_000_000
        return {"target": target, "seconds": seconds, "mbps": round(mbps, 3), "raw": None}
    except Exception:
        return {"target": target, "seconds": seconds, "mbps": None, "raw": out}

# =========================
# RUN (uvicorn)
# =========================
# uvicorn app.main:app --host 0.0.0.0 --port 3001 --reload
