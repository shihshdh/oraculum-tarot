"""把 ORACULUM 部署到 Beam（在 WSL 里、用装了 beam-client 的 Python 运行）。

    python deploy/beam_deploy.py            # 同步密钥 → 把前端放进部署包 → 部署 → 健康检查

前端（dist/）随代码包一起部署到 backend/beam/static/：卷上传（beam cp）在这台机器上不稳定，
而代码包上传走的是部署本身的通道，已验证可用。前端改了也需要重新运行一次本脚本。

凭据规则（与 Pixel Reconstruction 一致）：
  · Beam 账号 Token 从本机文件读取，只放进子进程环境变量，不出现在命令行参数和日志里
  · 模型 Key 取自本机 .ai-config.json，只写进 Beam Secret ORACULUM_AI_CONFIG，脚本不打印
  · 管理员密码、签名密钥第一次运行时随机生成，保存在 .beam-tools/（已被 git 忽略），只存进 Beam Secrets
"""
from pathlib import Path
import json
import os
import re
import secrets
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend" / "beam"
TOOLS = ROOT / ".beam-tools"
TOOLS.mkdir(exist_ok=True)
PIXEL = ROOT.parents[1] / "sharp-web"  # 复用像素重构里已登录的 Beam 账号与 CLI
TOKEN_FILE = Path(os.environ.get("BEAM_TOKEN_FILE", TOOLS / "beam-token"))
if not TOKEN_FILE.is_file():
    TOKEN_FILE = PIXEL / ".beam-token"
BEAM = Path(os.environ.get("BEAM_BIN", PIXEL / ".venv-beam" / "bin" / "beam"))
URL = re.compile(r"https://oraculum-[a-z0-9]+(?:-v\d+)?\.app\.beam\.cloud")
LOG = TOOLS / "deploy-latest.log"


def redact(line: str) -> str:
    # 签名上传地址可能被终端折成好几行：把每一段 X-Amz-* 参数都抹掉
    line = re.sub(r"(?i)X-Amz-[A-Za-z]+=\S*", "X-Amz-[redacted]", line)
    line = re.sub(r"(https?://[^\s?]+)\?\S+", r"\1?[redacted]", line)
    line = re.sub(r"(?i)(bearer|authorization:?|token[=:])\s*\S+", r"\1 [redacted]", line)
    return re.sub(r"(?<![A-Za-z0-9/._-])[A-Za-z0-9_-]{40,}(?![A-Za-z0-9/._-])", "[redacted]", line)


def beam_env():
    token = TOKEN_FILE.read_text(encoding="utf-8-sig").strip()
    if not token or any(c.isspace() for c in token):
        raise SystemExit("Beam Token 文件无效：" + str(TOKEN_FILE))
    return dict(os.environ, BEAM_TOKEN=token), token


def run_beam(args, cwd=BACKEND):
    env, _ = beam_env()
    print("$ beam " + " ".join(args), flush=True)
    # 经 beam_cli_runtime.py 调用 CLI（取自 Pixel Reconstruction）：增量上传失败时退回整包上传，
    # 本机连不上 Beam 对象存储时改由 60 秒寿命的临时 CPU 容器中转
    python = BEAM.parent / "python"
    process = subprocess.Popen([str(python), str(ROOT / "deploy" / "beam_cli_runtime.py"), *args], cwd=cwd, env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    lines = []
    for raw in process.stdout:
        clean = redact(raw.rstrip("\n"))
        lines.append(clean)
        print("  " + clean, flush=True)
    code = process.wait()
    with LOG.open("a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return code, lines


def local_secret(name, length=24):
    path = TOOLS / name
    if path.is_file() and path.read_text(encoding="utf-8").strip():
        return path.read_text(encoding="utf-8").strip()
    value = secrets.token_urlsafe(length)
    path.write_text(value, encoding="utf-8")
    return value


def sync_secrets():
    """用 SDK 写 Secrets（值不经过命令行参数，也不打印）。"""
    _, token = beam_env()
    os.environ["BEAM_TOKEN"] = token
    import beam  # noqa: F401  先加载，让 SDK 选好 Beam 网关
    from beta9.channel import ServiceClient
    from beta9.config import ConfigContext
    from beta9.clients.secret import CreateSecretRequest, ListSecretsRequest, UpdateSecretRequest

    cfg_path = ROOT / ".ai-config.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8")) if cfg_path.is_file() else {"providers": {}}
    seed = {"providers": cfg.get("providers") or {}}
    if cfg.get("assistModel"):
        seed["assistModel"] = cfg["assistModel"]
    values = {
        "ORACULUM_AI_CONFIG": json.dumps(seed, ensure_ascii=False),
        "ORACULUM_ADMIN_PASSWORD": local_secret("admin-password.txt", 12),
        "ORACULUM_SIGNING_KEY": local_secret("signing-key.txt", 48),
    }
    config = ConfigContext(token=token, gateway_host="gateway.beam.cloud", gateway_port=443)
    with ServiceClient(config=config) as client:
        listed = client.secret.list_secrets(ListSecretsRequest())
        if not listed.ok:
            raise SystemExit("读取 Beam Secrets 失败")
        existing = {item.name for item in listed.secrets}
        for name, value in values.items():
            req = UpdateSecretRequest(name=name, value=value) if name in existing else CreateSecretRequest(name=name, value=value)
            result = client.secret.update_secret(req) if name in existing else client.secret.create_secret(req)
            if not result.ok:
                raise SystemExit("写入 Secret 失败：" + name)
            print("  已配置服务端 Secret：" + name, flush=True)
    providers = [k for k, v in seed["providers"].items() if isinstance(v, dict) and v.get("apiKey")]
    print("  初始模型配置：" + ("、".join(providers) or "（空，上线后在管理员面板里配置）"), flush=True)


