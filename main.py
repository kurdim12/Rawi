"""Rawi (راوي) — ذاكرة الشركة بصوت أصحابها. Hackathon demo server."""
import json
import logging
import os
import re
import threading

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

load_dotenv()

BASE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=os.path.join(BASE, "static"))
log = logging.getLogger("rawi")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

TIMEOUT = 8
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
OPENROUTER_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "").strip() or "claude-sonnet-5-5"
OPENROUTER_DEFAULT = "anthropic/claude-sonnet-5.5"
state = {"openrouter_model": os.getenv("OPENROUTER_MODEL", "").strip()}


def provider():
    if ANTHROPIC_KEY:
        return "anthropic"
    if OPENROUTER_KEY:
        return "openrouter"
    return None


def discover_openrouter_model():
    """Pick the newest anthropic/claude-sonnet* slug when OPENROUTER_MODEL is unset."""
    if state["openrouter_model"] or provider() != "openrouter":
        return
    try:
        r = requests.get("https://openrouter.ai/api/v1/models", timeout=TIMEOUT)
        r.raise_for_status()
        models = [m for m in r.json().get("data", [])
                  if m.get("id", "").startswith("anthropic/claude-sonnet") and ":" not in m["id"]]
        if models:
            state["openrouter_model"] = max(models, key=lambda m: m.get("created", 0))["id"]
            log.info("OpenRouter model: %s", state["openrouter_model"])
    except Exception as e:  # noqa: BLE001
        log.warning("OpenRouter model discovery failed (%s); using default", type(e).__name__)


def llm(system, user, max_tokens=400):
    p = provider()
    if p == "anthropic":
        r = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": ANTHROPIC_MODEL, "max_tokens": max_tokens, "system": system,
                  "messages": [{"role": "user", "content": user}]},
            timeout=TIMEOUT)
        r.raise_for_status()
        return "".join(b.get("text", "") for b in r.json().get("content", [])
                       if b.get("type") == "text").strip()
    if p == "openrouter":
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENROUTER_KEY}", "content-type": "application/json",
                     "X-Title": "Rawi"},
            json={"model": state["openrouter_model"] or OPENROUTER_DEFAULT, "max_tokens": max_tokens,
                  "messages": [{"role": "system", "content": system},
                               {"role": "user", "content": user}]},
            timeout=TIMEOUT)
        r.raise_for_status()
        return (r.json()["choices"][0]["message"]["content"] or "").strip()
    raise RuntimeError("no provider")


def safe_llm(name, system, user, max_tokens=400):
    if not provider():
        return None
    try:
        return llm(system, user, max_tokens) or None
    except Exception as e:  # noqa: BLE001 — never leak details (or keys) to the client or logs
        status = getattr(getattr(e, "response", None), "status_code", "")
        log.warning("%s: model call failed (%s %s) -> fallback", name, type(e).__name__, status)
        return None


def first_json(text):
    if not text or "{" not in text:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(text[text.index("{"):])
        return obj if isinstance(obj, dict) else None
    except ValueError:
        return None


SECRET_WORD = re.compile(r"(كلمة السر|كلمة سر|الباسورد|باسورد|password)(\s*(?:هي|هو|:)?\s*)([^\s،,.]+)", re.I)
MIXED = re.compile(r"(?<![A-Za-z0-9])(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{6,}(?![A-Za-z0-9])")


def mask(text):
    """Server-side safety net; the client already masks before sending."""
    text = SECRET_WORD.sub(lambda m: m.group(1) + m.group(2) + "[حُذفت]", str(text or ""))
    return MIXED.sub("[حُذفت]", text)


def ctx():
    d = request.get_json(silent=True) or {}
    supplier = str(d.get("supplier") or "سما للاتصالات")[:60]
    try:
        day = max(1, min(28, int(d.get("day") or 12)))
    except (TypeError, ValueError):
        day = 12
    return d, supplier, day


# ---------------------------------------------------------------- followup
FALLBACK_QUESTIONS = [
    "لو {supplier} أخّروا التوريد عن يوم {day}، مين بتتصل فيه أول، وشو الخطة البديلة اللي مش مكتوبة بأي مكان؟",
    "شو الاستثناء اللي بتعمله مع {supplier} وما حدا بالقسم بيعرف عنه غيرك؟",
    "خلّيني أقرأ عليك اللي فهمته بخصوص {supplier} ويوم {day}: هيك الأرقام والأسماء صح، ولا في إشي لازم أصلّحه؟",
    "إذا كنت إجازة يوم {day}، مين بيغطّي دفعة {supplier}، وشو بيصير إذا ما حدا غطّى؟",
    "بوابة الطلبات تبعت {supplier}: وين محفوظة بيانات الدخول، ومين اللي بيعطي رنا الصلاحية؟",
    "شو أكتر غلطة رح يعملها موظف جديد مع {supplier} لو مشي حسب الإجراء الرسمي بالحرف؟",
]
NUM = re.compile(r"[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?\s*[%٪]?")


