# Rawi (راوي) — product & architecture spec

> «ذاكرة الشركة بصوت أصحابها». When someone leaves, Rawi interviews them out loud in Jordanian Arabic and turns what they say into knowledge cards linked to their recorded voice. Their manager approves the cards, and the replacement asks questions and hears the answer in the original person's voice. Every role in the company gets its own page.

This file is the **single source of truth** for everyone building Rawi. If code and spec disagree, the spec wins unless the spec is clearly wrong. Then fix the code and note the deviation in your report.

---

## 1. Personas (fictional company: شركة النخيل للمقاولات، عمّان)

| id | name | role | status |
|---|---|---|---|
| `omar` | عمر | مسؤول مشتريات أول — المشتريات | **leaving**, 9 days left, successor `rana`, manager `samer` |
| `rana` | رنا | مسؤولة مشتريات — المشتريات | **incoming**, started 3 days ago |
| `samer` | م. سامر | مدير المشتريات | active (approves Omar's cards) |
| `nader` | م. نادر | المدير التنفيذي (CEO) | active |
| `salma` | سلمى | مديرة الموارد البشرية | active |
| `huda` | هدى | محاسبة رئيسية — المالية | **leaving** (retirement), 21 days left, successor `dana` |
| `dana` | دانة | محاسبة — المالية | **incoming** |
| `yazan` | يزن | مهندس موقع — المشاريع | **leaving**, 34 days left, successor `tareq` |
| `tareq` | طارق | مهندس موقع — المشاريع | **incoming** |
| `majed` | ماجد | أمين مستودع — اللوجستيات | **leaving**, 5 days left, **no successor** (the red flag on the CEO page) |

Copy rules: all UI copy is **Jordanian Arabic** (شو، هلق، بدّك، لسا، منيح…). The words "AI interviewer", "chatbot", «روبوت محادثة» and «مُحاوِر ذكاء اصطناعي» never appear as a title or heading. Rawi is «راوي»: it interviews, documents and answers.

## 2. Stack & files

Flask + Jinja templates + vanilla JS/CSS (no build step, no npm deps at runtime). Python deps: `flask`, `requests`, `python-dotenv` only. One process; state in memory, persisted as JSON.

```
main.py                     Flask app: pages, JSON API, LLM calls + fallbacks, store
data/seed.json              Demo content (committed). Relative day offsets → real dates at load.
data/runtime/               (gitignored) state.json + audio/ ; overridable with env RAWI_DATA_DIR
templates/base.html         App shell (sidebar nav, theme, toast, mini-player); every page extends it
templates/<page>.html       One template per page (see §4)
static/css/rawi.css         Design system (tokens, light+dark, components)
static/js/rawi.js           window.Rawi: helpers, api, formatting, ui components, audio, theme
static/js/voice.js          window.Rawi.Voice: push-to-talk, recording, upload, dictation
static/js/pages/<page>.js   Page logic (one file per page)
static/css/pages/<page>.css Page-only styles (optional)
static/audio/omar-1..4.webm Optional demo audio for /live?mode=fallback
```

Templates: page JS lives in `static/js/pages/<page>.js`, never inline, so Jinja never parses JS. Never write `{{`, `{%` or `{#` in templates except for real Jinja. Data reaches pages through the JSON API, not through Jinja.

## 3. Env vars

`ANTHROPIC_API_KEY` (preferred, model `ANTHROPIC_MODEL` default `claude-sonnet-5-5`), `OPENROUTER_API_KEY` (model `OPENROUTER_MODEL`, else newest `anthropic/claude-sonnet*` discovered at startup), `PORT` (5000), `RAWI_DATA_DIR` (default `data/runtime`). Secrets come from `.env` / host secrets only and are never logged. LLM timeout is 8s. **Every model call has a deterministic fallback**, and the UI never shows a raw error or a blank area.

## 4. Pages, routes, nav

| key (`active`) | route | template | nav label | audience |
|---|---|---|---|---|
| `home` | `/` | home.html | الرئيسية | everyone; pitch + role chooser |
| `live` | `/live` (`?mode=fallback`) | live.html | العرض الحي | hackathon judges |
| `meetings` | `/meetings` | meetings.html | الجلسات | managers / HR |
| `meetings` | `/meetings/<sid>` | room.html | — | interview room for one session |
| `knowledge` | `/knowledge` | knowledge.html | قاعدة المعرفة | everyone |
| `ceo` | `/ceo` | ceo.html | المدير التنفيذي | م. نادر |
| `manager` | `/manager` | manager.html | المدير المباشر | م. سامر |
| `employee` | `/employee/<pid>` (`/employee` → `/employee/omar`) | employee.html | الموظف المغادر | عمر / هدى / يزن / ماجد |
| `onboarding` | `/onboarding/<pid>` (`/onboarding` → `/onboarding/rana`) | onboarding.html | الموظف الجديد | رنا / دانة / طارق |
| `hr` | `/hr` | hr.html | الموارد البشرية | سلمى |
| `styleguide` | `/styleguide` | styleguide.html | (not in main nav; link in sidebar footer) | builders |

Legacy: `/?mode=fallback` → redirect to `/live?mode=fallback`.

Each page route renders `render_template("<page>.html", active=<key>, title=<arabic title>, page=<key>, **extra)`, where `extra` holds `sid` and `pid` for room, employee and onboarding pages. If a template file is missing, the route returns a minimal placeholder that extends base.html. Pages are **never** blank.

Nav groups in the sidebar:
- **المنتج**: الرئيسية · العرض الحي · الجلسات · قاعدة المعرفة
- **لكل واحد**: المدير التنفيذي · المدير المباشر · الموظف المغادر · الموظف الجديد · الموارد البشرية

## 5. Data model (`data/seed.json`) and materialization

Seed uses **relative day offsets** from today. The store turns them into ISO dates on load and reset, so "9 days left" stays true whatever day the demo runs.

```jsonc
{
  "company": {"name": "شركة النخيل للمقاولات", "short": "النخيل", "city": "عمّان", "employees": 340,
              "suppliers": ["سما للاتصالات", "الرواد للمواد الكهربائية", "مؤسسة الحديد الأردنية"]},
  "people": [
    {"id": "omar", "name": "عمر", "full_name": "عمر الحدّاد", "initials": "ع", "role": "مسؤول مشتريات أول",
     "dept": "المشتريات", "status": "leaving", "last_day_offset": 9, "years": 7,
     "successor": "rana", "manager": "samer", "reason": "انتقال لشركة ثانية"},
    {"id": "rana", "name": "رنا", "full_name": "رنا العمري", "initials": "ر", "role": "مسؤولة مشتريات",
     "dept": "المشتريات", "status": "incoming", "start_offset": -3, "predecessor": "omar", "manager": "samer"},
    {"id": "samer", "name": "م. سامر", "full_name": "م. سامر القسوس", "initials": "س", "role": "مدير المشتريات",
     "dept": "المشتريات", "status": "active"}
    // … nader, salma, huda, dana, yazan, tareq, majed (see §1)
  ],
  "topics": [   // knowledge areas per leaving employee — drives coverage %
    {"id": "omar-suppliers", "employee_id": "omar", "name": "الموردين الرئيسيين", "covered": true,
     "critical": true, "value_jod_year": 18000}
  ],
  "sessions": [
    {"id": "s-omar-1", "employee_id": "omar", "title": "الموردين والدفعات", "date_offset": -6, "time": "10:00",
     "duration_min": 34, "status": "done",            // done | live | scheduled
     "topic_ids": ["omar-suppliers"], "summary": "…",
     "answers": [{"index": 0, "question": "…", "transcript": "…", "audio_id": null}]}
  ],
  "cards": [
    {"id": "k-omar-1", "employee_id": "omar", "session_id": "s-omar-1", "answer_index": 0,
     "topic_id": "omar-suppliers", "title": "…", "fact": "…", "tags": ["…"], "confidence": 3,
     "status": "approved",                              // approved | pending | rejected
     "critical": true, "value_jod_year": 14400, "missing_in_official": true,
     "created_offset": -6, "audio_id": null}
  ],
  "questions": [  // gaps: asked but not answered yet → Rawi asks them in the next session
    {"id": "q-1", "employee_id": "omar", "text": "…", "asked_by": "rana", "status": "open", "created_offset": -1}
  ],                                                   // open | scheduled | answered
  "roles": [      // HR: official vs real job description
    {"id": "procurement-officer", "title": "مسؤول مشتريات", "dept": "المشتريات", "holder": "omar",
     "official": ["…5 bullets"], "kpis": ["…"], "interview_questions": ["…"]}
  ],
  "onboarding": [ // per incoming person: first-30-days checklist
    {"person_id": "rana", "checklist": [{"id": "c-1", "text": "…", "done": true, "card_id": "k-omar-1"}]}
  ]
}
```

Materialized fields the API adds: people get `last_day`/`start_date` (ISO) and `days_left` (int, leaving only). Sessions get `date` (ISO `YYYY-MM-DD`) and `starts_at` (`YYYY-MM-DDTHH:MM`). Cards get `created`, questions get `created`, and cards get `audio_url` (`/media/<audio_id>` or null). Offset keys may remain.

## 6. JSON API (all responses JSON; errors → `{"error": "<arabic message>"}` with 4xx, never HTML)

| method & path | body | returns |
|---|---|---|
| GET `/api/health` | — | `{ok, provider: "anthropic"\|"openrouter"\|"fallback", model}` |
| GET `/api/state` | — | `{today, company, people, topics, sessions, cards, questions, roles, onboarding}` (materialized) |
| GET `/api/metrics` | — | see §6.1 |
| GET `/api/people/<pid>` | — | `{person, topics, sessions, cards, questions, metrics}` for one person (`metrics` = that person's `by_employee` row, if leaving) |
| POST `/api/reset` | — | reseed from `data/seed.json`, delete runtime audio → `{ok: true}` |
| POST `/api/followup` | `{supplier, day, index, turns:[{role,text}], employee_id?}` | `{question, source}` stateless (used by legacy flows) |
| POST `/api/extract` | `{supplier, day, answers:[{index,transcript}], employee_id?}` | `{cards:[{answer_index,title,fact,tags,confidence}], source}` stateless |
| POST `/api/ask` | `{question, cards?:[{id,title,fact}], employee_id?, log_gap?, asked_by?}` | `{answer, card_id, source}` or `{unknown: true, question_id?}`. If `cards` is omitted it searches **approved** store cards (filtered by `employee_id` if given). If `log_gap` is set and the answer is unknown, it creates an open question for `employee_id` (default `omar`) |
| POST `/api/audio` | multipart field `audio` (≤10 MB; webm/mp4/ogg/wav) | `{audio_id, url: "/media/<audio_id>"}` |
| GET `/media/<audio_id>` | — | the audio file (id validated `^[a-z0-9-]{6,64}$`) |
| POST `/api/sessions` | `{employee_id, title?, date?, time?, topic_ids?, question_ids?, supplier?, day?, status?}` | the new session (`status` default `scheduled`; `date` default today). `question_ids` are set to `scheduled` and attached |
| GET `/api/sessions/<sid>` | — | session + `person` + its `topics`, `questions`, `cards` |
| POST `/api/sessions/<sid>/start` | — | sets `status: "live"`, `started_at`; if there are no turns, appends Rawi's opening turn; returns session |
| POST `/api/sessions/<sid>/answers` | `{transcript, audio_id?, question?}` | server re-masks secrets, appends answer + `employee` turn → `{answer, session}` |
| POST `/api/sessions/<sid>/followup` | `{supplier?, day?}` | next Rawi question from session turns (LLM or fallback), appended as a `rawi` turn → `{question, source}` |
| POST `/api/sessions/<sid>/finish` | `{supplier?, day?}` | extracts cards from that session's answers (LLM or fallback) → creates **pending** cards with the answer's `audio_id`, marks session `done` with `duration_min`, marks covered topics, marks its scheduled questions `answered` → `{cards, session}` |
| PATCH `/api/cards/<cid>` | any of `{status, title, fact, tags, critical}` | updated card |
| POST `/api/cards/approve_all` | `{employee_id?, session_id?}` | `{approved: n}` |
| POST `/api/questions` | `{employee_id, text, asked_by?}` | new open question |
| PATCH `/api/questions/<qid>` | `{status?, session_id?}` | updated question |

Session objects also carry `turns: [{role: "rawi"|"employee", text, answer_index?}]` and `answers: [{index, question, transcript, audio_id, audio_url}]`.

**Followup logic (room, live):** the opening turn is «أهلاً {name}. خلّينا نبلّش: شو الإشي اللي لو موظف جديد عمله حسب النظام بالزبط رح يخرب؟». Open or scheduled questions attached to the session come first, phrased as «{asker} سألت/سأل: …». After that, the LLM prompt follows the original rules, generalised to the person's name, role and dept. Those rules: one question, Jordanian, ≤25 words, journalist style, surface undocumented knowledge, read back numbers and names every 3rd answer, never ask for a password (ask where it is stored and who grants access). The fallback is a dept-aware question bank with the person's name and supplier/day filled in.

**Secret masking:** the client masks before sending (`Rawi.mask`) and the server masks again. Masking replaces the word after كلمة السر|كلمة سر|الباسورد|باسورد|password (optionally after هي|هو|:), and any Latin+digit token of 6 or more characters, with `[حُذفت]`.

### 6.1 `/api/metrics`
```jsonc
{
  "today": "2026-10-11",
  "departing": 4, "at_risk": 2, "coverage_avg": 0.52,          // 0..1 = covered topics / topics (leaving people)
  "cards_total": 24, "cards_approved": 15, "cards_pending": 9,
  "gaps_open": 7, "sessions_done": 7, "sessions_scheduled": 6, "minutes_recorded": 214,
  "value_protected_jod": 48600,   // Σ value_jod_year of approved cards
  "value_at_risk_jod": 61000,     // Σ value_jod_year of NOT covered topics
  "by_employee": [{"id","name","full_name","role","dept","days_left","last_day","successor","successor_name",
                   "coverage","topics_total","topics_covered","cards","approved","pending","gaps",
                   "sessions_done","sessions_total","next_session": {"id","date","time","title"} | null,
                   "risk": "high"|"medium"|"low", "risk_reason": "…arabic…"}],
  "by_dept": [{"dept","departing","coverage","risk"}],
  "timeline": [{"date","sessions","cards","approved"}]   // last 14 days, oldest first
}
```
Risk is **high** if `days_left ≤ 7` and coverage < 0.6, or if there is no successor and `days_left ≤ 14`. It is **medium** if coverage < 0.75 or `days_left ≤ 14`. Otherwise it is **low**. `risk_reason` is a short Arabic sentence.

## 7. Design system

**Feel:** a warm, editorial Arabic workplace tool. Paper, ink and one terracotta voice. Generous whitespace, a strong type hierarchy, restrained color. It should look like the best-designed internal tool you have seen, not a template.

- Font: **IBM Plex Sans Arabic** 400/500/600/700 (Google Fonts). Body 17px, line-height 1.8; prose max-width 64ch. Numbers use `font-variant-numeric: tabular-nums`, and display digits are Arabic-Indic via `Rawi.ar()`.
- Tokens (light): `--bg #F6F1E8`, `--surface #FFFDF9`, `--surface-2 #FBF8F2`, `--line #D9D0C2`, `--ink #1B1A17`, `--ink-2 #5B564D`, `--accent #B5452F` (**only for voice/recording and primary CTAs**), `--ok #5F7F5A` (approved), plus warn/risk/info tokens chosen for AA contrast. A full dark theme maps the same tokens: `prefers-color-scheme` plus a manual toggle stored in `localStorage['rawi-theme']` (`light|dark|auto`) and set as `<html data-theme>`. Pages use tokens only, never raw hex.
- Shape: radius 14px for panels, 10px for controls, 999px for chips. Panels have a 1px `--line` border and a soft shadow. Hit targets are at least 44px. Focus rings are visible.
- Brand mark: three rounded vertical bars of heights 10/18/26 in `--accent`. While recording, the push-to-talk button shows two expanding rings and five bouncing bars.
- Rawi speech bubbles: a 3px `--accent` border on the inline-start side (right in RTL) plus a small «راوي» label. Person bubbles are plain.
- Motion: 150–250ms ease-out, with meaning only. Everything respects `prefers-reduced-motion`.
- RTL: `<html lang="ar" dir="rtl">`, logical properties (`margin-inline-start`, `inset-inline-end`…), and no horizontal scroll at 360px.
- Layout: a sidebar on the inline-start side (the right) at ≥1024px. Below that, a top bar with a drawer. Content max-width is about 1200px with a 16px phone gutter.

### 7.1 `templates/base.html` contract
Blocks: `head` (extra `<link>`), `content`, `scripts` (extra `<script src>`). Context vars: `active`, `title`, `page`, optional `sid`, `pid`. The body has `data-page="{{ page }}"` and, when present, `data-sid`/`data-pid` so page JS reads them from `document.body.dataset`. Load order is `rawi.css`, then the page CSS from the `head` block, then `rawi.js`, `voice.js` and the page JS from the `scripts` block.

### 7.2 `window.Rawi` (static/js/rawi.js) contract
```
Rawi.$(sel, root?) / Rawi.$$(sel, root?)            query helpers ($$ returns Array)
Rawi.esc(s)  Rawi.rich(s)                             escape; rich = escape + lock chip for [حُذفت] + line breaks
Rawi.ar(n)   Rawi.num(n)                               Arabic-Indic digits; grouped number (e.g. ٤٨٬٦٠٠)
Rawi.jod(n)                                            "٤٨٬٦٠٠ د.أ"
Rawi.pct(x)                                            0.52 → "٥٢٪"
Rawi.date(iso, {weekday?})  Rawi.relDay(iso)          "الثلاثاء ١٤ تشرين الأول" ; "اليوم" / "بكرا" / "مبارح" / "بعد ٣ أيام" / "قبل ٦ أيام"
Rawi.duration(sec)                                     "٣:٠٥"
Rawi.mask(text) → {text, found}
Rawi.reduceMotion (bool)
Rawi.api.get(path) / .post(path, body) / .patch(path, body) / .upload(path, formData)
      → Promise<json|null>   never throws; 20s timeout; null on failure
Rawi.store.load(force?) → Promise<state>   cached GET /api/state; Rawi.store.person(id); .card(id); .session(id)
Rawi.toast(msg, {kind?: 'ok'|'lock'|'info'})
Rawi.audio.play(url, {label?})  Rawi.audio.stop()      single shared player + floating "عم تسمع {label}…" mini bar
Rawi.speak(text)                                        Arabic speechSynthesis if an Arabic voice exists; else no-op
Rawi.typeInto(el, text, {scroller?}) → Promise          typewriter (instant when reduced motion)
Rawi.icons.{mic, play, pause, stop, lock, check, x, search, plus, arrow, calendar, clock, users, user, book, chart, shield, spark, alert, edit, send, home, live, sun, moon, menu, chevron, download, filter}
Rawi.ui.avatar(person, size?)                  Rawi.ui.chip(text, kind?)        kinds: ok|warn|risk|info|muted|accent
Rawi.ui.statusChip(status)                     approved→معتمدة pending→بانتظار المراجعة rejected→مرفوضة
                                               scheduled→مجدولة live→جارية هلق done→خلصت open→مفتوح answered→انجاوب
Rawi.ui.riskChip(risk)                         high→خطر عالي medium→انتبه low→تمام
Rawi.ui.conf(n)                                3-dot confidence
Rawi.ui.kcard(card, {people?, actions?: ['listen','approve','reject','edit','open'], compact?, highlight?})
      → HTML string; root has data-card-id; buttons have data-action
Rawi.ui.onCardAction(root, (action, cardId, event) => …)   delegated handler
Rawi.ui.ring(value01, {size?, label?})   Rawi.ui.meter(value01, {kind?})   Rawi.ui.sparkline(values, {w?, h?})
Rawi.ui.empty(title, body?, actionHTML?)  Rawi.ui.skeleton(n?, {lines?})
Rawi.theme.get() / .set('light'|'dark'|'auto')
```

### 7.3 `window.Rawi.Voice` (static/js/voice.js) contract
```
Rawi.Voice.supported → {recognition, recorder, synthesis}
Rawi.Voice.createPTT({button, enabled?: () => bool, keyboard?: true, lang?: 'ar-JO',
                      onStart?(), onLive?(text), onStop?(), onResult({text, blob, url, durationMs})})
      → {start(), stop(), destroy(), isRecording()}
   pointerdown starts and pointerup/cancel/lostcapture stops (with a guard against double stop).
   Space holds when focus is not in input/textarea/select/contenteditable. Recognition is continuous with
   interim results; MediaRecorder uses audio/webm (audio/mp4 on Safari). On release it waits 600ms for
   final results. It cancels speechSynthesis and Rawi.audio on start. It never throws. Toggles
   `is-recording` on `button.closest('.ptt-wrap') || button`.
Rawi.Voice.uploadAudio(blob) → Promise<{audio_id, url} | null>      POST /api/audio
Rawi.Voice.dictate({button, input, lang?, onFinal?(text)}) → controller   single-utterance mic for search/ask boxes; hides the button if unsupported
```
Masking is the caller's job (`Rawi.mask`) before anything is shown or sent.

## 8. Page briefs (what makes each page excellent)

- **home**: a hero with the brand mark, «راوي» and the tagline, a one-line promise, and the primary CTA «شوف العرض الحي». A secondary CTA reads «ادخل كمدير تنفيذي». It has a live proof strip from `/api/metrics` (departing, coverage, value protected), a three-step "كيف بيشتغل" (جلسة بصوت → بطاقات معرفة مربوطة بالصوت → الجديد بيسأل وبيسمع), and «لكل واحد بالشركة صفحته»: five role cards, each with the person's avatar and what that page gives them. Footer: «توظيف · مهام · تسليم» and «مقابِل عربي واحد بيحفظ خبرة شركتك بكلام أصحابها».
- **live**: the original 5-panel hackathon demo, kept feature-complete. Panels: ٠ judge input, ١ session with عمر (PTT, typed answers, masking, followups), ٢ cards with voice, ٣ رنا تسأل, ٤ إغلاق الدورة; plus `?mode=fallback`. It is now backed by the store (creates a live session for `omar`, uploads audio, finishes into real pending cards, approves via the API). Its knowledge then shows up on every other page. It degrades to the old client-only behaviour if the API is unreachable.
- **meetings**: an agenda. «اليوم» (live and today), «الجاي» (scheduled, grouped by day), and «اللي خلص» (done, with summary, answers, cards and minutes). There is a per-departing-person progress strip, a «جدولة جلسة» dialog (person, date, time, topics, attach open questions), and «ابدأ» links to the room.
- **room** (`/meetings/<sid>`): a focused interview room. The conversation sits in the main column with the big PTT, typed-answer fallback and a counter. The side column has the person card (days left), a topics checklist that ticks live, the «أسئلة بانتظار جواب» queue Rawi will ask first, and a live preview of answers. «إنهاء الجلسة» finishes into cards, shows them for quick review and links to the manager page.
- **knowledge**: the company memory. Search runs instantly client-side and also offers «اسأل راوي», which answers with source and voice. Filters cover dept, person, topic/tag, status and critical. Cards show in a grid, and a detail drawer shows the source session, original transcript, voice, the person and related gaps. It also has «الفجوات» (open questions) and print-friendly CSS.
- **ceo**: an executive cockpit. One headline sentence first (e.g. «٤ موظفين بيطلعوا خلال ٣٤ يوم — ٥٢٪ من معرفتهم موثّقة»). Then KPI tiles and a risk matrix (days left × coverage, one bubble per person, sized by value at risk). Coverage by person and dept, a 14-day activity trend, the value protected vs at risk in JOD, and «قرارات بتستناك» (e.g. ماجد has no successor; schedule sessions). Charts are inline SVG, accessible, theme-aware and print-friendly.
- **manager** (م. سامر): a review queue of pending cards with approve, reject and inline edit, critical first, plus bulk approve. It shows handover pairs (عمر → رنا) with progress, the new hire's open questions with «حطّها بالجلسة الجاية» (attach to the next session or schedule one), and the upcoming sessions.
- **employee** (`/employee/<pid>`): the departing person's own hub. A countdown, a coverage ring and a respectful legacy framing («خبرة ٧ سنين ما رح تضيع»). It lists topics covered and remaining, «جلستك الجاية» with a start button to the room, their cards and approval status, and questions from the successor waiting for them. A person switcher covers the leaving people.
- **onboarding** (`/onboarding/<pid>`): the new hire's hub. A welcome from their predecessor, a big «اسأل راوي» box (answers with voice and source; unknowns become gaps with `log_gap`), and a learning path of approved cards grouped by topic with voice. It has a first-30-days checklist, «أسئلتك» (answered and waiting), and «ناس لازم تعرفهم», people mentioned in cards. A person switcher covers the incoming people.
- **hr** (سلمى): the departures pipeline. Stages are أُعلن → جلسات → مراجعة → تسليم, with a card per leaving person. For each role it shows the official job description against the real one: the real one adds approved cards marked `missing_in_official`, highlighted as «ناقص بالرسمي». It also proposes KPIs and interview questions built from real knowledge, and links to each person's exit knowledge report.
- **styleguide**: a living showcase of tokens, type, buttons, chips, inputs, cards, kcard, bubbles, PTT states, ring/meter/sparkline, empty/skeleton, toast and the theme toggle.

## 9. Quality bar
- No console errors; no horizontal scroll at 360px; works at 1440, 1024, 768, 390 and 360 widths, in light and dark.
- Never blank: skeletons while loading, an empty state for no data, and a fallback for any failed call.
- Keyboard reachable, visible focus, `aria-live` for streaming text, alt or aria-label on icon buttons, contrast AA.
- Content feels real: specific names, numbers, suppliers, amounts in JOD and Jordanian phrasing, never lorem ipsum.
