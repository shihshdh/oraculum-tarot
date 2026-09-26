"""ORACULUM 网关（Beam 上的 FastAPI）。与本地 Node 后端（server/aiService.js）接口一致：

  POST /api/_admin/login   管理员登录 → 签名令牌
  GET  /api/_config        哪些 provider 已配置（不含 Key）
  POST /api/_config        管理员保存配置
  GET  /api/_models        可选模型 + 看板娘是否可用
  POST /api/reading        塔罗解读 / 追问（SSE 流，提示词在服务端拼装）
  POST /api/assist         看板娘对话（JSON：reply / mood / actions）
  GET  /healthz            健康检查（不调用任何模型）
  其余 GET                 前端静态文件（持久卷 site/ 目录，由 deploy/upload-site 上传）
"""
import json
import mimetypes
import os
import re
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse

import store
from assist import AssistError, assist_messages, build_context, clean_assist_messages, clean_image, parse_assist_reply
from prompts import build_reading_messages, clean_cards, clean_messages, clean_question

for ext, mime in ((".wasm", "application/wasm"), (".webp", "image/webp"), (".task", "application/octet-stream"),
                  (".moc3", "application/octet-stream"), (".mjs", "text/javascript"), (".js", "text/javascript"),
                  (".css", "text/css"), (".json", "application/json"), (".svg", "image/svg+xml")):
    mimetypes.add_type(mime, ext)

DEEPSEEK_MODELS = [
    {"id": "deepseek-chat", "label": "DeepSeek Chat（快速）"},
    {"id": "deepseek-reasoner", "label": "DeepSeek Reasoner（深度思考）"},
]
GEMINI_MODELS = [
    {"id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash（快速）"},
    {"id": "gemini-2.5-pro", "label": "Gemini 2.5 Pro（强）"},
    {"id": "gemini-2.0-flash", "label": "Gemini 2.0 Flash"},
]
ENDPOINTS = {
    "deepseek": "https://api.deepseek.com/v1/chat/completions",
    "doubao": "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
}
LIMITS = {
    "reading_ip": int(os.environ.get("ORACULUM_RATE_READING", "30")),
    "assist_ip": int(os.environ.get("ORACULUM_RATE_ASSIST", "60")),
    "reading_day": int(os.environ.get("ORACULUM_DAILY_READINGS", "300")),
    "assist_day": int(os.environ.get("ORACULUM_DAILY_ASSIST", "1000")),
}
MAX_BODY = 4 * 1024 * 1024
SITE_DIRS = [store.DATA / "site", store.DATA / "site" / "dist", Path(__file__).with_name("static")]


class HttpError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def err(status, message):
    return JSONResponse({"ok": False, "error": message}, status_code=status, headers={"Cache-Control": "no-store"})


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return (forwarded.split(",")[0].strip() or (request.client.host if request.client else "") or "unknown")[:64]


async def read_json(request: Request) -> dict:
    body = await request.body()
    if len(body) > MAX_BODY:
        raise HttpError(413, "请求内容过大。")
    try:
        data = json.loads(body or b"{}")
        return data if isinstance(data, dict) else {}
    except ValueError:
        return {}


# ---------- 模型 ----------
def get_models():
    p = store.read_config()["providers"]
    on = lambda x: isinstance(x, dict) and x.get("apiKey") and x.get("enabled") is not False  # noqa: E731
    models = []
    if on(p.get("deepseek")):
        models += [{"provider": "deepseek", **m, "vision": False} for m in DEEPSEEK_MODELS]
    if on(p.get("doubao")):
        for ep in p["doubao"].get("endpoints") or []:
            if ep.get("id"):
                models.append({"provider": "doubao", "id": ep["id"], "label": ep.get("label") or ep["id"], "vision": bool(ep.get("vision"))})
    if on(p.get("gemini")):
        models += [{"provider": "gemini", **m, "vision": True} for m in GEMINI_MODELS]
    return models