def fallback_question(supplier, day, index, turns):
    if (index + 1) % 3 == 0:
        said = " ".join(t.get("text", "") for t in turns if t.get("role") == "omar")
        nums = list(dict.fromkeys(n.strip() for n in NUM.findall(said)))[:4]
        if nums:
            return (f"خلّيني أتأكد: ذكرت {' و'.join(nums)} بخصوص {supplier}. "
                    "هيك الأرقام صح، ولا في إشي لازم أصلّحه؟")
    return FALLBACK_QUESTIONS[index % len(FALLBACK_QUESTIONS)].format(supplier=supplier, day=day)


@app.post("/api/followup")
def followup():
    d, supplier, day = ctx()
    try:
        index = int(d.get("index") or 0)
    except (TypeError, ValueError):
        index = 0
    turns = [t for t in (d.get("turns") or []) if isinstance(t, dict)][-12:]
    readback = ("- هالمرة بالذات: اقرأ على عمر الأرقام والأسماء اللي ذكرها بالزبط زي ما قالها، واطلب منه يأكّدها أو يصحّحها.\n"
                if (index + 1) % 3 == 0 else "")
    system = (
        "أنت \"راوي\"، مُحاوِر جلسات تسليم في شركة النخيل للمقاولات. بتحاور عمر من قسم المشتريات "
        "(باقي له ٩ أيام بالشركة) عشان معرفته توصل لبديلته رنا.\n"
        "القواعد:\n"
        "- اسأل سؤال متابعة واحد بس، باللهجة الأردنية، ٢٥ كلمة أو أقل، بأسلوب صحفي فضولي ومحدد.\n"
        "- طلّع المعرفة اللي مش مكتوبة: الاستثناءات، البدائل لما حدا يغيب، الصلاحيات، وشو بيخرب لو حدا مشي \"حسب النظام\" بالحرف.\n"
        f"- اربط السؤال بالمورد \"{supplier}\" وبيوم {day} من الشهر لما يكون الربط طبيعي.\n"
        f"{readback}"
        "- ممنوع تطلب كلمة سر أبداً. إذا انذكر حساب أو نظام، اسأل وين محفوظة بيانات الدخول ومين بيعطي الصلاحية.\n"
        "- اكتب السؤال فقط، بدون مقدمة أو شرح أو علامات تنصيص."
    )
    convo = "\n".join(("راوي: " if t.get("role") == "rawi" else "عمر: ") + mask(t.get("text", ""))[:1200]
                      for t in turns)
    out = safe_llm("followup", system, f"{convo}\n\nاكتب سؤال المتابعة الجاي.", 200)
    q = ""
    if out:
        lines = [ln.strip().strip("\"'«»“”`*-").strip() for ln in out.splitlines() if ln.strip()]
        q = lines[0] if lines else ""
        q = re.sub(r"^(راوي|سؤال|السؤال)\s*[:：]\s*", "", q)
        if len(q.split()) > 40 or re.search(r"(اعطيني|ابعتلي|قلّي|قلي).{0,15}(كلمة السر|الباسورد|باسورد)", q):
            q = ""
    if q:
        return jsonify(question=q, source="model")
    return jsonify(question=fallback_question(supplier, day, index, turns), source="fallback")


# ---------------------------------------------------------------- extract
def fallback_cards(answers, supplier):
    cards = []
    for a in answers:
        words = a["transcript"].split()
        tags = [supplier] if supplier in a["transcript"] else ["مشتريات"]
        cards.append({"answer_index": a["index"], "title": " ".join(words[:6]) + ("…" if len(words) > 6 else ""),
                      "fact": a["transcript"], "tags": tags, "confidence": 2})
    return cards