def bundle_site():
    """把 dist/ 复制到 backend/beam/static/，随部署包上传。"""
    import shutil
    dist = ROOT / "dist"
    if not (dist / "index.html").is_file():
        raise SystemExit("dist/ 不存在：先在 Windows 里运行 npm run build")
    static = BACKEND / "static"
    if static.exists():
        shutil.rmtree(static)
    shutil.copytree(dist, static)
    size = sum(f.stat().st_size for f in static.rglob("*") if f.is_file())
    print(f"  前端 {size / 1e6:.1f} MB 已放进部署包", flush=True)
    precompress(static)


PACKABLE = {".js", ".mjs", ".css", ".html", ".json", ".svg", ".wasm", ".task", ".moc3", ".txt", ".md"}


def precompress(root):
    """给文本和 wasm/模型预先生成 .gz，网关按 Accept-Encoding 直接发：0.25 核的容器不用现场压缩。"""
    import gzip
    before = after = 0
    for f in list(root.rglob("*")):
        if not f.is_file() or f.suffix.lower() not in PACKABLE or f.stat().st_size < 1024:
            continue
        raw = f.read_bytes()
        packed = gzip.compress(raw, compresslevel=9, mtime=0)
        if len(packed) < len(raw) * 0.9:
            f.with_name(f.name + ".gz").write_bytes(packed)
            before += len(raw)
            after += len(packed)
    print(f"  预压缩：{before / 1e6:.1f} MB → {after / 1e6:.1f} MB", flush=True)


def health(url):
    for attempt in range(8):
        try:
            with urllib.request.urlopen(url + "/healthz", timeout=90) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:  # 冷启动：多试几次
            print(f"  还没就绪（{type(error).__name__}），15 秒后重试…", flush=True)
            time.sleep(15)
    return None


def main():
    LOG.write_text("", encoding="utf-8")
    record = TOOLS / "deployment.json"
    print("[1/4] 同步服务端密钥", flush=True)
    sync_secrets()
    print("[2/4] 把前端放进部署包", flush=True)
    bundle_site()
    print("[3/4] 部署（beam_app.py:api）", flush=True)
    code, lines = run_beam(["deploy", "beam_app.py:api"])
    found = [m.group(0) for line in lines for m in URL.finditer(line)]
    if code or not found:
        raise SystemExit("部署失败，详见 " + str(LOG))
    url = found[-1]
    stable = re.sub(r"-v\d+(?=\.app\.beam\.cloud)", "", url)
    record.write_text(json.dumps({"url": url, "stable_url": stable, "time": time.strftime("%Y-%m-%d %H:%M:%S")}, ensure_ascii=False, indent=2), encoding="utf-8")
    print("  本次版本：" + url, flush=True)
    print("[4/4] 健康检查", flush=True)
    info = health(url)
    print("  " + json.dumps(info, ensure_ascii=False), flush=True)
    if not info or not info.get("ok") or not info.get("site"):
        raise SystemExit("健康检查没通过")
    print("\n完成：" + url + "\n固定地址（总是指向最新版本）：" + stable, flush=True)


if __name__ == "__main__":
    main()
