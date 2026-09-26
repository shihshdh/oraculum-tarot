"""ORACULUM 后端 · Beam 部署入口。在本目录执行：beam deploy beam_app.py:api

只有一个 CPU 服务（没有 GPU）：
  · 按最低成本配置：0.25 核 CPU、512MB 内存；只做 AI 转发和发静态文件，够用
  · 最少 0 个容器、最多 1 个 —— 没人访问时缩到 0，不产生运行费用；也不会被刷成多开
  · 最后一个请求后只保温 20 秒：一次占卜里紧挨着的请求共用一次启动，隔久了再冷启动（几秒）
  · 持久卷 oraculum-data：AI 配置、每日额度、前端静态文件（site/）
  · 所有 Key 都在服务端：ORACULUM_AI_CONFIG（初始 AI 配置）、ORACULUM_ADMIN_PASSWORD、ORACULUM_SIGNING_KEY
"""
from beam import Image, QueueDepthAutoscaler, Volume, asgi

DATA_PATH = "/oraculum-data"
DATA_VOLUME = Volume(name="oraculum-data", mount_path=DATA_PATH)

API_IMAGE = Image(python_version="python3.11").add_python_packages([
    "fastapi==0.115.6", "httpx==0.28.1",
])

SECRETS = ["ORACULUM_AI_CONFIG", "ORACULUM_ADMIN_PASSWORD", "ORACULUM_SIGNING_KEY"]


@asgi(
    name="oraculum", app="oraculum", image=API_IMAGE,
    # 最省钱：没人访问时缩到 0 个容器（不计费），最多 1 个；FastAPI + httpx 常驻内存不到 100MB，256Mi 够用
    cpu=0.25, memory="256Mi", workers=1, concurrent_requests=32,
    keep_warm_seconds=20, timeout=180, max_pending_tasks=50,
    authorized=False,
    autoscaler=QueueDepthAutoscaler(min_containers=0, max_containers=1, tasks_per_container=32),
    volumes=[DATA_VOLUME], secrets=SECRETS,
    env={
        "ORACULUM_DATA": DATA_PATH,
        # 限流：每 IP 每小时；每日上限是全站合计（防止 Key 被刷爆账单）
        "ORACULUM_RATE_READING": "30", "ORACULUM_RATE_ASSIST": "60",
        "ORACULUM_DAILY_READINGS": "300", "ORACULUM_DAILY_ASSIST": "1000",
    },
)
def api():
    from gateway import create_app
    return create_app()