@app.post("/api/extract")
def extract():
    d, supplier, day = ctx()
    answers = []
    for a in d.get("answers") or []:
        if isinstance(a, dict) and str(a.get("transcript") or "").strip():
            try:
                answers.append({"index": int(a.get("index")), "transcript": mask(a["transcript"]).strip()[:2000]})
            except (TypeError, ValueError):
                continue
    if not answers:
        return jsonify(cards=[], source="empty")
    system = (
        "أنت \"راوي\". حوّل أجوبة عمر (موظف مشتريات بشركة النخيل للمقاولات) لبطاقات معرفة لبديلته رنا.\n"
        "- ارجع JSON فقط بهالشكل: {\"cards\":[{\"answer_index\":0,\"title\":\"...\",\"fact\":\"...\",\"tags\":[\"...\"],\"confidence\":3}]}\n"
        "- ٦ بطاقات كحد أقصى. answer_index هو رقم الجواب اللي جت منه المعلومة.\n"
        "- title عنوان قصير (٢-٦ كلمات). fact جملة أو جملتين باللهجة الأردنية، فيها الأرقام والأسماء زي ما انقالت.\n"
        "- tags من ١ لـ٣ وسوم قصيرة. confidence من ١ لـ٣ حسب وضوح المعلومة.\n"
        "- ممنوع تخترع أي معلومة مش موجودة بالأجوبة. \"[حُذفت]\" يعني كلمة سر محذوفة؛ لا تخمّنها."
    )
    user = f"المورد المختار: {supplier} — اليوم من الشهر: {day}\n\nالأجوبة:\n" + "\n".join(
        f"[{a['index']}] {a['transcript']}" for a in answers)
    obj = first_json(safe_llm("extract", system, user, 1200))
    valid = {a["index"] for a in answers}
    cards = []
    for c in (obj or {}).get("cards", []) if isinstance((obj or {}).get("cards"), list) else []:
        try:
            ai = int(c.get("answer_index"))
            title, fact = str(c.get("title", "")).strip(), str(c.get("fact", "")).strip()
            if ai not in valid or not title or not fact:
                continue
            tags = [str(t).strip() for t in (c.get("tags") or []) if str(t).strip()][:3]
            conf = max(1, min(3, int(c.get("confidence") or 2)))
            cards.append({"answer_index": ai, "title": mask(title), "fact": mask(fact), "tags": tags,
                          "confidence": conf})
        except (TypeError, ValueError, AttributeError):
            continue
    if cards:
        return jsonify(cards=cards[:6], source="model")
    return jsonify(cards=fallback_cards(answers, supplier), source="fallback")


# ---------------------------------------------------------------- ask
AR_STOP = set("شو اللي على عن مع هاد هاي هذا هذه كيف وين مين ليش لما اذا إذا في من الى إلى بس كان كانت لازم بدي بده عشان او أو ولا انه أنه هو هي احنا انا أنا انت عمر".split())


def norm_tokens(text):
    t = re.sub(r"[ً-ْـ]", "", str(text))
    t = re.sub(r"[أإآ]", "ا", t).replace("ة", "ه").replace("ى", "ي")
    out = set()
    for w in re.findall(r"[ء-ي0-9A-Za-z]+", t):
        if w in AR_STOP:
            continue
        w = re.sub(r"^و(?=..)", "", w)
        w = re.sub(r"^(بال|لل|فال|كال|ال)(?=...)", "", w)
        if len(w) > 2:
            out.add(w)
    return out


def overlap_answer(question, cards):
    q = norm_tokens(question)
    best, score = None, 0
    for c in cards:
        s = len(q & norm_tokens(f"{c.get('title', '')} {c.get('fact', '')}"))
        if s > score:
            best, score = c, s
    if best and score >= 2:
        return {"answer": str(best.get("fact", "")), "card_id": str(best.get("id")), "source": "fallback"}
    return {"unknown": True, "source": "fallback"}


@app.post("/api/ask")
def ask():
    d = request.get_json(silent=True) or {}
    question = mask(d.get("question", "")).strip()[:500]
    cards = [c for c in (d.get("cards") or []) if isinstance(c, dict) and c.get("id") is not None][:40]
    if not question or not cards:
        return jsonify(unknown=True, source="empty")
    system = (
        "أنت \"راوي\". رنا (بديلة عمر بقسم المشتريات بشركة النخيل) بتسأل. جاوب فقط من البطاقات المعطاة.\n"
        "- ارجع JSON فقط: {\"answer\":\"...\",\"card_id\":\"...\"} أو {\"unknown\":true} إذا الجواب مش موجود بالبطاقات.\n"
        "- الجواب باللهجة الأردنية، ٦٠ كلمة أو أقل، ومباشر.\n"
        "- card_id هو id البطاقة اللي أخذت منها الجواب.\n"
        "- ممنوع تضيف أي معلومة مش موجودة بالبطاقات."
    )
    user = "البطاقات:\n" + "\n".join(
        f"- id={c['id']} | {mask(c.get('title', ''))} | {mask(c.get('fact', ''))}" for c in cards
    ) + f"\n\nسؤال رنا: {question}"
    obj = first_json(safe_llm("ask", system, user, 400))
    ids = {str(c["id"]) for c in cards}
    if obj:
        if obj.get("unknown") is True:
            return jsonify(unknown=True, source="model")
        ans, cid = str(obj.get("answer") or "").strip(), str(obj.get("card_id") or "")
        if ans and cid in ids:
            return jsonify(answer=ans, card_id=cid, source="model")
    return jsonify(overlap_answer(question, cards))


# ---------------------------------------------------------------- misc
@app.get("/api/health")
def health():
    p = provider()
    model = ANTHROPIC_MODEL if p == "anthropic" else (state["openrouter_model"] or OPENROUTER_DEFAULT) if p else None
    return jsonify(ok=True, provider=p or "fallback", model=model)


@app.get("/")
def index():
    return send_from_directory(os.path.join(BASE, "templates"), "index.html")


if __name__ == "__main__":
    threading.Thread(target=discover_openrouter_model, daemon=True).start()
    log.info("Rawi starting — provider: %s", provider() or "fallback (no key)")
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
