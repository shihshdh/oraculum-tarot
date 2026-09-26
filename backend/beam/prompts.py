"""塔罗解读与看板娘「占星师」的提示词（服务端拼装）。

文字本身来自 shared.json，由 scripts/export-shared.mjs 从 server/prompts.js 导出，
与本地 Node 后端一字不差。这里只做拼装与输入清洗。
"""
import json
import re
from pathlib import Path

SHARED = json.loads((Path(__file__).with_name("shared.json")).read_text(encoding="utf-8"))
READER_SYSTEM = SHARED["readerSystem"]
COMPANION_SYSTEM = SHARED["companionSystem"]
POSITIONS = SHARED["positions"]
MOODS = SHARED["moods"]
PAGES = SHARED["pages"]
NAV_TARGETS = SHARED["navTargets"]
DECK = {card["id"]: card for card in SHARED["deck"]}

MAX_QUESTION = 200
MAX_MESSAGE = 1200
MAX_TURNS = 12
MAX_READING = 4000


def clean_cards(raw):
    """只接受真实存在、互不重复的 5 张牌；无效返回 None。"""
    if not isinstance(raw, list) or len(raw) != 5:
        return None
    seen, cards = set(), []
    for item in raw:
        tarot = DECK.get(str(item.get("tarotId"))) if isinstance(item, dict) else None
        if not tarot or tarot["id"] in seen:
            return None
        seen.add(tarot["id"])
        cards.append((tarot, bool(item.get("reversed"))))
    return cards


def clean_question(raw):
    return re.sub(r"\s+", " ", str(raw or "")).strip()[:MAX_QUESTION]


def clean_messages(raw):
    if not isinstance(raw, list):
        return []
    out = []
    for item in raw[-MAX_TURNS:]:
        if not isinstance(item, dict) or item.get("role") not in ("user", "assistant"):
            continue
        content = str(item.get("content") or "").strip()[:MAX_MESSAGE]
        if content:
            out.append({"role": item["role"], "content": content})
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


def describe_spread(cards):
    lines = []
    for i, (tarot, reversed_) in enumerate(cards):
        keywords = tarot["keywordsReversed"] if reversed_ else tarot["keywords"]
        lines.append(
            f"- 第{i + 1}张【{POSITIONS[i]}】：{tarot['nameZh']}（{tarot['nameEn']}）· {'逆位' if reversed_ else '正位'}\n"
            f"  关键词：{'、'.join(keywords)}\n  基础含义：{tarot['meaning']}"
        )
    return "\n".join(lines)


def reading_request(question, cards):
    return (SHARED["readingTemplate"]
            .replace("{{QUESTION}}", question or "（我未明确提问，请就我当下的整体处境给出指引）")
            .replace("{{SPREAD}}", describe_spread(cards)))


def build_reading_messages(question, cards, reading, messages):
    request = {"role": "user", "content": reading_request(question, cards)}
    if not reading or not messages:
        return [{"role": "system", "content": READER_SYSTEM}, request]
    prefix = "" if re.match(r"^\s*<mood:", reading, re.I) else "<mood:neutral>\n"
    return [
        {"role": "system", "content": READER_SYSTEM + "\n\n解读已经给出。接下来求问者会就这次牌阵继续追问：回答围绕这五张牌与原问题展开，一般不超过 200 字，同样以 <mood:X> 作为第一行。"},
        request,
        {"role": "assistant", "content": prefix + str(reading)[:MAX_READING]},
        *messages,
    ]