def pick_model(preferred=None, vision=False, for_assist=False):
    models = [m for m in get_models() if not vision or m["vision"]]
    if not models:
        return None
    if preferred:
        for m in models:
            if m["id"] == preferred:
                return m
    if for_assist:
        wanted = store.read_config().get("assistModel")
        for m in models:
            if m["id"] == wanted:
                return m
        # 看板娘要快：别默认用深度思考模型
        return next((m for m in models if not re.search(r"reasoner|pro", m["id"], re.I)), models[0])
    return models[0]


def to_gemini(messages):
    system, contents = "", []
    for m in messages:
        if m["role"] == "system":
            system += ("\n\n" if system else "") + m["content"]
            continue
        parts = []
        items = m["content"] if isinstance(m["content"], list) else [{"type": "text", "text": m["content"]}]
        for part in items:
            if part["type"] == "text":
                parts.append({"text": part["text"]})
            elif part["type"] == "image_url":
                match = re.match(r"^data:([^;]+);base64,(.*)$", part["image_url"]["url"])
                if match:
                    parts.append({"inline_data": {"mime_type": match.group(1), "data": match.group(2)}})
        contents.append({"role": "model" if m["role"] == "assistant" else "user", "parts": parts})
    body = {"contents": contents}
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    return body


def upstream_request(model, messages, stream, temperature=0.8, max_tokens=None):
    key = store.read_config()["providers"].get(model["provider"], {}).get("apiKey")
    if not key:
        raise HttpError(503, "AI 服务缺少 API Key，请联系管理员。")
    if model["provider"] == "gemini":
        action = "streamGenerateContent?alt=sse&" if stream else "generateContent?"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model['id']}:{action}key={key}"
        cfg = {"temperature": temperature, **({"maxOutputTokens": max_tokens} if max_tokens else {})}
        return url, {"Content-Type": "application/json"}, {**to_gemini(messages), "generationConfig": cfg}
    body = {"model": model["id"], "messages": messages, "stream": stream, "temperature": temperature}
    if max_tokens:
        body["max_tokens"] = max_tokens
    if model["provider"] == "doubao":
        body["thinking"] = {"type": "disabled"}  # 豆包思考模型默认输出思考过程：关掉
    return ENDPOINTS[model["provider"]], {"Content-Type": "application/json", "Authorization": "Bearer " + key}, body


def upstream_error(status, text):
    if status == 429:
        return HttpError(429, "找占星师的人有点多，稍等一会儿再来吧。")
    if status in (401, 402, 403):
        return HttpError(503, "AI 服务暂不可用（Key 无效或余额不足），请联系管理员。")
    detail = ""
    try:
        data = json.loads(text)
        e = data.get("error")
        detail = (e.get("message") if isinstance(e, dict) else e) or data.get("message") or ""
    except (ValueError, AttributeError):
        pass
    return HttpError(502, f"AI 服务返回错误 ({status})" + (f"：{str(detail)[:200]}" if detail else ""))


TIMEOUT = httpx.Timeout(connect=15, read=120, write=30, pool=15)


