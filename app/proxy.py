from fastapi import Request, Response, HTTPException
import httpx

async def stream_proxy(req: Request, upstream: str) -> Response:
    url = f"{upstream}{req.url.path.replace(req.scope.get('root_path',''), '')}"
    if req.url.query:
        url = f"{url}?{req.url.query}"

    method = req.method.upper()
    headers = dict(req.headers)
    # remove hop-by-hop
    for h in ["host","content-length","connection","keep-alive","proxy-authenticate","proxy-authorization","te","trailers","transfer-encoding","upgrade"]:
        headers.pop(h, None)

    body = await req.body()
    timeout = httpx.Timeout(60.0, read=120.0, write=60.0, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout, verify=False) as client:
        try:
            r = await client.request(method, url, headers=headers, content=body)
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Upstream error: {e}")

    resp_headers = [(k, v) for k, v in r.headers.items() if k.lower() not in {"content-encoding","transfer-encoding","connection"}]
    return Response(content=r.content, status_code=r.status_code, headers=dict(resp_headers), media_type=r.headers.get("content-type"))
