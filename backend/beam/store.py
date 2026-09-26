"""持久卷上的状态：AI 配置、每日额度；以及无状态的管理员令牌和按 IP 限流。

容器会缩到 0，内存里的东西随时可能消失，所以：
  · AI 配置存在卷上（管理员在网页上改的就是它）；卷上还没有时，用 Secret ORACULUM_AI_CONFIG 作为初始值
  · 管理员登录颁发签名令牌（HMAC，7 天有效），不需要记在服务器上
  · 每日额度写在卷上，缩容重启也不会清零——这是防止账单被刷爆的兜底
  · 按 IP 的小时限流放在内存里（最多 1 个容器，够用；缩容后清零无妨）
"""
import base64
import datetime
import hashlib
import hmac
import json
import os
import secrets
import tempfile
import threading
import time
from pathlib import Path

DATA = Path(os.environ.get("ORACULUM_DATA", "/oraculum-data"))
CONFIG_PATH = DATA / "ai-config.json"
LEDGER_PATH = DATA / "ledger.json"
_lock = threading.Lock()


def _atomic_write(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


_cache = {"at": 0.0, "cfg": None}


def read_config() -> dict:
    # 卷是网络文件系统，读一次要几十到几百毫秒：缓存 10 秒（管理员保存时会立刻刷新）
    if _cache["cfg"] is not None and time.time() - _cache["at"] < 10:
        return json.loads(json.dumps(_cache["cfg"]))
    cfg = _read_config_file()
    _cache.update(at=time.time(), cfg=cfg)
    return json.loads(json.dumps(cfg))


def _read_config_file() -> dict:
    try:
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        seed = os.environ.get("ORACULUM_AI_CONFIG", "")
        try:
            cfg = json.loads(seed) if seed else {}
        except ValueError:
            cfg = {}
    if not isinstance(cfg.get("providers"), dict):
        cfg["providers"] = {}
    return cfg


def write_config(cfg: dict):
    with _lock:
        _atomic_write(CONFIG_PATH, cfg)
        _cache.update(at=time.time(), cfg=cfg)


def clear_config():
    with _lock:
        _atomic_write(CONFIG_PATH, {"providers": {}, "cleared": True})
        _cache.update(at=time.time(), cfg={"providers": {}, "cleared": True})


# ---------- 管理员 ----------
def _signing_key() -> bytes:
    key = os.environ.get("ORACULUM_SIGNING_KEY", "")
    if len(key) < 32:
        raise RuntimeError("ORACULUM_SIGNING_KEY 未配置")
    return key.encode()


def same_secret(a, b) -> bool:
    return hmac.compare_digest(str(a or "").encode(), str(b or "").encode())


def check_password(password) -> bool:
    expected = os.environ.get("ORACULUM_ADMIN_PASSWORD", "")
    return bool(expected) and same_secret(password, expected)


def issue_token(days=7) -> str:
    exp = str(int(time.time()) + days * 86400)
    nonce = secrets.token_hex(8)
    body = f"{exp}.{nonce}"
    sig = base64.urlsafe_b64encode(hmac.new(_signing_key(), b"admin\n" + body.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{body}.{sig}"


def check_token(token) -> bool:
    try:
        exp, nonce, sig = str(token or "").split(".")
        if int(exp) < time.time():
            return False
        want = base64.urlsafe_b64encode(hmac.new(_signing_key(), f"admin\n{exp}.{nonce}".encode(), hashlib.sha256).digest()).decode().rstrip("=")
        return hmac.compare_digest(sig, want)
    except (ValueError, RuntimeError):
        return False


# ---------- 每日额度（卷上，按北京时间的日期）----------
def reserve_daily(kind: str, limit: int) -> bool:
    if limit <= 0:
        return True
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime("%Y-%m-%d")
    with _lock:
        try:
            ledger = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            ledger = {}
        if ledger.get("day") != today:
            ledger = {"day": today}
        used = int(ledger.get(kind, 0))
        if used >= limit:
            return False
        ledger[kind] = used + 1
        _atomic_write(LEDGER_PATH, ledger)
    return True


# ---------- 按 IP 的小时限流（内存）----------
_windows: dict = {}


def allow_ip(kind: str, ip: str, limit: int, window=3600) -> bool:
    if limit <= 0:
        return True
    now = time.time()
    key = kind + ":" + hashlib.sha256(ip.encode()).hexdigest()[:16]
    with _lock:
        stamps = [t for t in _windows.get(key, []) if now - t < window]
        if len(stamps) >= limit:
            _windows[key] = stamps
            return False
        stamps.append(now)
        _windows[key] = stamps
        if len(_windows) > 5000:  # 防止内存无限增长
            for k in list(_windows)[:2500]:
                _windows.pop(k, None)
    return True