def create_app() -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @app.exception_handler(HttpError)
    async def _http_error(request, exc: HttpError):
        return err(exc.status, exc.message)

    @app.exception_handler(AssistError)
    async def _assist_error(request, exc: AssistError):
        return err(exc.status, exc.message)

    @app.get("/healthz")
    async def healthz():
        models = get_models()
        site = next((d for d in SITE_DIRS if (d / "index.html").is_file()), None)
        return {"ok": True, "assist": bool(models), "vision": any(m["vision"] for m in models), "site": bool(site),
                "admin": bool(os.environ.get("ORACULUM_ADMIN_PASSWORD"))}

    @app.post("/api/_admin/login")
    async def admin_login(request: Request):
        body = await read_json(request)
        if not store.allow_ip("login", client_ip(request), 10, 600):
            return err(429, "尝试次数太多，请 10 分钟后再试。")
        if not store.check_password(body.get("password")):
            return err(401, "密码错误")
        return {"ok": True, "token": store.issue_token()}

    @app.get("/api/_config")
    async def config_get():
        cfg = store.read_config()
        p = cfg["providers"]
        summary = lambda x: {"configured": bool((x or {}).get("apiKey")), "enabled": (x or {}).get("enabled") is not False}  # noqa: E731
        return JSONResponse({
            "deepseek": summary(p.get("deepseek")),
            "doubao": {**summary(p.get("doubao")), "endpoints": [{"id": e.get("id"), "label": e.get("label"), "vision": bool(e.get("vision"))} for e in (p.get("doubao") or {}).get("endpoints") or []]},
            "gemini": summary(p.get("gemini")),
            "assistModel": cfg.get("assistModel") or "",
        }, headers={"Cache-Control": "no-store"})

    @app.post("/api/_config")
    async def config_post(request: Request):
        body = await read_json(request)
        if not store.check_token(body.get("token")) and not store.check_password(body.get("password")):
            return err(401, "未授权，请重新登录")
        if body.get("action") == "clearAll":
            store.clear_config()
            return {"ok": True, "cleared": True}
        cfg = store.read_config()
        cfg.pop("cleared", None)
        for key, data in (body.get("providers") or {}).items():
            if key not in ("deepseek", "doubao", "gemini") or not isinstance(data, dict):
                continue
            nxt = dict(cfg["providers"].get(key) or {})
            if data.get("apiKey") == "":
                nxt.pop("apiKey", None)
            elif isinstance(data.get("apiKey"), str):
                nxt["apiKey"] = data["apiKey"].strip()
            if isinstance(data.get("endpoints"), list):
                nxt["endpoints"] = [{"id": str(e["id"]).strip(), "label": str(e.get("label") or "").strip() or str(e["id"]).strip(), "vision": bool(e.get("vision"))}
                                    for e in data["endpoints"] if isinstance(e, dict) and str(e.get("id") or "").strip()]
            if isinstance(data.get("enabled"), bool):
                nxt["enabled"] = data["enabled"]
            cfg["providers"][key] = nxt
        if isinstance(body.get("assistModel"), str):
            cfg["assistModel"] = body["assistModel"]
        store.write_config(cfg)
        return {"ok": True}

    @app.get("/api/_models")
    async def models_get():
        models = get_models()
        return JSONResponse({"models": models, "assist": bool(models), "vision": any(m["vision"] for m in models)}, headers={"Cache-Control": "no-store"})

    @app.post("/api/reading")
    async def reading(request: Request):
        body = await read_json(request)
        if not store.allow_ip("reading", client_ip(request), LIMITS["reading_ip"]):
            return err(429, f"请求过于频繁，每小时最多 {LIMITS['reading_ip']} 次，请稍后再试")
        cards = clean_cards(body.get("cards"))
        if not cards:
            return err(400, "牌阵无效，请重新抽牌。")
        model = pick_model(body.get("modelId"))
        if not model:
            return err(503, "AI 解读服务暂未开启，请联系管理员配置。")
        messages = clean_messages(body.get("messages"))
        if messages and messages[-1]["role"] != "user":
            return err(400, "请先输入想问的话。")
        if not store.reserve_daily("readings", LIMITS["reading_day"]):
            return err(429, "今天的解读次数已经用完了，明天再来吧。")
        url, headers, payload = upstream_request(model, build_reading_messages(
            clean_question(body.get("question")), cards, body.get("reading") if isinstance(body.get("reading"), str) else "", messages), stream=True)

        client = httpx.AsyncClient(timeout=TIMEOUT)
        try:
            upstream = await client.send(client.build_request("POST", url, headers=headers, json=payload), stream=True)
        except httpx.HTTPError:
            await client.aclose()
            return err(502, "连接 AI 服务失败")
        if upstream.status_code >= 400:
            text = (await upstream.aread()).decode("utf-8", "replace")
            await upstream.aclose()
            await client.aclose()
            e = upstream_error(upstream.status_code, text)
            return err(e.status, e.message)

        async def relay():
            # Beam 网关对每个小块都有固定延迟：把模型吐出的几百个碎块攒成约 0.25 秒一批再发。
            # 只在 SSE 事件边界（空行）处切分，浏览器端解析不受影响。
            import time as _time
            buffer, last = b"", _time.monotonic()
            try:
                async for chunk in upstream.aiter_bytes():  # 已解压：上游若用 gzip 也能直接转给浏览器
                    buffer += chunk
                    cut = buffer.rfind(b"\n\n")
                    if cut >= 0 and (_time.monotonic() - last > 0.25 or len(buffer) > 4096):
                        yield buffer[:cut + 2]
                        buffer, last = buffer[cut + 2:], _time.monotonic()
                if buffer:
                    yield buffer
            finally:
                await upstream.aclose()
                await client.aclose()

        return StreamingResponse(relay(), media_type="text/event-stream; charset=utf-8",
                                 headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})

    @app.post("/api/assist")
    async def assist(request: Request):
        body = await read_json(request)
        if not store.allow_ip("assist", client_ip(request), LIMITS["assist_ip"]):
            return err(429, "和占星师聊得太频繁啦，歇一会儿再来吧～")
        messages = clean_assist_messages(body.get("messages"))
        images = []
        page_image = clean_image(body.get("page_image"))
        screen = clean_image(body.get("screen"))
        if page_image:
            images.append(("页面上的图片（多图时有图号）", page_image))
        if screen:
            images.append(("用户本次附上的截图", screen))
        model = pick_model(vision=bool(images), for_assist=True)
        if not model:
            return err(503, "现在没有能看图的模型，请管理员配置 Gemini 或支持视觉的豆包接入点。" if images else "占星师的对话功能还没开通，请联系管理员。")
        if not store.reserve_daily("assist", LIMITS["assist_day"]):
            return err(429, "占星师今天聊累了，明天再来找她吧～")
        url, headers, payload = upstream_request(model, assist_messages(messages, build_context(body.get("context")), images), stream=False, temperature=0.9, max_tokens=700)
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.post(url, headers=headers, json=payload)
        except httpx.HTTPError:
            return err(502, "连接 AI 服务失败")
        if response.status_code >= 400:
            e = upstream_error(response.status_code, response.text)
            return err(e.status, e.message)
        try:
            data = response.json()
            if model["provider"] == "gemini":
                text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
            else:
                text = data["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError):
            return err(502, "占星师没听清，请再说一次。")
        return JSONResponse(parse_assist_reply(text), headers={"Cache-Control": "no-store"})

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "DELETE"])
    async def api_404(rest: str):
        return err(404, "接口不存在")

    # ---------- 前端静态文件 ----------
    @app.get("/{path:path}")
    async def site(path: str, request: Request):
        root = next((d for d in SITE_DIRS if (d / "index.html").is_file()), None)
        if not root:
            return Response("ORACULUM API is running. The site files have not been uploaded yet.", media_type="text/plain")
        target = (root / path).resolve() if path else root / "index.html"
        if not str(target).startswith(str(root.resolve())) or not target.is_file():
            target = root / "index.html"  # 单页应用：未知路径都回到首页
        if target.name == "index.html":
            cache = "no-cache"
        elif "/assets/" in "/" + path:
            cache = "public, max-age=31536000, immutable"  # 带哈希的打包文件
        else:
            cache = "public, max-age=604800"
        headers = {"Cache-Control": cache, "Vary": "Accept-Encoding"}
        # 部署时预先压缩好的 .gz（见 deploy/beam_deploy.py）：传输量约为原来的 1/3，容器也少跑几秒
        packed = target.with_name(target.name + ".gz")
        if "gzip" in request.headers.get("accept-encoding", "") and packed.is_file():
            media = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            return FileResponse(packed, media_type=media, headers={**headers, "Content-Encoding": "gzip"})
        return FileResponse(target, headers=headers)

    return app
