# راوي — Rawi

**ذاكرة الشركة بصوت أصحابها.** Rawi runs a spoken handover interview in Jordanian Arabic with an employee who is leaving. In the demo that is عمر from procurement at the fictional شركة النخيل للمقاولات, with 9 days left. Rawi asks journalist-style follow-ups that surface what isn't written down: exceptions, backups, permissions, and what breaks if someone does it "by the book". It masks passwords before anything leaves the browser and turns his answers into knowledge cards, each linked to his recorded voice. Once م. سامر approves the cards, عمر's replacement رنا can ask questions and hear the answer in his own voice. Questions nobody has answered yet go into the next session's list. A final panel turns all of this into a truer job description, a KPI and an interview question.

## Run

```bash
pip install -r requirements.txt
python main.py            # http://localhost:5000  (PORT env var overrides)
```

## Environment variables (`.env` or host secrets — never commit them)

| Var | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Preferred provider (Anthropic Messages API) |
| `ANTHROPIC_MODEL` | Optional, default `claude-sonnet-5-5` |
| `OPENROUTER_API_KEY` | Used if no Anthropic key |
| `OPENROUTER_MODEL` | Optional. If unset, the newest `anthropic/claude-sonnet*` slug is picked at startup |
| `PORT` | Optional, default `5000` |

With no key, or if any model call fails or times out (8s), every endpoint returns a built-in fallback. The UI never shows an error. `GET /api/health` reports the active provider.

## Demo modes

- `/` is the live demo. Hold the button (or the Space key) and speak. It uses Web Speech `ar-JO` and MediaRecorder, so use Chrome for speech-to-text. You can always type instead.
- `/?mode=fallback` swaps the mic for 4 pre-written answers from عمر: an unwritten 3% cash discount, a portal password (to show masking), who covers payments when the responsible person is absent, and what breaks "by the book". To attach real audio, drop `static/audio/omar-1.webm` … `omar-4.webm` in place.

## Deploy on Replit

Import from GitHub on Replit, add the key in Replit Secrets, Run, then Deploy.
