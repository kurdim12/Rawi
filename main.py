"""Rawi (راوي) — ذاكرة الشركة بصوت أصحابها.

One Flask process: page routes, a JSON API, LLM calls that always have a deterministic fallback,
and a small in-memory store seeded from data/seed.json and persisted as JSON. See docs/SPEC.md.
"""
import copy
import hashlib
import json
import logging
import os
import re
import threading
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from functools import partial

import requests
from dotenv import load_dotenv
from flask import (Flask, jsonify, redirect, render_template, render_template_string, request,
                   send_file, send_from_directory)
from werkzeug.exceptions import HTTPException

load_dotenv()

BASE = os.path.dirname(os.path.abspath(__file__))
TEMPLATES = os.path.join(BASE, "templates")
SEED_PATH = os.path.join(BASE, "data", "seed.json")
DATA_DIR = os.path.join(BASE, os.getenv("RAWI_DATA_DIR", "").strip() or os.path.join("data", "runtime"))
STATE_PATH = os.path.join(DATA_DIR, "state.json")
AUDIO_DIR = os.path.join(DATA_DIR, "audio")
DEMO_AUDIO_DIR = os.path.join(BASE, "static", "audio")
MAX_AUDIO = 10 * 1024 * 1024

app = Flask(__name__, static_folder=os.path.join(BASE, "static"), template_folder=TEMPLATES)
app.config.update(SEND_FILE_MAX_AGE_DEFAULT=0, MAX_CONTENT_LENGTH=12 * 1024 * 1024)
app.json.ensure_ascii = False
app.json.sort_keys = False
log = logging.getLogger("rawi")
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

# ================================================================ LLM providers
TIMEOUT = 8
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
OPENROUTER_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "").strip() or "claude-sonnet-5-5"
OPENROUTER_DEFAULT = "anthropic/claude-sonnet-5.5"
LLM = {"openrouter_model": os.getenv("OPENROUTER_MODEL", "").strip()}


def provider():
    if ANTHROPIC_KEY:
        return "anthropic"
    if OPENROUTER_KEY:
        return "openrouter"
    return None


