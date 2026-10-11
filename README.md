# راوي — Rawi

**ذاكرة الشركة بصوت أصحابها.** When someone leaves, Rawi interviews them out loud in Jordanian Arabic. It asks journalist-style follow-ups that surface what isn't written down: exceptions, backups, permissions, and what breaks if someone does it "by the book". It masks passwords before anything leaves the browser and turns the answers into knowledge cards linked to the person's recorded voice. The manager approves the cards, and the replacement asks questions and hears the answer in the original person's voice. Every role in the fictional شركة النخيل للمقاولات gets its own page.

## Pages

| Route | For | What it is |
|---|---|---|
| `/` | everyone | Pitch and role chooser |
| `/live` (`?mode=fallback`) | judges | The full 5-panel live demo: interview with عمر, cards with voice, رنا asks, closing the loop |
| `/meetings`, `/meetings/<id>` | managers / HR | Handover sessions agenda; schedule a session |
| `/knowledge` | everyone | Company memory: search, ask Rawi, voice, gaps |
| `/ceo` | م. نادر | Knowledge-at-risk cockpit: coverage, JOD value, risk matrix, decisions |
| `/manager` | م. سامر | Review and approve cards; route the new hire's questions to the next session |
| `/employee/<id>` | the person leaving | Countdown, coverage, next session, their cards |
| `/onboarding/<id>` | the new hire | Ask Rawi, learning path in the predecessor's voice, 30-day checklist |
| `/hr` | سلمى | Departures pipeline, official vs real job descriptions, exit reports |
| `/styleguide` | builders | Design system |

The architecture, data model and API are in [`docs/SPEC.md`](docs/SPEC.md).

## Run

```bash
pip install -r requirements.txt
python main.py            # http://localhost:5000
```

Demo data comes from `data/seed.json` and is shifted so that "9 days left" is always true. Runtime state and voice recordings live in `data/runtime/` (gitignored). `POST /api/reset` restores the demo.

## Environment variables (`.env` or host secrets — never commit them)

| Var | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Preferred provider (Anthropic Messages API) |
| `ANTHROPIC_MODEL` | Optional, default `claude-sonnet-5-5` |
| `OPENROUTER_API_KEY` | Used if no Anthropic key |
| `OPENROUTER_MODEL` | Optional. If unset, the newest `anthropic/claude-sonnet*` slug is picked at startup |
| `PORT` | Optional, default `5000` |
| `RAWI_DATA_DIR` | Optional, default `data/runtime` |

With no key, or if any model call fails or times out (8s), every endpoint falls back to built-in behaviour. The UI never shows an error. `GET /api/health` reports the active provider.

## Demo tips

- `/live` is the live demo. Hold the button (or the Space key) and speak, using Chrome for speech-to-text. You can always type instead.
- `/live?mode=fallback` swaps the mic for 4 pre-written answers from عمر: an unwritten 3% cash discount, a portal password (to show masking), who covers payments, and what breaks "by the book". To attach real audio, drop `static/audio/omar-1.webm` … `omar-4.webm` in place.

## Deploy on Replit

Import from GitHub on Replit, add the key in Replit Secrets, Run, then Deploy.