def discover_openrouter_model():
    """Pick the newest anthropic/claude-sonnet* slug when OPENROUTER_MODEL is unset."""
    if LLM["openrouter_model"] or provider() != "openrouter":
        return
    try:
        r = requests.get("https://openrouter.ai/api/v1/models", timeout=TIMEOUT)
        r.raise_for_status()
        models = [m for m in r.json().get("data", [])
                  if m.get("id", "").startswith("anthropic/claude-sonnet") and ":" not in m["id"]]
        if models:
            LLM["openrouter_model"] = max(models, key=lambda m: m.get("created", 0))["id"]
            log.info("OpenRouter model: %s", LLM["openrouter_model"])
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
            json={"model": LLM["openrouter_model"] or OPENROUTER_DEFAULT, "max_tokens": max_tokens,
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


# ================================================================ text helpers
SECRET_WORD = re.compile(r"(كلمة السر|كلمة سر|الباسورد|باسورد|password)(\s*(?:هي|هو|:)?\s*)([^\s،,.]+)", re.I)
MIXED = re.compile(r"(?<![A-Za-z0-9])(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{6,}(?![A-Za-z0-9])")
NUM = re.compile(r"[0-9٠-٩]+(?:[.,][0-9٠-٩]+)?\s*[%٪]?")
AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
FEMALE_NAMES = {"رنا", "دانة", "هدى", "سلمى"}
AR_STOP = set("شو اللي على عن مع هاد هاي هذا هذه كيف وين مين ليش لما اذا إذا في من الى إلى بس كان كانت لازم بدي بده عشان او أو ولا انه أنه هو هي احنا انا أنا انت عمر".split())
SUFFIXES = ("ات", "ين", "ون", "يه", "ها", "هم", "ه")


def mask(text):
    """Server-side safety net; the client already masks before sending."""
    text = SECRET_WORD.sub(lambda m: m.group(1) + m.group(2) + "[حُذفت]", str(text or ""))
    return MIXED.sub("[حُذفت]", text)


def clean(value, limit):
    return mask(value).strip()[:limit] if isinstance(value, (str, int, float)) else ""


def ar(n):
    return str(n).translate(AR_DIGITS)


def days_ar(n):
    return {0: "ولا يوم", 1: "يوم واحد", 2: "يومين"}.get(n) or f"{ar(n)} {'أيام' if n <= 10 else 'يوم'}"


def is_female(p):
    return (p or {}).get("gender") == "f" or (p or {}).get("name") in FEMALE_NAMES


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


def stem(w):
    for suf in SUFFIXES:
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[:-len(suf)]
    return w


def overlap(a, b):
    """How many tokens of `a` match a token of `b` (same stem, or one stem prefixes the other)."""
    sb = {stem(w) for w in b}
    return sum(1 for w in {stem(x) for x in a}
               if any(w == v or (min(len(w), len(v)) >= 3 and (w.startswith(v) or v.startswith(w))) for v in sb))


def as_int(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def parse_day(v):
    d = as_int(v, None)
    return max(1, min(28, d)) if d is not None else None


def short_id(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:6]}"


# ================================================================ dates
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$")
TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def today():
    return date.today().isoformat()


def now_stamp():
    return datetime.now().replace(microsecond=0).isoformat()


def valid_date(v):
    try:
        return date.fromisoformat(v).isoformat() if isinstance(v, str) else None
    except ValueError:
        return None


def rebase(obj, delta):
    """Shift every ISO date/datetime string inside obj by `delta` (a timedelta), in place."""
    items = obj.items() if isinstance(obj, dict) else enumerate(obj) if isinstance(obj, list) else ()
    for k, v in items:
        if isinstance(v, str) and ISO_RE.match(v):
            obj[k] = (date.fromisoformat(v[:10]) + delta).isoformat() + v[10:]
        elif isinstance(v, (dict, list)):
            rebase(v, delta)


# ================================================================ store
LIST_KEYS = ("people", "topics", "sessions", "cards", "questions", "roles", "onboarding")
DEFAULTS = {  # fields every record of a kind is guaranteed to have after materialization
    "topics": {"covered": False, "critical": False, "value_jod_year": 0},
    "sessions": {"time": "10:00", "status": "scheduled", "title": "جلسة تسليم", "summary": "", "duration_min": 0,
                 "topic_ids": [], "question_ids": [], "answers": [], "turns": []},
    "cards": {"status": "pending", "tags": [], "confidence": 2, "critical": False, "value_jod_year": 0,
              "missing_in_official": False, "audio_id": None, "topic_id": None, "session_id": None},
    "questions": {"status": "open", "session_id": None},
}
OPENING = "أهلاً {name}. خلّينا نبلّش: شو الإشي اللي لو موظف جديد عمله حسب النظام بالزبط رح يخرب؟"
COMPANY = {"name": "شركة النخيل للمقاولات", "short": "النخيل", "city": "عمّان", "employees": 340,
           "suppliers": ["سما للاتصالات", "الرواد للمواد الكهربائية", "مؤسسة الحديد الأردنية"]}
BUILTIN_SEED = {  # used only when data/seed.json is missing or invalid, so the app always runs
    "company": COMPANY,
    "people": [
        {"id": "omar", "name": "عمر", "full_name": "عمر الحدّاد", "initials": "ع", "role": "مسؤول مشتريات أول",
         "dept": "المشتريات", "status": "leaving", "last_day_offset": 9, "years": 7, "successor": "rana",
         "manager": "samer", "reason": "انتقال لشركة ثانية"},
        {"id": "rana", "name": "رنا", "full_name": "رنا العمري", "initials": "ر", "role": "مسؤولة مشتريات",
         "dept": "المشتريات", "status": "incoming", "start_offset": -3, "predecessor": "omar", "manager": "samer"},
        {"id": "samer", "name": "م. سامر", "full_name": "م. سامر القسوس", "initials": "س", "role": "مدير المشتريات",
         "dept": "المشتريات", "status": "active"}],
    "topics": [
        {"id": "omar-suppliers", "employee_id": "omar", "name": "الموردين الرئيسيين", "covered": True,
         "critical": True, "value_jod_year": 18000},
        {"id": "omar-approvals", "employee_id": "omar", "name": "الموافقات والاستثناءات", "covered": False,
         "critical": True, "value_jod_year": 9000}],
    "sessions": [
        {"id": "s-omar-1", "employee_id": "omar", "title": "الموردين والتوريد", "date_offset": -6, "time": "10:00",
         "duration_min": 34, "status": "done", "topic_ids": ["omar-suppliers"],
         "summary": "الإسمنت بالصيف · قطع الغيار المستعجلة",
         "answers": [
             {"index": 0, "question": OPENING.format(name="عمر"), "audio_id": None,
              "transcript": "بشهر ٧ و٨ بنطلب الإسمنت قبل أسبوعين بدل أسبوع، لأنه المصانع بتوقف للصيانة والكميات بتقلّ."},
             {"index": 1, "question": "شو الاستثناء اللي بتعمله وما حدا بالقسم بيعرف عنه غيرك؟", "audio_id": None,
              "transcript": "قطع غيار المعدات المستعجلة للموقع بنكتفي فيها بعرض سعر واحد، ومنوثّق السبب بإيميل لـ م. سامر."}]}],
    "cards": [
        {"id": "k-omar-1", "employee_id": "omar", "session_id": "s-omar-1", "answer_index": 0,
         "topic_id": "omar-suppliers", "title": "الإسمنت بالصيف", "tags": ["توريد", "مواسم"], "confidence": 3,
         "fact": "بشهر ٧ و٨ بنطلب الإسمنت قبل أسبوعين بدل أسبوع، لأنه المصانع بتوقف للصيانة والكميات بتقلّ.",
         "status": "approved", "critical": True, "value_jod_year": 6000, "missing_in_official": True,
         "created_offset": -6, "audio_id": None},
        {"id": "k-omar-2", "employee_id": "omar", "session_id": "s-omar-1", "answer_index": 1,
         "topic_id": "omar-suppliers", "title": "قطع الغيار المستعجلة", "tags": ["عروض أسعار", "استثناء"],
         "fact": "لازم ٣ عروض أسعار لأي مادة جديدة، بس قطع غيار المعدات المستعجلة للموقع بنكتفي بعرض واحد ومنوثّق السبب بإيميل لـ م. سامر.",
         "confidence": 3, "status": "approved", "critical": False, "value_jod_year": 2400,
         "missing_in_official": True, "created_offset": -6, "audio_id": None}],
    "questions": [
        {"id": "q-1", "employee_id": "omar", "text": "وين محفوظ عقد سما للاتصالات الأصلي، ومين معه نسخة؟",
         "asked_by": "rana", "status": "open", "created_offset": -1}],
    "roles": [], "onboarding": [],
}

LOCK = threading.RLock()
STATE = {}


class ApiError(Exception):
    def __init__(self, msg, code=400):
        super().__init__(msg)
        self.msg, self.code = msg, code


def read_seed():
    """(seed dict, hash). Falls back to the built-in seed if seed.json is missing or invalid."""
    try:
        with open(SEED_PATH, "rb") as f:
            raw = f.read()
        seed = json.loads(raw)
        if isinstance(seed, dict) and any(isinstance(p, dict) and p.get("id") for p in seed.get("people") or []):
            return seed, hashlib.sha256(raw).hexdigest()[:16]
        log.warning("seed.json has no people; using the built-in seed")
    except (OSError, ValueError) as e:
        log.warning("seed.json unavailable (%s); using the built-in seed", type(e).__name__)
    raw = json.dumps(BUILTIN_SEED, sort_keys=True).encode()
    return BUILTIN_SEED, "builtin-" + hashlib.sha256(raw).hexdigest()[:16]


def materialize(seed):
    """Seed (relative day offsets) → state (ISO dates relative to today), with defaults filled."""
    st = copy.deepcopy(seed)
    base = date.today()

    def at(off):
        return (base + timedelta(days=as_int(off))).isoformat()

    st["company"] = st.get("company") if isinstance(st.get("company"), dict) else dict(COMPANY)
    for key in LIST_KEYS:
        st[key] = [x for x in st.get(key) or [] if isinstance(x, dict)]
        for x in st[key]:
            for k, v in DEFAULTS.get(key, {}).items():
                x.setdefault(k, copy.deepcopy(v))
    for p in st["people"]:
        if "last_day_offset" in p:
            p["last_day"] = at(p["last_day_offset"])
        if "start_offset" in p:
            p["start_date"] = at(p["start_offset"])
    for s in st["sessions"]:
        s["date"] = at(s["date_offset"]) if "date_offset" in s else valid_date(s.get("date")) or base.isoformat()
        for i, a in enumerate(s["answers"]):
            for k, v in {"index": i, "question": "", "transcript": "", "audio_id": None}.items():
                a.setdefault(k, v)
        if not s["turns"]:
            for a in s["answers"]:
                if a["question"]:
                    s["turns"].append({"role": "rawi", "text": a["question"]})
                s["turns"].append({"role": "employee", "text": a["transcript"], "answer_index": a["index"]})
    for c in st["cards"]:
        c["created"] = at(c.get("created_offset"))
    sessions = {s["id"]: s for s in st["sessions"] if s.get("id")}
    for q in st["questions"]:
        q["created"] = at(q.get("created_offset"))
        s = sessions.get(q["session_id"])
        if s and q.get("id") not in s["question_ids"]:
            s["question_ids"].append(q.get("id"))
    return st


def save():
    """Atomic write of the whole state (callers hold LOCK)."""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = STATE_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(STATE, f, ensure_ascii=False, indent=1)
        os.replace(tmp, STATE_PATH)
    except OSError as e:
        log.warning("could not persist state (%s); keeping it in memory", type(e).__name__)


def reseed(loaded=None):
    seed, seed_hash = loaded or read_seed()
    with LOCK:
        STATE.clear()
        STATE.update(materialize(seed), seed_hash=seed_hash, seeded_on=today())
        save()


def fresh():
    """Keep relative dates true: if the state was seeded on an earlier day, shift every date forward."""
    if STATE.get("seeded_on") != today():
        delta = date.today() - date.fromisoformat(STATE["seeded_on"])
        rebase(STATE, delta)
        STATE["seeded_on"] = today()
        save()
        log.info("state rebased by %s day(s)", delta.days)


def boot():
    loaded = read_seed()
    seed_hash = loaded[1]
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            st = json.load(f)
        ok = (isinstance(st, dict) and st.get("seed_hash") == seed_hash and valid_date(st.get("seeded_on"))
              and all(isinstance(st.get(k), list) for k in LIST_KEYS))
    except (OSError, ValueError):
        ok = False
    if not ok:
        log.info("seeding state from %s", "seed.json" if not seed_hash.startswith("builtin") else "built-in seed")
        reseed(loaded)
        return
    with LOCK:
        STATE.clear()
        STATE.update(st)
        fresh()
    log.info("state loaded from %s", STATE_PATH)


@contextmanager
def store(write=False):
    """Hold the store lock (and refresh dates); persist on normal exit when write=True."""
    with LOCK:
        fresh()
        yield STATE
        if write:
            save()


def find(kind, item_id):
    return next((x for x in STATE[kind] if x.get("id") == item_id), None) if item_id else None


def must(kind, item_id, msg):
    """The item, or a JSON error: 400 when no id was given, 404 when it does not exist."""
    item = find(kind, item_id)
    if item is None:
        raise ApiError(msg, 404 if item_id else 400)
    return item


def body():
    d = request.get_json(silent=True)
    return d if isinstance(d, dict) else {}


# ---------------------------------------------------------------- audio files
AUDIO_ID_RE = re.compile(r"^[a-z0-9-]{6,64}$")
EXT_MIME = {".webm": "audio/webm", ".mp4": "audio/mp4", ".m4a": "audio/mp4", ".ogg": "audio/ogg",
            ".oga": "audio/ogg", ".wav": "audio/wav", ".mp3": "audio/mpeg"}
MIME_EXT = {"audio/webm": ".webm", "video/webm": ".webm", "audio/mp4": ".mp4", "video/mp4": ".mp4",
            "audio/x-m4a": ".m4a", "audio/m4a": ".m4a", "audio/ogg": ".ogg", "application/ogg": ".ogg",
            "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav", "audio/vnd.wave": ".wav",
            "audio/mpeg": ".mp3", "audio/mp3": ".mp3"}


def audio_files():
    """{audio_id: path} for runtime recordings plus optional demo clips in static/audio."""
    out = {}
    for folder in (DEMO_AUDIO_DIR, AUDIO_DIR):  # runtime recordings win
        try:
            names = os.listdir(folder)
        except OSError:
            continue
        for n in names:
            stem_, ext = os.path.splitext(n)
            if ext.lower() in EXT_MIME and AUDIO_ID_RE.match(stem_):
                out[stem_] = os.path.join(folder, n)
    return out


def audio_url(audio_id, audio):
    return f"/media/{audio_id}" if audio_id in audio else None


# ---------------------------------------------------------------- materialized views
def days_left(p):
    try:
        return max(0, (date.fromisoformat(p["last_day"]) - date.today()).days)
    except (KeyError, TypeError, ValueError):
        return None


def view_person(p):
    v = dict(p)
    if p.get("status") == "leaving":
        v["days_left"] = days_left(p)
    return v


def view_card(c, audio):
    return dict(c, audio_url=audio_url(c.get("audio_id"), audio))


def view_session(s, audio):
    v = dict(s, starts_at=f"{s['date']}T{s.get('time') or '00:00'}")
    v["answers"] = [dict(a, audio_url=audio_url(a.get("audio_id"), audio)) for a in s["answers"]]
    return v


def session_questions(s):
    return [q for q in STATE["questions"] if q.get("session_id") == s["id"] or q.get("id") in s["question_ids"]]


def session_detail(s, audio):
    v = view_session(s, audio)
    p = find("people", s["employee_id"])
    v["person"] = view_person(p) if p else None
    v["topics"] = [t for t in STATE["topics"] if t["id"] in s["topic_ids"]]
    v["questions"] = session_questions(s)
    v["cards"] = [view_card(c, audio) for c in STATE["cards"] if c.get("session_id") == s["id"]]
    return v


def person_ctx(pid):
    """Plain-dict snapshot of a person for prompts and fallbacks (safe to use outside the lock)."""
    p = find("people", pid) or find("people", "omar") or (STATE["people"] or [{}])[0]
    succ = find("people", p.get("successor"))
    suppliers = STATE["company"].get("suppliers") or []
    return {"id": p.get("id"), "name": p.get("name") or "عمر", "role": p.get("role") or "موظف",
            "dept": p.get("dept") or "", "female": is_female(p), "days_left": days_left(p),
            "successor": (succ or {}).get("name") or "الموظف الجديد",
            "company": STATE["company"].get("name") or "الشركة",
            "default_supplier": suppliers[0] if p.get("dept") == "المشتريات" and suppliers else None}


def supplier_day(d, pc, session=None):
    s = session or {}
    supplier = str(d.get("supplier") or s.get("supplier") or pc["default_supplier"] or "").strip()[:60] or None
    return supplier, parse_day(d.get("day")) or parse_day(s.get("day"))


# ================================================================ follow-up questions
BANKS = {
    "المشتريات": [
        "لو {supplier} أخّروا التوريد عن يوم {day}، مين بتتصل فيه أول، وشو الخطة البديلة اللي مش مكتوبة بأي مكان؟",
        "شو الاستثناء اللي بتعمله مع {supplier} وما حدا بالقسم بيعرف عنه غيرك؟",
        "إذا كنت إجازة يوم {day}، مين بيغطّي دفعة {supplier}، وشو بيصير إذا ما حدا غطّى؟",
        "بوابة الطلبات تبعت {supplier}: وين محفوظة بيانات الدخول، ومين اللي بيعطي {successor} الصلاحية؟",
        "شو أكتر غلطة رح يعملها موظف جديد مع {supplier} لو مشي حسب الإجراء الرسمي بالحرف؟",
        "في مورد معتمد على النظام بس فعلياً ما بنتعامل معه؟ ليش، ومين لازم يعرف القصة؟",
        "أي طلبية لازم تنطلب بكّير عن موعدها الرسمي، وشو بيصير لو استنينا؟",
        "يا {name}، مين الشخص عند الموردين اللي فعلياً بيحلّ المشاكل، مش اللي اسمه بالعقد؟"],
    "المالية": [
        "شو الخطوة اللي لازم تنعمل آخر كل شهر قبل الإقفال، وما إلها أثر بأي إجراء مكتوب؟",
        "في قيد أو حساب لازم يتعدّل يدوياً كل فترة؟ ليش، وشو بيصير إذا انترك؟",
        "لو تأخّر تحويل لـ{supplier} عن يوم {day}، مين لازم ينحكى معه بالبنك، وشو بالزبط بينقال؟",
        "مين بالبنك فعلياً بيرد لما يعلق تحويل، ومين لازم يعرّف {successor} عليه؟",
        "النظام المحاسبي: وين محفوظة بيانات الدخول، ومين بيعطي الصلاحية لحدا جديد؟",
        "شو أكتر غلطة رح يعملها محاسب جديد لو طبّق السياسة المالية بالحرف؟",
        "مين بيوقّع على الدفعات المستعجلة لما المدير المالي مسافر، ولحد أي مبلغ؟",
        "يا {name}، شو الأرقام اللي لازم تنراجع بالعين قبل ما يطلع التقرير للإدارة، وليش؟"],
    "المشاريع": [
        "شو الإشي بالموقع اللي المخططات بتقول عكسه، والكل ماشي عليه؟",
        "لو تأخّرت صبّة الباطون، مين أول واحد لازم ينحكى معه، وشو الخطة البديلة؟",
        "مين المقاول الفرعي اللي لازم ينراقب عن قرب، وليش؟",
        "تصاريح البلدية والدفاع المدني: مين بيتابعها فعلياً، ووين محفوظة الملفات؟",
        "شو أكتر غلطة رح يعملها مهندس جديد بالموقع لو مشي حسب المواصفات بالحرف؟",
        "شو الفحوصات اللي لازم تنعمل قبل الاستلام وما حدا بيطلبها رسمياً؟",
        "يا {name}، شو أول إشي لازم {successor} يعرفه أول أسبوع بالموقع عشان ما يتورّط؟"],
    "اللوجستيات": [
        "شو المواد اللي ما إلها مكان مسجّل بالمستودع، وكيف الواحد بيلاقيها؟",
        "لو وصلت شحنة برّا الدوام، مين بيستلمها، ومين بيوقّع؟",
        "في مادة الجرد الرسمي بيقول إنها موجودة وهي فعلياً مش موجودة؟ ليش؟",
        "مفاتيح المستودع والأقفال: مين معه نسخة، ومين بيقرّر يعطي حدا جديد؟",
        "شو أكتر غلطة رح يعملها أمين مستودع جديد لو مشي حسب الإجراء الرسمي بالحرف؟",
        "مين الناقل اللي الشركة بتعتمد عليه لما الأمور تزنق، وكيف بينحكى معه؟",
        "يا {name}، شو المواد اللي لازم تنطلب بكّير قبل الصيف أو الشتا، وليش؟"],
}
GENERIC_BANK = [
    "يا {name}، شو الإشي اللي ما حدا بيعرفه بالشغل غيرك، ولو غبت بكرا مين رح يعلق؟",
    "مين أكتر شخص لازم {successor} يتعرّف عليه أول أسبوع، وليش؟",
    "شو الاستثناء اللي صار عادة بالقسم، ومش مكتوب بأي مكان؟",
    "في نظام أو ملف مهم: وين محفوظة بيانات الدخول، ومين بيعطي الصلاحية لحدا جديد؟",
    "شو أكتر غلطة رح يعملها موظف جديد لو مشي حسب الإجراء الرسمي بالحرف؟",
    "شو المهمة اللي بتصير مرّة بالسنة، وما حدا رح يتذكّرها لما يجي وقتها؟",
    "لو صار ضغط آخر الشهر، شو الأولويات اللي فعلياً بتنقدّم على غيرها؟"]


def is_readback(n_answers):
    return n_answers > 0 and n_answers % 3 == 0


def fallback_question(pc, supplier, day, said, asked, n_answers):
    """Dept-aware question bank; every 3rd answer reads back the numbers the person said."""
    about = f" بخصوص {supplier}" if supplier else ""
    if is_readback(n_answers):
        nums = list(dict.fromkeys(n.strip() for n in NUM.findall(" ".join(mask(t) for t in said))))[:4]
        if nums:
            return f"خلّيني أتأكد: ذكرت {' و'.join(nums)}{about}. هيك الأرقام صح، ولا في إشي لازم أصلّحه؟"
        last = " ".join(mask(said[-1]).split()[:10]) if said else ""
        if last:
            return f"خلّيني أتأكد إني فهمت صح{about}: حكيت «{last}…». هيك بالزبط، ولا في إشي لازم أصلّحه؟"
    fill = {"name": pc["name"], "supplier": supplier, "day": day, "successor": pc["successor"]}
    bank = [q for q in BANKS.get(pc["dept"], GENERIC_BANK) if all(fill.get(f) for f in re.findall(r"{(\w+)}", q))]
    bank = [q.format(**fill) for q in bank or GENERIC_BANK]
    return next((q for q in bank if q not in asked), bank[max(0, n_answers - 1) % len(bank)])


def followup_system(pc, supplier, day, readback, topics_left):
    f = pc["female"]
    his = "ها" if f else "ه"
    left = f"، باقيل{his} {days_ar(pc['days_left'])} بالشركة" if pc["days_left"] is not None else ""
    lines = [
        f"أنت \"راوي\"، بتدير جلسات تسليم المعرفة في {pc['company']}. بتحاور {pc['name']} ({pc['role']}، "
        f"قسم {pc['dept']}{left}) عشان خبرت{his} توصل لـ{pc['successor']}.",
        "القواعد:",
        "- اسأل سؤال متابعة واحد بس، باللهجة الأردنية، ٢٥ كلمة أو أقل، بأسلوب صحفي فضولي ومحدد.",
        "- طلّع المعرفة اللي مش مكتوبة: الاستثناءات، البدائل لما حدا يغيب، الصلاحيات، وشو بيخرب لو حدا مشي \"حسب النظام\" بالحرف.",
        f"- خاطب {pc['name']} بصيغة {'المؤنث' if f else 'المذكر'}، ولا تكرّر سؤال انسأل قبل."]
    if supplier:
        lines.append(f"- اربط السؤال بالمورد \"{supplier}\"" + (f" وبيوم {day} من الشهر" if day else "")
                     + " لما يكون الربط طبيعي.")
    if topics_left:
        lines.append("- مواضيع لسا ما توثّقت: " + "، ".join(topics_left) + ".")
    if readback:
        lines.append(f"- هالمرة بالذات: اقرأ على {pc['name']} الأرقام والأسماء اللي {'ذكرتها' if f else 'ذكرها'} "
                     f"بالزبط زي ما {'قالتها' if f else 'قالها'}، واطلب {'منها' if f else 'منه'} يأكّدها أو يصحّحها.")
    lines += ["- ممنوع تطلب كلمة سر أبداً. إذا انذكر حساب أو نظام، اسأل وين محفوظة بيانات الدخول ومين بيعطي الصلاحية.",
              "- اكتب السؤال فقط، بدون مقدمة أو شرح أو علامات تنصيص."]
    return "\n".join(lines)


def next_question(pc, supplier, day, turns, said, n_answers, topics_left=()):
    """(question, source): the model's follow-up, else the fallback bank."""
    readback = is_readback(n_answers)
    convo = "\n".join(("راوي: " if t.get("role") == "rawi" else f"{pc['name']}: ") + mask(t.get("text", ""))[:1200]
                      for t in turns[-12:])
    out = safe_llm("followup", followup_system(pc, supplier, day, readback, topics_left),
                   f"{convo}\n\nاكتب سؤال المتابعة الجاي.", 200)
    q = ""
    if out:
        lines = [ln.strip().strip("\"'«»“”`*-").strip() for ln in out.splitlines() if ln.strip()]
        q = re.sub(r"^(راوي|سؤال|السؤال)\s*[:：]\s*", "", lines[0] if lines else "")
        if len(q.split()) > 40 or re.search(r"(اعطيني|ابعتلي|قلّي|قلي).{0,15}(كلمة السر|الباسورد|باسورد)", q):
            q = ""
    if q:
        return mask(q), "model"
    asked = {t.get("text") for t in turns if t.get("role") == "rawi"}
    return fallback_question(pc, supplier, day, said, asked, n_answers), "fallback"


# ================================================================ card extraction
def fallback_cards(answers, supplier, dept):
    cards = []
    for a in answers:
        words = a["transcript"].split()
        tags = [supplier] if supplier and supplier in a["transcript"] else [dept or "تسليم"]
        cards.append({"answer_index": a["index"], "title": " ".join(words[:6]) + ("…" if len(words) > 6 else ""),
                      "fact": a["transcript"], "tags": tags, "confidence": 2})
    return cards


def extract_cards(pc, answers, supplier, day):
    """(cards, source) from [{index, transcript}] — the model first, else one card per answer."""
    system = (
        f"أنت \"راوي\". حوّل أجوبة {pc['name']} ({pc['role']}، قسم {pc['dept']} في {pc['company']}) "
        f"لبطاقات معرفة لـ{pc['successor']}.\n"
        "- ارجع JSON فقط بهالشكل: {\"cards\":[{\"answer_index\":0,\"title\":\"...\",\"fact\":\"...\",\"tags\":[\"...\"],\"confidence\":3}]}\n"
        "- ٦ بطاقات كحد أقصى. answer_index هو رقم الجواب اللي جت منه المعلومة.\n"
        "- title عنوان قصير (٢-٦ كلمات). fact جملة أو جملتين باللهجة الأردنية، فيها الأرقام والأسماء زي ما انقالت.\n"
        "- tags من ١ لـ٣ وسوم قصيرة. confidence من ١ لـ٣ حسب وضوح المعلومة.\n"
        "- ممنوع تخترع أي معلومة مش موجودة بالأجوبة. \"[حُذفت]\" يعني كلمة سر محذوفة؛ لا تخمّنها."
    )
    head = f"المورد المختار: {supplier}" + (f" — اليوم من الشهر: {day}" if day else "") + "\n\n" if supplier else ""
    user = head + "الأجوبة:\n" + "\n".join(f"[{a['index']}] {a['transcript']}" for a in answers)
    obj = first_json(safe_llm("extract", system, user, 1200)) or {}
    valid = {a["index"] for a in answers}
    cards = []
    for c in obj.get("cards") if isinstance(obj.get("cards"), list) else []:
        try:
            ai = int(c.get("answer_index"))
            title, fact = str(c.get("title", "")).strip(), str(c.get("fact", "")).strip()
            if ai not in valid or not title or not fact:
                continue
            tags = [str(t).strip() for t in (c.get("tags") or []) if str(t).strip()][:3]
            cards.append({"answer_index": ai, "title": mask(title), "fact": mask(fact), "tags": tags,
                          "confidence": max(1, min(3, int(c.get("confidence") or 2)))})
        except (TypeError, ValueError, AttributeError):
            continue
    if cards:
        return cards[:6], "model"
    return fallback_cards(answers, supplier, pc["dept"]), "fallback"


def assign_topic(card, topics, session_topic_ids):
    """Best token overlap with the person's topic names/keywords; else the session's first topic;
    else the person's first uncovered topic."""
    words = norm_tokens(f"{card['title']} {card['fact']} {' '.join(card['tags'])}")
    best, score = None, 0
    for t in topics:
        s = overlap(words, norm_tokens(f"{t.get('name', '')} {' '.join(map(str, t.get('keywords') or []))}"))
        if s > score:
            best, score = t, s
    if best:
        return best["id"]
    if session_topic_ids:
        return session_topic_ids[0]
    pool = [t for t in topics if not t.get("covered")] or topics
    return pool[0]["id"] if pool else None


# ================================================================ answering from cards
def answer_from_cards(question, cards, asker, about, company):
    """{answer, card_id, source} or {unknown: true, source} — the model first, else word overlap."""
    q = norm_tokens(question)
    if len(cards) > 40:
        cards = sorted(cards, key=lambda c: -overlap(q, norm_tokens(f"{c.get('title', '')} {c.get('fact', '')}")))[:40]
    system = (
        f"أنت \"راوي\". {asker} عن {about} بـ{company}. جاوب فقط من البطاقات المعطاة.\n"
        "- ارجع JSON فقط: {\"answer\":\"...\",\"card_id\":\"...\"} أو {\"unknown\":true} إذا الجواب مش موجود بالبطاقات.\n"
        "- الجواب باللهجة الأردنية، ٦٠ كلمة أو أقل، ومباشر.\n"
        "- card_id هو id البطاقة اللي أخذت منها الجواب.\n"
        "- ممنوع تضيف أي معلومة مش موجودة بالبطاقات."
    )
    user = "البطاقات:\n" + "\n".join(
        f"- id={c['id']} | {mask(c.get('title', ''))} | {mask(c.get('fact', ''))}" for c in cards
    ) + f"\n\nالسؤال: {question}"
    obj = first_json(safe_llm("ask", system, user, 400))
    if obj:
        if obj.get("unknown") is True:
            return {"unknown": True, "source": "model"}
        ans, cid = str(obj.get("answer") or "").strip(), str(obj.get("card_id") or "")
        if ans and cid in {str(c["id"]) for c in cards}:
            return {"answer": mask(ans), "card_id": cid, "source": "model"}
    best, score = None, 0
    for c in cards:
        s = overlap(q, norm_tokens(f"{c.get('title', '')} {c.get('fact', '')}"))
        if s > score:
            best, score = c, s
    if best and score >= 2:
        return {"answer": str(best.get("fact", "")), "card_id": str(best.get("id")), "source": "fallback"}
    return {"unknown": True, "source": "fallback"}


def default_asker(pid):
    p = find("people", pid) or {}
    return p.get("successor") or "rana"


def add_question(pid, text, asked_by):
    """Create an open question (or return the matching unanswered one) → question dict. Caller holds LOCK."""
    key = norm_tokens(text)
    for q in STATE["questions"]:
        if q.get("employee_id") == pid and q.get("status") != "answered" and norm_tokens(q.get("text", "")) == key:
            return q
    q = {"id": short_id("q"), "employee_id": pid, "text": text, "asked_by": asked_by, "status": "open",
         "session_id": None, "created": today()}
    STATE["questions"].append(q)
    return q


# ================================================================ metrics
RISK_ORDER = {"low": 0, "medium": 1, "high": 2}


def risk_of(days, coverage, has_successor):
    days = 999 if days is None else days
    if (days <= 7 and coverage < 0.6) or (not has_successor and days <= 14):
        return "high"
    if coverage < 0.75 or days <= 14:
        return "medium"
    return "low"


def risk_reason(p, risk, days, coverage, has_successor):
    his = "ها" if is_female(p) else "ه"
    pct = f"{ar(round(coverage * 100))}٪"
    left = f"باقيل{his} {days_ar(days)}" if days is not None else "لسا ما انحدد آخر يوم"
    if not has_successor and risk == "high":
        return f"ما إل{his} بديل، و{left} — معرفت{his} موثّقة {pct} بس"
    if risk == "high":
        return f"{left} وموثّق بس {pct} من معرفت{his}"
    prefix = "لسا ما في بديل، و" if not has_successor else ""
    if coverage < 0.75 and days is not None and days <= 14:
        return f"{prefix}{left} والتوثيق لسا {pct}"
    if coverage < 0.75:
        return f"{prefix}التوثيق لسا {pct} — بدّ{his} جلسات زيادة"
    if risk == "medium":
        return f"{prefix}التوثيق {pct} بس {left} — لازم نسكّر التسليم"
    return f"{prefix}التوثيق ماشي منيح ({pct}) والوقت كافي"


def next_session_of(sessions):
    t0 = today()
    upcoming = sorted((s for s in sessions if s.get("status") in ("scheduled", "live") and s.get("date", "") >= t0),
                      key=lambda s: (s["date"], s.get("time") or ""))
    if not upcoming:
        return None
    s = upcoming[0]
    return {"id": s["id"], "date": s["date"], "time": s.get("time"), "title": s.get("title"),
            "employee_id": s.get("employee_id")}


def employee_row(p):
    pid = p["id"]
    topics = [t for t in STATE["topics"] if t.get("employee_id") == pid]
    covered = sum(1 for t in topics if t.get("covered"))
    coverage = covered / len(topics) if topics else 0.0
    cards = [c for c in STATE["cards"] if c.get("employee_id") == pid]
    sessions = [s for s in STATE["sessions"] if s.get("employee_id") == pid]
    days = days_left(p)
    succ = find("people", p.get("successor"))
    risk = risk_of(days, coverage, bool(succ))
    return {
        "id": pid, "name": p.get("name"), "full_name": p.get("full_name"), "role": p.get("role"),
        "dept": p.get("dept"), "days_left": days, "last_day": p.get("last_day"),
        "successor": p.get("successor"), "successor_name": (succ or {}).get("name"),
        "coverage": round(coverage, 2), "topics_total": len(topics), "topics_covered": covered,
        "cards": len(cards), "approved": sum(c.get("status") == "approved" for c in cards),
        "pending": sum(c.get("status") == "pending" for c in cards),
        "gaps": sum(1 for q in STATE["questions"] if q.get("employee_id") == pid and q.get("status") != "answered"),
        "sessions_done": sum(s.get("status") == "done" for s in sessions), "sessions_total": len(sessions),
        "next_session": next_session_of(sessions), "risk": risk,
        "risk_reason": risk_reason(p, risk, days, coverage, bool(succ)),
        "value_at_risk_jod": sum(as_int(t.get("value_jod_year")) for t in topics if not t.get("covered")),
        "value_protected_jod": sum(as_int(c.get("value_jod_year")) for c in cards if c.get("status") == "approved"),
    }


def compute_metrics():
    leaving = [p for p in STATE["people"] if p.get("status") == "leaving"]
    ids = {p["id"] for p in leaving}
    rows = sorted((employee_row(p) for p in leaving), key=lambda r: 999 if r["days_left"] is None else r["days_left"])
    topics = [t for t in STATE["topics"] if t.get("employee_id") in ids]
    cards, sessions = STATE["cards"], STATE["sessions"]
    by_dept = {}
    for r in rows:
        d = by_dept.setdefault(r["dept"], {"dept": r["dept"], "departing": 0, "total": 0, "covered": 0, "risk": "low"})
        d["departing"] += 1
        d["total"] += r["topics_total"]
        d["covered"] += r["topics_covered"]
        d["risk"] = max(d["risk"], r["risk"], key=RISK_ORDER.get)
    base = date.today()
    timeline = []
    for i in range(13, -1, -1):
        day = (base - timedelta(days=i)).isoformat()
        timeline.append({
            "date": day,
            "sessions": sum(1 for s in sessions if s.get("status") == "done" and s.get("date") == day),
            "cards": sum(1 for c in cards if c.get("created") == day),
            "approved": sum(1 for c in cards if c.get("status") == "approved"
                            and (c.get("approved_on") or c.get("created")) == day)})
    return {
        "today": today(), "departing": len(leaving), "at_risk": sum(r["risk"] == "high" for r in rows),
        "coverage_avg": round(sum(1 for t in topics if t.get("covered")) / len(topics), 2) if topics else 0.0,
        "cards_total": len(cards), "cards_approved": sum(c.get("status") == "approved" for c in cards),
        "cards_pending": sum(c.get("status") == "pending" for c in cards),
        "gaps_open": sum(1 for q in STATE["questions"] if q.get("status") != "answered"),
        "sessions_done": sum(s.get("status") == "done" for s in sessions),
        "sessions_scheduled": sum(s.get("status") == "scheduled" for s in sessions),
        "minutes_recorded": sum(as_int(s.get("duration_min")) for s in sessions if s.get("status") == "done"),
        "value_protected_jod": sum(as_int(c.get("value_jod_year")) for c in cards if c.get("status") == "approved"),
        "value_at_risk_jod": sum(as_int(t.get("value_jod_year")) for t in topics if not t.get("covered")),
        "by_employee": rows,
        "by_dept": [{"dept": d["dept"], "departing": d["departing"], "risk": d["risk"],
                     "coverage": round(d["covered"] / d["total"], 2) if d["total"] else 0.0}
                    for d in by_dept.values()],
        "timeline": timeline,
        "next_session": next_session_of(sessions),
    }


# ================================================================ API: system & state
@app.get("/api/health")
def health():
    p = provider()
    model = ANTHROPIC_MODEL if p == "anthropic" else (LLM["openrouter_model"] or OPENROUTER_DEFAULT) if p else None
    return jsonify(ok=True, provider=p or "fallback", model=model)


@app.get("/api/state")
def api_state():
    audio = audio_files()
    with store() as st:
        return jsonify(
            today=today(), company=st["company"], people=[view_person(p) for p in st["people"]],
            topics=st["topics"], sessions=[view_session(s, audio) for s in st["sessions"]],
            cards=[view_card(c, audio) for c in st["cards"]], questions=st["questions"],
            roles=st["roles"], onboarding=st["onboarding"])


@app.get("/api/metrics")
def api_metrics():
    with store():
        return jsonify(compute_metrics())


@app.get("/api/people/<pid>")
def api_person(pid):
    audio = audio_files()
    with store() as st:
        p = must("people", pid, "هالشخص مش موجود")
        return jsonify(
            person=view_person(p),
            topics=[t for t in st["topics"] if t.get("employee_id") == pid],
            sessions=[view_session(s, audio) for s in st["sessions"] if s.get("employee_id") == pid],
            cards=[view_card(c, audio) for c in st["cards"] if c.get("employee_id") == pid],
            questions=[q for q in st["questions"] if pid in (q.get("employee_id"), q.get("asked_by"))],
            metrics=employee_row(p) if p.get("status") == "leaving" else None)


@app.post("/api/reset")
def api_reset():
    reseed()
    try:
        for name in os.listdir(AUDIO_DIR):
            os.remove(os.path.join(AUDIO_DIR, name))
    except OSError:
        pass
    return jsonify(ok=True)


# ================================================================ API: stateless (legacy live demo)
def stateless_ctx(d):
    with store():
        pc = person_ctx(str(d.get("employee_id") or "omar"))
    return (pc, *supplier_day(d, pc))


@app.post("/api/followup")
def api_followup():
    d = body()
    pc, supplier, day = stateless_ctx(d)
    index = max(0, as_int(d.get("index")))
    turns = [t for t in (d.get("turns") or []) if isinstance(t, dict)][-12:]
    said = [str(t.get("text", "")) for t in turns if t.get("role") != "rawi"]
    q, source = next_question(pc, supplier, day, turns, said, index + 1)
    return jsonify(question=q, source=source)


@app.post("/api/extract")
def api_extract():
    d = body()
    pc, supplier, day = stateless_ctx(d)
    answers = []
    for a in d.get("answers") or []:
        if isinstance(a, dict) and clean(a.get("transcript"), 2000):
            idx = as_int(a.get("index"), None)
            if idx is not None:
                answers.append({"index": idx, "transcript": clean(a["transcript"], 2000)})
    if not answers:
        return jsonify(cards=[], source="empty")
    cards, source = extract_cards(pc, answers, supplier, day)
    return jsonify(cards=cards, source=source)


@app.post("/api/ask")
def api_ask():
    d = body()
    question = clean(d.get("question"), 500)
    stateless = isinstance(d.get("cards"), list)  # the caller passes its own cards (legacy live demo)
    emp = str(d.get("employee_id") or "").strip() or None
    pid = emp or "omar"
    audio = audio_files()
    with store() as st:
        if stateless:
            cards = [c for c in d["cards"] if isinstance(c, dict) and c.get("id") is not None][:40]
        else:
            cards = [c for c in st["cards"]
                     if c.get("status") == "approved" and (not emp or c.get("employee_id") == emp)]
        asker_id = d["asked_by"] if find("people", d.get("asked_by")) else default_asker(pid)
        asker_p = find("people", asker_id) or {}
        asker = f"{asker_p.get('name') or 'الموظف الجديد'} {'بتسأل' if is_female(asker_p) else 'بيسأل'}"
        about = f"شغل {(find('people', emp) or {}).get('name', 'الفريق')}" if emp else "شغل الشركة"
        company = st["company"].get("name") or "الشركة"
    if not question or not cards:
        result = {"unknown": True, "source": "empty"}
    else:
        result = answer_from_cards(question, cards, asker, about, company)
    if result.get("unknown") and d.get("log_gap") and question:
        with store(write=True):
            must("people", pid, "هالموظف مش موجود")
            result["question_id"] = add_question(pid, question, asker_id)["id"]
    elif result.get("card_id") and not stateless:
        with store():
            card = find("cards", result["card_id"])
            result["card"] = view_card(card, audio) if card else None
    return jsonify(result)


# ================================================================ API: audio
def audio_ext(mimetype, filename):
    ext = MIME_EXT.get((mimetype or "").lower())
    if ext:
        return ext
    ext = os.path.splitext(filename or "")[1].lower()
    return ext if ext in EXT_MIME else None


@app.post("/api/audio")
def api_audio():
    f = request.files.get("audio")
    if not f:
        raise ApiError("ما وصل ملف صوت (الحقل audio)")
    ext = audio_ext(f.mimetype, f.filename)
    if not ext:
        raise ApiError("نوع الملف مش مدعوم — بس webm أو mp4 أو ogg أو wav أو mp3", 415)
    data = f.read(MAX_AUDIO + 1)
    if not data:
        raise ApiError("ملف الصوت فاضي")
    if len(data) > MAX_AUDIO:
        raise ApiError("التسجيل أكبر من ١٠ ميغا", 413)
    audio_id = uuid.uuid4().hex[:12]
    os.makedirs(AUDIO_DIR, exist_ok=True)
    with open(os.path.join(AUDIO_DIR, audio_id + ext), "wb") as out:
        out.write(data)
    return jsonify(audio_id=audio_id, url=f"/media/{audio_id}"), 201


@app.get("/media/<audio_id>")
def media(audio_id):
    if not AUDIO_ID_RE.match(audio_id):
        raise ApiError("رقم التسجيل مش صحيح")
    path = audio_files().get(audio_id)
    if not path:
        raise ApiError("التسجيل مش موجود", 404)
    mimetype = EXT_MIME[os.path.splitext(path)[1].lower()]
    return send_file(path, mimetype=mimetype, conditional=True, max_age=0)


# ================================================================ API: sessions
def start_session(s):
    """Mark a session live (moving it to today) and add Rawi's opening turn if it has none."""
    if s["status"] != "live":
        s["status"] = "live"
        s["started_at"] = now_stamp()
        if s["date"] != today():
            s["date"], s["time"] = today(), datetime.now().strftime("%H:%M")
    if not s["turns"]:
        name = (find("people", s["employee_id"]) or {}).get("name", "")
        s["turns"].append({"role": "rawi", "text": OPENING.format(name=name)})


def move_question(q, s):
    """Attach a question to session s (detach it when s is None), keeping both sides in sync."""
    old = find("sessions", q.get("session_id"))
    if old and q["id"] in old["question_ids"]:
        old["question_ids"].remove(q["id"])
    q["session_id"] = s["id"] if s else None
    if s and q["id"] not in s["question_ids"]:
        s["question_ids"].append(q["id"])


def minutes_since(stamp):
    try:
        return max(1, round((datetime.now() - datetime.fromisoformat(stamp)).total_seconds() / 60))
    except (TypeError, ValueError):
        return 1


def live_session(sid):
    s = must("sessions", sid, "الجلسة مش موجودة")
    if s["status"] == "done":
        raise ApiError("هالجلسة خلصت", 409)
    return s


@app.post("/api/sessions")
def api_create_session():
    d = body()
    status = d.get("status") or "scheduled"
    if status not in ("scheduled", "live"):
        raise ApiError("حالة الجلسة لازم تكون scheduled أو live")
    day = valid_date(d["date"]) if d.get("date") else today()
    if not day:
        raise ApiError("التاريخ مش مضبوط (YYYY-MM-DD)")
    time = d.get("time") if TIME_RE.match(str(d.get("time") or "")) else (
        datetime.now().strftime("%H:%M") if status == "live" else "10:00")
    audio = audio_files()
    with store(write=True) as st:
        p = must("people", d.get("employee_id"), "لازم تختار موظف موجود")
        mine = [t for t in st["topics"] if t.get("employee_id") == p["id"]]
        if isinstance(d.get("topic_ids"), list):
            topic_ids = [t["id"] for t in mine if t["id"] in d["topic_ids"]]
        else:
            topic_ids = [t["id"] for t in mine if not t.get("covered")][:3]
        names = [t["name"] for t in mine if t["id"] in topic_ids]
        s = {"id": short_id(f"s-{p['id']}"), "employee_id": p["id"],
             "title": clean(d.get("title"), 120) or ("، ".join(names[:2]) or f"جلسة تسليم مع {p.get('name', '')}"),
             "date": day, "time": time, "status": "scheduled", "topic_ids": topic_ids, "question_ids": [],
             "supplier": clean(d.get("supplier"), 60) or None, "day": parse_day(d.get("day")),
             "duration_min": 0, "summary": "", "answers": [], "turns": [], "created": today()}
        st["sessions"].append(s)
        for qid in d.get("question_ids") if isinstance(d.get("question_ids"), list) else []:
            q = find("questions", qid)
            if q and q.get("employee_id") == p["id"] and q.get("status") != "answered":
                q["status"] = "scheduled"
                move_question(q, s)
        if status == "live":
            start_session(s)
        return jsonify(session_detail(s, audio)), 201


@app.get("/api/sessions/<sid>")
def api_session(sid):
    audio = audio_files()
    with store():
        return jsonify(session_detail(must("sessions", sid, "الجلسة مش موجودة"), audio))


@app.post("/api/sessions/<sid>/start")
def api_start(sid):
    audio = audio_files()
    with store(write=True):
        s = live_session(sid)
        start_session(s)
        return jsonify(session_detail(s, audio))


@app.post("/api/sessions/<sid>/answers")
def api_answer(sid):
    d = body()
    transcript = clean(d.get("transcript"), 4000)
    if not transcript:
        raise ApiError("الجواب فاضي")
    audio_id = str(d.get("audio_id") or "")
    audio = audio_files()
    with store(write=True):
        s = live_session(sid)
        start_session(s)
        last = next((t for t in reversed(s["turns"]) if t.get("role") == "rawi"), {})
        ans = {"index": len(s["answers"]), "question": clean(d.get("question"), 500) or last.get("text", ""),
               "transcript": transcript, "audio_id": audio_id if AUDIO_ID_RE.match(audio_id) else None,
               "at": now_stamp()}
        if last.get("question_id"):
            ans["question_id"] = last["question_id"]
        s["answers"].append(ans)
        s["turns"].append({"role": "employee", "text": transcript, "answer_index": ans["index"]})
        return jsonify(answer=dict(ans, audio_url=audio_url(ans["audio_id"], audio)), session=session_detail(s, audio))


@app.post("/api/sessions/<sid>/followup")
def api_session_followup(sid):
    d = body()
    with store():
        s = live_session(sid)
        waiting = [q for q in session_questions(s) if q.get("status") in ("open", "scheduled")
                   and q["id"] not in s.get("asked_question_ids", [])]
        if waiting:  # questions from the successor/manager come first
            q = waiting[0]
            asker = find("people", q.get("asked_by")) or {}
            text = f"{asker.get('name', 'الموظف الجديد')} {'سألت' if is_female(asker) else 'سأل'}: {q['text']}"
            s.setdefault("asked_question_ids", []).append(q["id"])
            s["turns"].append({"role": "rawi", "text": text, "question_id": q["id"]})
            save()
            return jsonify(question=text, source="question", question_id=q["id"])
        pc = person_ctx(s["employee_id"])
        supplier, day = supplier_day(d, pc, s)
        turns = copy.deepcopy(s["turns"])
        said = [a["transcript"] for a in s["answers"][-3:]]
        n = len(s["answers"])
        topics_left = [t["name"] for t in STATE["topics"]
                       if t.get("employee_id") == s["employee_id"] and not t.get("covered")][:4]
    question, source = next_question(pc, supplier, day, turns, said, n, topics_left)
    with store(write=True):
        s = find("sessions", sid)
        if s and s["status"] != "done":
            s["turns"].append({"role": "rawi", "text": question})
    return jsonify(question=question, source=source)


def finished(s, audio):
    cards = [view_card(c, audio) for c in STATE["cards"] if c.get("session_id") == s["id"]]
    return jsonify(cards=cards, session=session_detail(s, audio))


@app.post("/api/sessions/<sid>/finish")
def api_finish(sid):
    d = body()
    audio = audio_files()
    with store():
        s = must("sessions", sid, "الجلسة مش موجودة")
        if s["status"] == "done":
            return finished(s, audio)
        if not s["answers"]:
            raise ApiError("لسا ما في ولا جواب بهالجلسة")
        pc = person_ctx(s["employee_id"])
        supplier, day = supplier_day(d, pc, s)
        answers = [{"index": a["index"], "transcript": a["transcript"]} for a in s["answers"] if a.get("transcript")]
    extracted, source = extract_cards(pc, answers, supplier, day)
    with store(write=True) as st:
        s = must("sessions", sid, "الجلسة مش موجودة")
        if s["status"] == "done":  # finished by a parallel request meanwhile
            return finished(s, audio)
        topics = [t for t in st["topics"] if t.get("employee_id") == s["employee_id"]]
        by_index = {a["index"]: a for a in s["answers"]}
        created = []
        for c in extracted:
            ans = by_index.get(c["answer_index"], {})
            card = {"id": short_id(f"k-{s['employee_id']}"), "employee_id": s["employee_id"], "session_id": sid,
                    "answer_index": c["answer_index"], "topic_id": None, "title": c["title"], "fact": c["fact"],
                    "tags": c["tags"], "confidence": c["confidence"], "status": "pending", "critical": False,
                    "value_jod_year": 0, "missing_in_official": False, "created": today(),
                    "audio_id": ans.get("audio_id")}
            card["topic_id"] = assign_topic(card, topics, s["topic_ids"])
            created.append(card)
        st["cards"].extend(created)
        for t in topics:
            if any(c["topic_id"] == t["id"] for c in created):
                t["covered"] = True
        s.update(status="done", finished_at=now_stamp(), duration_min=minutes_since(s.get("started_at")),
                 summary=" · ".join(c["title"] for c in created[:3]), extract_source=source)
        asked = s.get("asked_question_ids", [])
        for q in session_questions(s):
            if q.get("status") == "scheduled" or (q.get("status") == "open" and q["id"] in asked):
                answer = next((a for a in s["answers"] if a.get("question_id") == q["id"]), None)
                card = next((c for c in created if answer and c["answer_index"] == answer["index"]), None)
                q.update(status="answered", answered_on=today(), card_id=card["id"] if card else None)
        return jsonify(cards=[view_card(c, audio) for c in created], session=session_detail(s, audio), source=source)


# ================================================================ API: cards & questions
CARD_STATUSES = ("approved", "pending", "rejected")
QUESTION_STATUSES = ("open", "scheduled", "answered")


@app.patch("/api/cards/<cid>")
def api_card(cid):
    d = body()
    changes = {}
    if "status" in d:
        if d["status"] not in CARD_STATUSES:
            raise ApiError("الحالة لازم تكون approved أو pending أو rejected")
        changes["status"] = d["status"]
    for key, limit in (("title", 120), ("fact", 2000)):
        if key in d:
            changes[key] = clean(d[key], limit)
            if not changes[key]:
                raise ApiError("العنوان والمعلومة ما بصير يكونوا فاضيين")
    if "tags" in d:
        if not isinstance(d["tags"], list):
            raise ApiError("الوسوم لازم تكون قائمة")
        changes["tags"] = [t for t in (clean(x, 40) for x in d["tags"]) if t][:5]
    if "critical" in d:
        changes["critical"] = bool(d["critical"])
    if not changes:
        raise ApiError("ما في إشي يتعدّل")
    audio = audio_files()
    with store(write=True):
        c = must("cards", cid, "البطاقة مش موجودة")
        if changes.get("status") == "approved" and c.get("status") != "approved":
            c["approved_on"] = today()
        c.update(changes)
        return jsonify(view_card(c, audio))


@app.post("/api/cards/approve_all")
def api_approve_all():
    d = body()
    with store(write=True) as st:
        n = 0
        for c in st["cards"]:
            matches = all(not d.get(k) or c.get(k) == d[k] for k in ("employee_id", "session_id"))
            if c.get("status") == "pending" and matches:
                c.update(status="approved", approved_on=today())
                n += 1
        return jsonify(approved=n)


@app.post("/api/questions")
def api_new_question():
    d = body()
    text = clean(d.get("text"), 500)
    if not text:
        raise ApiError("اكتب السؤال")
    with store(write=True):
        p = must("people", d.get("employee_id"), "لازم تختار موظف موجود")
        asked_by = d["asked_by"] if find("people", d.get("asked_by")) else default_asker(p["id"])
        return jsonify(add_question(p["id"], text, asked_by)), 201


@app.patch("/api/questions/<qid>")
def api_question(qid):
    d = body()
    if "status" in d and d["status"] not in QUESTION_STATUSES:
        raise ApiError("الحالة لازم تكون open أو scheduled أو answered")
    with store(write=True):
        q = must("questions", qid, "السؤال مش موجود")
        if "session_id" in d:
            move_question(q, live_session(d["session_id"]) if d["session_id"] else None)
            if q["session_id"]:
                q["status"] = "scheduled"
            elif q.get("status") == "scheduled":
                q["status"] = "open"
        if "status" in d:
            q["status"] = d["status"]
            if d["status"] == "answered":
                q.setdefault("answered_on", today())
        return jsonify(q)


# ================================================================ pages
PAGES = {  # page key (= template name) → Arabic title
    "home": "الرئيسية", "live": "العرض الحي", "meetings": "الجلسات", "room": "غرفة الجلسة",
    "knowledge": "قاعدة المعرفة", "ceo": "المدير التنفيذي", "manager": "المدير المباشر",
    "employee": "الموظف المغادر", "onboarding": "الموظف الجديد", "hr": "الموارد البشرية", "styleguide": "دليل التصميم",
}
SHELL = ('{% extends "base.html" %}{% block content %}<section class="panel" style="margin:48px auto;'
         'max-width:640px;padding:32px;text-align:center"><h1>{{ heading }}</h1><p>{{ message }}</p>'
         '<p><a class="btn btn-primary" href="/">ارجع للرئيسية</a></p></section>{% endblock %}')
STANDALONE = ('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
              '<meta name="viewport" content="width=device-width,initial-scale=1"><title>{{ heading }} · راوي</title>'
              '<style>body{font-family:system-ui,sans-serif;background:Canvas;color:CanvasText;margin:0;padding:64px 16px;'
              'text-align:center;line-height:1.8}main{max-width:560px;margin:auto}</style></head><body><main>'
              '<h1>{{ heading }}</h1><p>{{ message }}</p><p><a href="/">ارجع للرئيسية</a></p></main></body></html>')


def template_exists(name):
    return os.path.isfile(os.path.join(TEMPLATES, name))


def render_shell(heading, message, status=200, **ctx):
    """Friendly Arabic page inside base.html when it renders, else a standalone RTL page."""
    ctx.setdefault("title", heading)
    if template_exists("base.html"):
        try:
            return render_template_string(SHELL, heading=heading, message=message, **ctx), status
        except Exception as e:  # noqa: BLE001 — base.html is still being built; never show a blank page
            log.warning("base.html failed to render (%s); using the standalone shell", type(e).__name__)
    return render_template_string(STANDALONE, heading=heading, message=message), status


def render_page(key, active=None, **extra):
    ctx = {"active": active or key, "title": PAGES[key], "page": key, **extra}
    if template_exists(f"{key}.html"):
        return render_template(f"{key}.html", **ctx)
    if key == "live" and template_exists("index.html"):
        return send_from_directory(TEMPLATES, "index.html")  # the original single-page demo
    return render_shell(PAGES[key], "هالصفحة عم تنبنى هلق — ارجع كمان شوي.", 200, **ctx)


def person_page(key, pid, status, preferred):
    with store() as st:
        ids = [p["id"] for p in st["people"] if p.get("status") == status]
    if pid in ids:
        return render_page(key, pid=pid)
    default = preferred if preferred in ids else (ids[0] if ids else None)
    if default:
        return redirect(f"/{key}/{default}")
    return render_page(key, pid=pid)


@app.get("/")
def home():
    if request.args.get("mode") == "fallback":
        return redirect("/live?mode=fallback")
    return render_page("home")


for _key in ("live", "meetings", "knowledge", "ceo", "manager", "hr", "styleguide"):  # pages with no parameters
    app.add_url_rule(f"/{_key}", _key, partial(render_page, _key))


@app.get("/meetings/<sid>")
def room(sid):
    with store():
        known = find("sessions", sid) is not None
    return render_page("room", active="meetings", sid=sid) if known else redirect("/meetings")


@app.get("/employee")
@app.get("/employee/<pid>")
def employee(pid=None):
    return person_page("employee", pid, "leaving", "omar")


@app.get("/onboarding")
@app.get("/onboarding/<pid>")
def onboarding(pid=None):
    return person_page("onboarding", pid, "incoming", "rana")


# ================================================================ errors (API → JSON, pages → Arabic HTML)
API_ERRORS = {400: "الطلب مش مفهوم", 404: "مش موجود", 405: "هالطريقة مش مسموحة هون",
              413: "الملف كبير كتير — الحد ١٠ ميغا", 415: "نوع الملف مش مدعوم", 500: "صار خلل عندنا، جرّب كمان مرة"}
PAGE_ERRORS = {404: ("الصفحة مش موجودة", "يمكن الرابط قديم أو فيه غلطة. اختار من القائمة أو ارجع للرئيسية."),
               500: ("صار خلل عندنا", "جرّب تحدّث الصفحة بعد شوي. إذا ضلّ الخلل، ارجع للرئيسية.")}


def is_api():
    return request.path.startswith(("/api/", "/media/"))


def error_response(code):
    if is_api():
        return jsonify(error=API_ERRORS.get(code, "صار خلل بالطلب")), code
    heading, message = PAGE_ERRORS.get(code, ("ما زبط الطلب", "ارجع للرئيسية وجرّب كمان مرة."))
    return render_shell(heading, message, code, active=None, page="error")


@app.errorhandler(ApiError)
def handle_api_error(e):
    return jsonify(error=e.msg), e.code


@app.errorhandler(HTTPException)
def handle_http_error(e):
    return error_response(e.code or 500)


@app.errorhandler(Exception)
def handle_crash(e):
    log.exception("unhandled %s on %s %s", type(e).__name__, request.method, request.path)
    return error_response(500)


# ================================================================ startup
boot()
threading.Thread(target=discover_openrouter_model, daemon=True).start()

if __name__ == "__main__":
    log.info("Rawi starting — provider: %s", provider() or "fallback (no key)")
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
