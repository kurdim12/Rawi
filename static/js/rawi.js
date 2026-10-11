/* ==========================================================================
   راوي · window.Rawi — helpers, api, store, formatting, ui, audio, theme
   Contract: docs/SPEC.md §7.2. Merge-safe (voice.js attaches Rawi.Voice).
   No globals other than window.Rawi.
   ========================================================================== */
(function () {
  'use strict';

  const R = window.Rawi = Object.assign(window.Rawi || {}, {});

  /* ------------------------------------------------------------------------
     Constants
     ------------------------------------------------------------------------ */
  const MASK = '[حُذفت]';
  const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
    'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
  const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const THEME_KEY = 'rawi-theme';
  const THEMES = ['light', 'dark', 'auto'];
  const TIMEOUT_MS = 20000;
  const DAY_MS = 86400000;

  /* ------------------------------------------------------------------------
     Icons — 24px grid, stroke = currentColor. `arrow` and `chevron` point
     "forward" (toward inline-end, i.e. left in RTL). Media icons don't mirror.
     ------------------------------------------------------------------------ */
  const svg = (body, filled) =>
    `<svg class="icon" viewBox="0 0 24 24" ${filled ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true" focusable="false">${body}</svg>`;

  const ICONS = {
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    play: svg('<path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.2-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6z"/>', true),
    pause: svg('<rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/>', true),
    stop: svg('<rect x="6" y="6" width="12" height="12" rx="2.5"/>', true),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    arrow: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M16 3v4M8 3v4M3 10h18"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>'),
    user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    book: svg('<path d="M12 7v14"/><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H9a3 3 0 0 1 3 3 3 3 0 0 1 3-3h4.5A1.5 1.5 0 0 1 21 5.5V17a1 1 0 0 1-1 1h-5a3 3 0 0 0-3 3 3 3 0 0 0-3-3H4a1 1 0 0 1-1-1z"/>'),
    chart: svg('<path d="M4 20h16"/><rect x="5" y="11" width="3" height="6" rx="1"/><rect x="10.5" y="5" width="3" height="12" rx="1"/><rect x="16" y="8" width="3" height="9" rx="1"/>'),
    shield: svg('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>'),
    spark: svg('<path d="M11 3.5 12.9 9l5.6 1.9-5.6 1.9L11 18.5l-1.9-5.7-5.6-1.9L9.1 9z"/><path d="M19 3v4M17 5h4"/>'),
    alert: svg('<path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
    edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    send: svg('<path d="m2.5 2.5 7 19 4-8.5 8.5-4z"/><path d="m2.5 2.5 11 10.5"/>'),
    home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M10 21v-6h4v6"/>'),
    live: svg('<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
    moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    chevron: svg('<path d="m15 6-6 6 6 6"/>'),
    download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
    filter: svg('<path d="M3 5h18l-7 8.5V20l-4-2v-4.5z"/>'),
    /* extras */
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    auto: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>'),
    building: svg('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    volume: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
    door: svg('<path d="M13 4H6a1 1 0 0 0-1 1v15h8"/><path d="M13 3.5 19 5v15l-6 1z"/><path d="M15.5 12.5v.01"/>'),
    refresh: svg('<path d="M20 11a8 8 0 0 0-14.6-4.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.6L20 16M20 20v-4h-4"/>'),
    external: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    bars: '<svg class="icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="3" y="19" width="6" height="10" rx="3" fill="currentColor"/><rect x="13" y="11" width="6" height="18" rx="3" fill="currentColor"/><rect x="23" y="3" width="6" height="26" rx="3" fill="currentColor"/></svg>',
  };

  /* ------------------------------------------------------------------------
     Small utils
     ------------------------------------------------------------------------ */
  const isNum = (n) => n !== null && n !== '' && n !== undefined && Number.isFinite(Number(n));
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const pad2 = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const emit = (name, detail) => {
    try { document.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) { /* old browsers */ }
  };
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener() {} });
  const reduceMQ = mq('(prefers-reduced-motion: reduce)');
  const darkMQ = mq('(prefers-color-scheme: dark)');

  /**
   * Query one element.
   * @param {string} sel CSS selector
   * @param {ParentNode} [root=document]
   * @returns {Element|null}
   */
  function $(sel, root) { return (root || document).querySelector(sel); }

  /**
   * Query all elements as a real Array.
   * @param {string} sel CSS selector
   * @param {ParentNode} [root=document]
   * @returns {Element[]}
   */
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  /**
   * Escape a value for safe HTML interpolation.
   * @param {*} s
   * @returns {string}
   */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /**
   * Escape + render the redaction marker «[حُذفت]» as a lock chip + keep line breaks.
   * @param {*} s
   * @returns {string} HTML
   */
  function rich(s) {
    const lock = `<span class="lock" title="حُذفت معلومة سرّية">${ICONS.lock}حُذفت</span>`;
    return esc(s).split(MASK).join(lock).replace(/\r?\n/g, '<br>');
  }

  /**
   * Convert Western digits in any value to Arabic-Indic digits.
   * @param {*} n
   * @returns {string} e.g. ar(2026) → "٢٠٢٦"
   */
  function ar(n) { return String(n ?? '').replace(/\d/g, (d) => AR_DIGITS[d]); }

  /**
   * Grouped number in Arabic-Indic digits with Arabic separators.
   * @param {number} n
   * @param {{digits?: number}} [opts] max fraction digits (default 0)
   * @returns {string} e.g. num(48600) → "٤٨٬٦٠٠"
   */
  function num(n, opts) {
    if (!isNum(n)) return '—';
    const digits = opts && Number.isFinite(opts.digits) ? opts.digits : 0;
    const v = Number(n);
    const s = Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
      .replace(/,/g, '٬').replace(/\./g, '٫');
    const out = ar(s);
    return v < 0 ? `⁦-${out}⁩` : out;
  }

  /**
   * Jordanian dinars.
   * @param {number} n
   * @returns {string} e.g. jod(48600) → "٤٨٬٦٠٠ د.أ"
   */
  function jod(n) { return isNum(n) ? `${num(Math.round(Number(n)))} د.أ` : '—'; }

  /**
   * Percentage from a 0..1 ratio.
   * @param {number} x
   * @param {{digits?: number}} [opts]
   * @returns {string} e.g. pct(0.52) → "٥٢٪"
   */
  function pct(x, opts) {
    if (!isNum(x)) return '—';
    const digits = opts && Number.isFinite(opts.digits) ? opts.digits : 0;
    const f = Math.pow(10, digits);
    return `${num(Math.round(Number(x) * 100 * f) / f, { digits })}٪`;
  }

  /** Parse 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:MM' as a LOCAL date (no UTC shift). */
  function parseDate(iso) {
    if (iso instanceof Date) return isNaN(iso) ? null : iso;
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(iso));
    if (!m) { const d = new Date(iso); return isNaN(d) ? null : d; }
    return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }

  /**
   * "Today" as ISO — the server's materialized `today` when the store is loaded, else local.
   * @returns {string} 'YYYY-MM-DD'
   */
  function today() {
    const t = storeCache && storeCache.today;
    return (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t)) ? t.slice(0, 10) : isoOf(new Date());
  }

  /**
   * Arabic date with Levantine month names.
   * @param {string|Date} iso 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM'
   * @param {{weekday?: boolean, year?: boolean, time?: boolean}} [opts]
   * @returns {string} e.g. date('2026-10-13', {weekday:true}) → "الثلاثاء ١٣ تشرين الأول"
   */
  function date(iso, opts) {
    const d = parseDate(iso);
    if (!d) return '';
    const o = opts || {};
    let s = `${ar(d.getDate())} ${MONTHS[d.getMonth()]}`;
    if (o.weekday) s = `${WEEKDAYS[d.getDay()]} ${s}`;
    if (o.year) s += ` ${ar(d.getFullYear())}`;
    if (o.time && /T\d{2}:\d{2}/.test(String(iso))) s += ` · ${ar(pad2(d.getHours()))}:${ar(pad2(d.getMinutes()))}`;
    return s;
  }

  /**
   * Whole-day difference (date − today).
   * @param {string|Date} iso
   * @returns {number|null}
   */
  function dayDiff(iso) {
    const d = parseDate(iso);
    const t = parseDate(today());
    if (!d || !t) return null;
    const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const b = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((a - b) / DAY_MS);
  }

  /**
   * Day count in Jordanian Arabic: "يوم" / "يومين" / "٣ أيام" / "١١ يوم".
   * @param {number} n
   * @returns {string}
   */
  function daysPhrase(n) {
    n = Math.round(Number(n) || 0);
    n = Math.abs(n);
    if (n === 1) return 'يوم';
    if (n === 2) return 'يومين';
    if (n <= 10) return `${ar(n)} أيام`;
    return `${ar(n)} يوم`;
  }

  /**
   * Relative day in Jordanian Arabic.
   * @param {string|Date} iso
   * @returns {string} "اليوم" | "بكرا" | "مبارح" | "بعد بكرا" | "بعد ٣ أيام" | "قبل ٦ أيام"
   */
  function relDay(iso) {
    const n = dayDiff(iso);
    if (n === null) return '';
    if (n === 0) return 'اليوم';
    if (n === 1) return 'بكرا';
    if (n === -1) return 'مبارح';
    if (n === 2) return 'بعد بكرا';
    if (n === -2) return 'قبل يومين';
    return n > 0 ? `بعد ${daysPhrase(n)}` : `قبل ${daysPhrase(n)}`;
  }

  /**
   * Seconds → "م:ثث" (or "س:دد:ثث" past an hour), Arabic-Indic.
   * @param {number} sec
   * @returns {string} e.g. duration(185) → "٣:٠٥"
   */
  function duration(sec) {
    let s = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    return ar(h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`);
  }

  /**
   * Mask secrets before showing/sending (identical to the original demo's maskSecrets):
   * the word after كلمة السر|كلمة سر|الباسورد|باسورد|password (optionally after هي|هو|:),
   * and any Latin+digit token of 6+ chars, become «[حُذفت]».
   * @param {string} text
   * @returns {{text: string, found: boolean}}
   */
  function mask(text) {
    let found = false;
    let t = String(text ?? '').replace(/(كلمة السر|كلمة سر|الباسورد|باسورد|password)(\s*(?:هي|هو|:)?\s*)([^\s،,.]+)/gi,
      (m, a, b, c) => { if (c === MASK) return m; found = true; return a + b + MASK; });
    t = t.replace(/[A-Za-z0-9]{6,}/g, (w) => ((/[A-Za-z]/.test(w) && /\d/.test(w)) ? (found = true, MASK) : w));
    return { text: t, found };
  }

  /**
   * Promise-based delay.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  /* ------------------------------------------------------------------------
     API — never throws; 20s timeout; null on failure / non-2xx
     ------------------------------------------------------------------------ */
  async function request(method, path, body, isForm) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : 0;
    try {
      const init = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
      if (ctl) init.signal = ctl.signal;
      if (body !== undefined && body !== null) {
        if (isForm) init.body = body;
        else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
      }
      const res = await fetch(path, init);
      const txt = await res.text();
      let data = null;
      try { data = txt ? JSON.parse(txt) : {}; } catch (_) { data = null; }
      if (!res.ok) {
        api.lastError = { status: res.status, path, error: (data && data.error) || null };
        return null;
      }
      return data;
    } catch (err) {
      api.lastError = { status: 0, path, error: null };
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const api = {
    /** @type {{status:number, path:string, error:(string|null)}|null} last failure (status 0 = network/timeout) */
    lastError: null,
    /**
     * GET JSON.
     * @param {string} path
     * @returns {Promise<object|null>}
     */
    get: (path) => request('GET', path),
    /**
     * POST JSON.
     * @param {string} path
     * @param {object} [body]
     * @returns {Promise<object|null>}
     */
    post: (path, body) => request('POST', path, body === undefined ? {} : body),
    /**
     * PATCH JSON.
     * @param {string} path
     * @param {object} body
     * @returns {Promise<object|null>}
     */
    patch: (path, body) => request('PATCH', path, body === undefined ? {} : body),
    /**
     * POST multipart FormData (browser sets the boundary).
     * @param {string} path
     * @param {FormData} formData
     * @returns {Promise<object|null>}
     */
    upload: (path, formData) => request('POST', path, formData, true),
  };

  /* ------------------------------------------------------------------------
     Store — cached GET /api/state
     ------------------------------------------------------------------------ */
  const STATE_KEYS = ['people', 'topics', 'sessions', 'cards', 'questions', 'roles', 'onboarding'];
  let storeCache = null;
  let storePending = null;

  function emptyState() {
    const s = { today: isoOf(new Date()), company: { name: 'شركة النخيل للمقاولات', short: 'النخيل', city: 'عمّان' }, offline: true };
    STATE_KEYS.forEach((k) => { s[k] = []; });
    return s;
  }
  function normalizeState(s) {
    const out = Object.assign({}, s);
    STATE_KEYS.forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
    if (!out.company || typeof out.company !== 'object') out.company = emptyState().company;
    if (!out.today) out.today = isoOf(new Date());
    return out;
  }
  const findIn = (k, id) => (storeCache && id != null ? storeCache[k].find((x) => x && x.id === id) || null : null);

  const store = {
    /**
     * Load (cached) /api/state. Never rejects: on failure resolves to the last good state
     * or to an empty-shaped state with `offline: true` (all arrays present).
     * @param {boolean} [force] bypass the cache
     * @returns {Promise<object>}
     */
    load(force) {
      if (storeCache && !force) return Promise.resolve(storeCache);
      if (storePending && !force) return storePending;
      const p = api.get('/api/state').then((s) => {
        if (storePending === p) storePending = null;
        if (s && typeof s === 'object' && Array.isArray(s.people)) {
          storeCache = normalizeState(s);
          emit('rawi:state', storeCache);
          return storeCache;
        }
        return storeCache || emptyState();
      });
      storePending = p;
      return p;
    },
    /** @returns {object|null} the cached state without fetching */
    peek() { return storeCache; },
    /** @param {string} id @returns {object|null} */
    person(id) { return findIn('people', id); },
    /** @param {string} id @returns {object|null} */
    card(id) { return findIn('cards', id); },
    /** @param {string} id @returns {object|null} */
    session(id) { return findIn('sessions', id); },
    /**
     * Upsert an object (by id) into a cached collection, e.g. after a PATCH.
     * @param {'people'|'topics'|'sessions'|'cards'|'questions'} kind
     * @param {object} obj
     * @returns {object|null} the stored object
     */
    put(kind, obj) {
      if (!storeCache || !obj || !obj.id || !Array.isArray(storeCache[kind])) return null;
      const arr = storeCache[kind];
      const i = arr.findIndex((x) => x && x.id === obj.id);
      if (i >= 0) arr[i] = Object.assign({}, arr[i], obj); else arr.push(obj);
      return i >= 0 ? arr[i] : obj;
    },
    /** Drop the cache (next load() refetches). */
    clear() { storeCache = null; storePending = null; },
  };

  /* ------------------------------------------------------------------------
     People helpers
     ------------------------------------------------------------------------ */
  const KNOWN_TINTS = { omar: 1, rana: 2, samer: 3, nader: 5, salma: 4, huda: 6, dana: 3, yazan: 2, tareq: 1, majed: 4 };
  function tintOf(key) {
    if (KNOWN_TINTS[key]) return KNOWN_TINTS[key];
    let h = 5381;
    const s = String(key || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return (h % 6) + 1;
  }
  /**
   * A person's first name without the engineer title ("م. سامر" → "سامر").
   * @param {object|string} p person or name
   * @returns {string}
   */
  function firstName(p) {
    const n = typeof p === 'string' ? p : (p && (p.name || p.full_name)) || '';
    return n.replace(/^\s*(م\.|د\.|أ\.)\s*/, '').trim().split(/\s+/)[0] || '';
  }
  function lookupPerson(people, id) {
    if (!id) return null;
    if (people === true) return store.person(id);
    if (Array.isArray(people)) return people.find((p) => p && p.id === id) || null;
    if (people && typeof people === 'object') return people[id] || null;
    return store.person(id);
  }

  /* ------------------------------------------------------------------------
     UI components (HTML strings)
     ------------------------------------------------------------------------ */
  const STATUS = {
    approved: ['معتمدة', 'ok'],
    pending: ['بانتظار المراجعة', 'warn'],
    rejected: ['مرفوضة', 'muted'],
    scheduled: ['مجدولة', 'info'],
    live: ['جارية هلق', 'accent is-live'],
    done: ['خلصت', 'muted'],
    open: ['مفتوح', 'warn'],
    answered: ['انجاوب', 'ok'],
  };
  const RISK = { high: ['خطر عالي', 'risk'], medium: ['انتبه', 'warn'], low: ['تمام', 'ok'] };

  /**
   * Avatar: initial letter on a tinted circle (deterministic tint per person).
   * Decorative (aria-hidden) — put the name next to it.
   * @param {object} person {id, name, full_name?, initials?}
   * @param {number} [size=40] px
   * @returns {string} HTML
   */
  function avatar(person, size) {
    const p = person || {};
    const letter = p.initials || firstName(p).charAt(0) || '؟';
    const s = Number(size) > 0 ? Number(size) : 40;
    return `<span class="avatar t${tintOf(p.id || p.name)}" style="--av:${s}px" title="${esc(p.full_name || p.name || '')}" aria-hidden="true">${esc(letter)}</span>`;
  }

  /**
   * Chip.
   * @param {string} text
   * @param {'ok'|'warn'|'risk'|'info'|'muted'|'accent'|'hl'} [kind]
   * @returns {string} HTML
   */
  function chip(text, kind) {
    return `<span class="chip${kind ? ' ' + esc(kind) : ''}">${esc(text)}</span>`;
  }

  /**
   * Status chip for cards / sessions / questions.
   * approved→معتمدة pending→بانتظار المراجعة rejected→مرفوضة scheduled→مجدولة
   * live→جارية هلق done→خلصت open→مفتوح answered→انجاوب
   * @param {string} status
   * @returns {string} HTML
   */
  function statusChip(status) {
    const m = STATUS[status] || [String(status || ''), 'muted'];
    return `<span class="chip ${m[1]}" data-status="${esc(status)}">${esc(m[0])}</span>`;
  }

  /**
   * Risk chip: high→خطر عالي medium→انتبه low→تمام
   * @param {'high'|'medium'|'low'} risk
   * @returns {string} HTML
   */
  function riskChip(risk) {
    const m = RISK[risk] || RISK.low;
    return `<span class="chip ${m[1]}" data-risk="${esc(risk)}">${esc(m[0])}</span>`;
  }

  /**
   * 3-dot confidence indicator.
   * @param {number} n 1..3
   * @returns {string} HTML
   */
  function conf(n) {
    const v = Math.max(1, Math.min(3, Math.round(Number(n) || 2)));
    const label = `درجة الثقة ${ar(v)} من ٣`;
    return `<span class="conf" role="img" title="${label}" aria-label="${label}">${[1, 2, 3].map((i) => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  /** Session number for the source chip: order among that person's sessions, else trailing digits. */
  function sessionNumber(sid, employeeId) {
    if (!sid) return null;
    if (storeCache) {
      const s = storeCache.sessions.filter((x) => x && x.employee_id === employeeId && x.status !== 'scheduled')
        .sort((a, b) => String(a.starts_at || a.date || '').localeCompare(String(b.starts_at || b.date || '')));
      const i = s.findIndex((x) => x.id === sid);
      if (i >= 0) return i + 1;
    }
    const m = /(\d+)$/.exec(String(sid));
    return m ? Number(m[1]) : null;
  }

  /**
   * Knowledge card.
   * @param {object} card {id, title, fact, tags, confidence, status, critical, audio_url, session_id, answer_index, employee_id, value_jod_year?}
   * @param {{people?: (object[]|Object<string,object>|true), actions?: string[], compact?: boolean, highlight?: boolean, source?: 'person'|'session'}} [opts]
   *   people: when given, the source chip reads «عمر · المشتريات» (true = use the store's people);
   *   source: force the chip format ('session' keeps «الجلسة ٢ · الجواب ٣» even with people);
   *   actions: any of 'listen','approve','reject','edit','open' (default ['listen']).
   *   'listen' renders only when card.audio_url exists.
   * @returns {string} HTML — root has data-card-id; buttons have data-action
   *   (approve/reject buttons also carry data-next-status = the status a click asks for).
   */
  function kcard(card, opts) {
    const c = card || {};
    const o = opts || {};
    const actions = Array.isArray(o.actions) ? o.actions : ['listen'];
    const status = c.status || 'pending';
    const person = lookupPerson(o.people, c.employee_id);
    const fname = person ? firstName(person) : '';

    let src;
    if (person && (o.source === 'person' || (o.people && o.source !== 'session'))) {
      src = [person.name, person.dept].filter(Boolean).join(' · ');
    } else {
      const parts = [];
      const sn = sessionNumber(c.session_id, c.employee_id);
      if (sn) parts.push(`الجلسة ${ar(sn)}`);
      if (isNum(c.answer_index)) parts.push(`الجواب ${ar(Number(c.answer_index) + 1)}`);
      src = parts.join(' · ') || 'من جلسة سابقة';
    }

    const cls = ['kcard', `is-${esc(status)}`];
    if (status === 'approved') cls.push('approved');
    if (c.critical) cls.push('is-critical');
    if (o.compact) cls.push('compact');
    if (o.highlight) cls.push('is-highlight');

    let endUsed = false;
    const endCls = () => { if (endUsed) return ''; endUsed = true; return ' kact-end'; };
    const btns = actions.map((a) => {
      if (a === 'listen') {
        if (!c.audio_url) return '';
        const lbl = fname ? `اسمع ${fname}` : 'اسمع التسجيل';
        return `<button class="btn voice sm" type="button" data-action="listen" data-url="${esc(c.audio_url)}" data-label="${esc(fname || 'التسجيل')}">${ICONS.play}${esc(lbl)}</button>`;
      }
      if (a === 'approve') {
        const on = status === 'approved';
        return `<button class="btn sm approve" type="button" data-action="approve" aria-pressed="${on}" data-next-status="${on ? 'pending' : 'approved'}">${on ? '✓ معتمدة' : 'اعتماد'}</button>`;
      }
      if (a === 'reject') {
        const on = status === 'rejected';
        return `<button class="btn sm ${on ? 'reject' : 'danger'}" type="button" data-action="reject" aria-pressed="${on}" data-next-status="${on ? 'pending' : 'rejected'}">${on ? 'مرفوضة' : 'رفض'}</button>`;
      }
      if (a === 'edit') return `<button class="btn sm ghost${endCls()}" type="button" data-action="edit">${ICONS.edit}تعديل</button>`;
      if (a === 'open') return `<button class="btn sm ghost${endCls()}" type="button" data-action="open">التفاصيل${ICONS.chevron}</button>`;
      return '';
    }).join('');

    const tags = !o.compact && Array.isArray(c.tags) && c.tags.length
      ? `<div class="tags">${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : '';
    const value = !o.compact && Number(c.value_jod_year) > 0
      ? `<div class="kmeta">قيمتها تقريباً ${esc(jod(c.value_jod_year))} بالسنة</div>` : '';
    const crit = c.critical ? `<span class="crit" title="معرفة حرجة للشغل">${ICONS.alert}حرجة</span>` : '';

    return `<article class="${cls.join(' ')}" data-card-id="${esc(c.id)}" data-status="${esc(status)}" id="card-${esc(c.id)}">
  <div class="khead"><span class="ksrc">${ICONS.mic}${esc(src)}</span>${statusChip(status)}${conf(c.confidence)}</div>
  <h3 class="ktitle">${crit}${rich(c.title)}</h3>
  <p class="kfact">${rich(c.fact)}</p>
  ${tags}${value}${btns ? `<div class="kact">${btns}</div>` : ''}
</article>`;
  }

  /**
   * Update a rendered kcard in place (status chip, classes, approve/reject buttons).
   * @param {Element|string} target the card element or its id
   * @param {'approved'|'pending'|'rejected'} status
   * @returns {Element|null}
   */
  function setCardStatus(target, status) {
    const el = typeof target === 'string'
      ? document.querySelector(`[data-card-id="${CSS && CSS.escape ? CSS.escape(target) : target}"]`) : target;
    if (!el) return null;
    el.classList.remove('is-approved', 'is-pending', 'is-rejected', 'approved');
    el.classList.add(`is-${status}`);
    if (status === 'approved') el.classList.add('approved');
    el.dataset.status = status;
    const sc = el.querySelector('.khead [data-status]');
    if (sc) sc.outerHTML = statusChip(status);
    const ap = el.querySelector('[data-action="approve"]');
    if (ap) {
      const on = status === 'approved';
      ap.setAttribute('aria-pressed', String(on));
      ap.dataset.nextStatus = on ? 'pending' : 'approved';
      ap.textContent = on ? '✓ معتمدة' : 'اعتماد';
    }
    const rj = el.querySelector('[data-action="reject"]');
    if (rj) {
      const on = status === 'rejected';
      rj.setAttribute('aria-pressed', String(on));
      rj.dataset.nextStatus = on ? 'pending' : 'rejected';
      rj.className = `btn sm ${on ? 'reject' : 'danger'}`;
      rj.textContent = on ? 'مرفوضة' : 'رفض';
    }
    return el;
  }

  /**
   * Delegated handler for kcard buttons inside `root`.
   * The handler runs first. Then, unless it called event.preventDefault():
   *   'listen'  → plays the card's audio in the shared mini-player;
   *   'approve' / 'reject' → the card UI flips optimistically to the button's data-next-status.
   * @param {Element} root
   * @param {(action: string, cardId: string, event: MouseEvent) => any} handler
   * @returns {() => void} unsubscribe
   */
  function onCardAction(root, handler) {
    if (!root) return () => {};
    const fn = (e) => {
      const btn = e.target.closest && e.target.closest('[data-action]');
      if (!btn || !root.contains(btn)) return;
      const card = btn.closest('[data-card-id]');
      if (!card) return;
      const action = btn.dataset.action;
      const id = card.dataset.cardId;
      const next = btn.dataset.nextStatus;
      try { if (typeof handler === 'function') handler(action, id, e); } catch (err) { console.warn('[Rawi] card action', err); }
      if (e.defaultPrevented) return;
      if (action === 'listen' && btn.dataset.url) audio.play(btn.dataset.url, { label: btn.dataset.label });
      else if ((action === 'approve' || action === 'reject') && next && card.isConnected) setCardStatus(card, next);
    };
    root.addEventListener('click', fn);
    return () => root.removeEventListener('click', fn);
  }

  function kindFor(v) { return v < 0.5 ? 'risk' : v < 0.75 ? 'warn' : 'ok'; }

  /**
   * Coverage ring (inline SVG). Sweeps counter-clockwise from 12 o'clock in RTL.
   * @param {number} value01 0..1
   * @param {{size?: number, label?: string, kind?: 'ink'|'ok'|'warn'|'risk'|'info'|'accent'|'auto'}} [opts]
   * @returns {string} HTML
   */
  function ring(value01, opts) {
    const o = opts || {};
    const v = clamp01(value01);
    const p = Math.round(v * 100);
    const size = Number(o.size) > 0 ? Number(o.size) : 88;
    const kind = o.kind === 'auto' ? kindFor(v) : (o.kind || 'ink');
    const sw = size < 64 ? 12 : size < 100 ? 9 : 8;
    const r = 50 - sw / 2 - 1;
    const label = o.label ? `${o.label}: ${pct(v)}` : pct(v);
    return `<div class="ring ${esc(kind)}" style="--ring-size:${size}px" role="img" aria-label="${esc(label)}">
  <span class="ring-chart"><svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <circle class="ring-track" cx="50" cy="50" r="${r}" stroke-width="${sw}"/>
    ${p > 0 ? `<circle class="ring-fill" cx="50" cy="50" r="${r}" stroke-width="${sw}" pathLength="100" stroke-dasharray="${p} 100"/>` : ''}
  </svg><span class="ring-value">${pct(v)}</span></span>${o.label ? `<span class="ring-label">${esc(o.label)}</span>` : ''}
</div>`;
  }

  /**
   * Horizontal meter. Fill carries meaning; track is a lighter step of the same ramp.
   * @param {number} value01 0..1
   * @param {{kind?: 'ink'|'ok'|'warn'|'risk'|'info'|'accent'|'auto', label?: string}} [opts]
   * @returns {string} HTML
   */
  function meter(value01, opts) {
    const o = opts || {};
    const v = clamp01(value01);
    const p = Math.round(v * 100);
    const kind = o.kind === 'auto' ? kindFor(v) : (o.kind || '');
    return `<div class="meter${kind ? ' ' + esc(kind) : ''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-valuetext="${pct(v)}"${o.label ? ` aria-label="${esc(o.label)}"` : ''}><span class="meter-fill" style="inline-size:${p}%"></span></div>`;
  }

  /**
   * Sparkline (inline SVG). Time flows with reading direction: oldest at inline-start
   * (right in RTL), newest at inline-end with an end dot.
   * @param {number[]} values
   * @param {{w?: number, h?: number, label?: string, kind?: 'ok'|'info'}} [opts]
   * @returns {string} HTML
   */
  function sparkline(values, opts) {
    const o = opts || {};
    const w = Number(o.w) > 0 ? Number(o.w) : 120;
    const h = Number(o.h) > 0 ? Number(o.h) : 36;
    const vals = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
    const rtl = (document.documentElement.getAttribute('dir') || 'rtl') === 'rtl';
    const pad = 4;
    const label = o.label || (vals.length ? `من ${num(vals[0])} لـ ${num(vals[vals.length - 1])}` : 'ما في بيانات');
    const cls = `spark${o.kind ? ' ' + esc(o.kind) : ''}`;
    if (vals.length < 2) {
      return `<svg class="${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><path class="spark-line" d="M${pad} ${h / 2}H${w - pad}" opacity=".35"/></svg>`;
    }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const n = vals.length;
    const pts = vals.map((v, i) => {
      const t = i / (n - 1);
      const x = rtl ? w - pad - t * (w - 2 * pad) : pad + t * (w - 2 * pad);
      const y = h - pad - ((v - min) / span) * (h - 2 * pad);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');
    const area = `${line}L${pts[n - 1][0]} ${h - pad}L${pts[0][0]} ${h - pad}Z`;
    const end = pts[n - 1];
    return `<svg class="${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}"><path class="spark-area" d="${area}"/><path class="spark-line" d="${line}"/><circle class="spark-dot" cx="${end[0]}" cy="${end[1]}" r="4"/></svg>`;
  }

  /**
   * Empty state.
   * @param {string} title
   * @param {string} [body]
   * @param {string} [actionHTML] raw HTML (buttons/links)
   * @returns {string} HTML
   */
  function empty(title, body, actionHTML) {
    return `<div class="empty"><span class="empty-mark">${ICONS.bars}</span><b class="empty-title">${esc(title)}</b>${body ? `<p>${esc(body)}</p>` : ''}${actionHTML ? `<div class="empty-act">${actionHTML}</div>` : ''}</div>`;
  }

  /**
   * Skeleton placeholders (shimmer). Returns n sibling blocks (no wrapper) so they
   * drop straight into a grid/list.
   * @param {number} [n=3]
   * @param {{lines?: number}} [opts] lines per block (default 3)
   * @returns {string} HTML
   */
  function skeleton(n, opts) {
    const count = Math.max(1, Number(n) || 3);
    const lines = Math.max(1, Math.min(6, (opts && Number(opts.lines)) || 3));
    let out = '';
    for (let k = 0; k < count; k++) {
      out += `<div class="skel"${k ? ' aria-hidden="true"' : ' role="status"'}>${k ? '' : '<span class="sr">عم نحمّل…</span>'}${'<i></i>'.repeat(lines)}</div>`;
    }
    return out;
  }

  /**
   * Wire an ARIA tablist: click + Arrow/Home/End keys (RTL-aware). Tabs are
   * [role=tab] with aria-controls; panels toggle `hidden`.
   * @param {Element} root element containing [role=tablist]
   * @param {(tab: Element, index: number) => void} [onChange]
   * @returns {{select: (i: number) => void}|null}
   */
  function tabs(root, onChange) {
    if (!root) return null;
    const list = root.matches('[role="tablist"]') ? root : root.querySelector('[role="tablist"]');
    if (!list) return null;
    const items = $$('[role="tab"]', list);
    const select = (i, focus) => {
      items.forEach((t, k) => {
        const on = k === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = t.getAttribute('aria-controls') && document.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) items[i].focus();
      if (typeof onChange === 'function') onChange(items[i], i);
    };
    items.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => {
        const rtl = getComputedStyle(list).direction === 'rtl';
        let j = null;
        if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) j = (i + 1) % items.length;
        else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) j = (i - 1 + items.length) % items.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = items.length - 1;
        if (j !== null) { e.preventDefault(); select(j, true); }
      });
    });
    const cur = Math.max(0, items.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
    items.forEach((t, k) => { t.tabIndex = k === cur ? 0 : -1; });
    return { select: (i) => select(i) };
  }

  /* ------------------------------------------------------------------------
     Toasts — queued, max 3 on screen
     ------------------------------------------------------------------------ */
  const toastQueue = [];
  let toastLive = 0;
  function toastRegion() {
    let el = document.getElementById('rawi-toasts');
    if (!el && document.body) {
      el = document.createElement('div');
      el.id = 'rawi-toasts';
      el.className = 'toast-region';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }
  function showNextToast() {
    if (toastLive >= 3 || !toastQueue.length) return;
    const region = toastRegion();
    if (!region) return;
    const { msg, kind, ms } = toastQueue.shift();
    const icon = kind === 'ok' ? ICONS.check : kind === 'lock' ? ICONS.lock : kind === 'warn' ? ICONS.alert : ICONS.info;
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.innerHTML = `${icon}<span>${esc(msg)}</span>`;
    region.appendChild(t);
    toastLive++;
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.remove(); toastLive--; showNextToast(); }, R.reduceMotion ? 0 : 260);
    }, ms);
  }
  /**
   * Show a toast (queued; at most 3 at once).
   * @param {string} msg
   * @param {{kind?: 'ok'|'lock'|'info'|'warn', ms?: number}} [opts]
   */
  function toast(msg, opts) {
    const o = opts || {};
    toastQueue.push({ msg: String(msg ?? ''), kind: o.kind || 'info', ms: Number(o.ms) > 0 ? Number(o.ms) : 3200 });
    showNextToast();
  }

  /* ------------------------------------------------------------------------
     Audio — one shared player + floating mini bar
     ------------------------------------------------------------------------ */
  let audioEl = null;
  let audioToken = 0;
  let audioLabel = '';
  function ensurePlayer() {
    if (!document.body) return null;
    if (!audioEl) {
      audioEl = document.getElementById('rawi-audio');
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = 'rawi-audio';
        audioEl.preload = 'none';
        document.body.appendChild(audioEl);
      }
      audioEl.addEventListener('timeupdate', updatePlayerTime);
      audioEl.addEventListener('loadedmetadata', updatePlayerTime);
      audioEl.addEventListener('ended', () => hidePlayer());
      audioEl.addEventListener('error', () => {
        if (!audioEl.getAttribute('src')) return;
        const was = audioEl.dataset.token;
        hidePlayer();
        if (String(audioToken) === was) toast('ما قدرنا نشغّل التسجيل هلق', { kind: 'info' });
      });
    }
    let bar = document.getElementById('rawi-player');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'rawi-player';
      bar.className = 'miniplayer';
      bar.hidden = true;
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'مشغّل الصوت');
      bar.innerHTML = `<span class="mp-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
<span class="mp-text"><span class="mp-label" id="rawi-player-label">عم تسمع…</span><span class="mp-time" id="rawi-player-time">٠:٠٠</span></span>
<button class="btn icon sm mp-stop" type="button" data-player-stop aria-label="وقّف التسجيل">${ICONS.stop}</button>`;
      document.body.appendChild(bar);
    }
    if (!bar.dataset.wired) {
      bar.dataset.wired = '1';
      bar.addEventListener('click', (e) => { if (e.target.closest('[data-player-stop]')) audio.stop(); });
    }
    return bar;
  }
  function updatePlayerTime() {
    const el = document.getElementById('rawi-player-time');
    if (!el || !audioEl) return;
    const cur = duration(audioEl.currentTime || 0);
    const d = audioEl.duration;
    el.textContent = Number.isFinite(d) && d > 0 ? `${cur} / ${duration(d)}` : cur;
  }
  function markPlaying(url) {
    $$('[data-url].is-playing').forEach((b) => { b.classList.remove('is-playing'); });
    if (!url) return;
    $$('[data-url]').forEach((b) => { if (b.dataset.url === url) b.classList.add('is-playing'); });
  }
  function showPlayer(label) {
    const bar = ensurePlayer();
    if (!bar) return;
    const l = document.getElementById('rawi-player-label');
    if (l) l.textContent = `عم تسمع ${label}…`;
    bar.hidden = false;
    document.body.classList.add('has-player');
    updatePlayerTime();
  }
  function hidePlayer() {
    const bar = document.getElementById('rawi-player');
    if (bar) bar.hidden = true;
    if (document.body) document.body.classList.remove('has-player');
    markPlaying(null);
    emit('rawi:audio', { state: 'stopped' });
  }
  function cancelSpeech() { try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) { /* ignore */ } }

  const audio = {
    /**
     * Play a recording in the shared player and show «عم تسمع {label}…».
     * Calling it again with the recording that is playing stops it (toggle).
     * @param {string} url
     * @param {{label?: string}} [opts]
     * @returns {Promise<boolean>} true when playback started
     */
    play(url, opts) {
      if (!url) return Promise.resolve(false);
      ensurePlayer();
      if (!audioEl) return Promise.resolve(false);
      if (audioEl.dataset.url === url && !audioEl.paused && audioEl.getAttribute('src')) {
        audio.stop();                                    // same recording again = stop (toggle)
        return Promise.resolve(false);
      }
      cancelSpeech();
      const token = ++audioToken;
      audioLabel = (opts && opts.label) || 'التسجيل';
      try { audioEl.pause(); } catch (_) { /* ignore */ }
      audioEl.dataset.token = String(token);
      audioEl.dataset.url = url;
      audioEl.src = url;
      showPlayer(audioLabel);
      markPlaying(url);
      emit('rawi:audio', { state: 'playing', url, label: audioLabel });
      let p;
      try { p = audioEl.play(); } catch (_) { p = Promise.reject(new Error('play')); }
      return Promise.resolve(p).then(() => true).catch((err) => {
        if (token !== audioToken) return false;          // superseded or stopped
        hidePlayer();
        if (!err || err.name !== 'AbortError') toast('ما قدرنا نشغّل التسجيل هلق', { kind: 'info' });
        return false;
      });
    },
    /** Stop playback and hide the mini bar. */
    stop() {
      audioToken++;
      if (audioEl) {
        try { audioEl.pause(); } catch (_) { /* ignore */ }
        audioEl.removeAttribute('src');
        delete audioEl.dataset.url;
        try { audioEl.load(); } catch (_) { /* ignore */ }
      }
      hidePlayer();
    },
    /** @returns {boolean} */
    isPlaying() { return !!(audioEl && !audioEl.paused && audioEl.getAttribute('src')); },
  };

  /* ------------------------------------------------------------------------
     Speech synthesis (Arabic voice only) + typewriter
     ------------------------------------------------------------------------ */
  let arVoice = null;
  function pickVoice() {
    try {
      const v = window.speechSynthesis.getVoices();
      arVoice = v.find((x) => /^ar[-_]JO/i.test(x.lang)) || v.find((x) => /^ar/i.test(x.lang)) || null;
    } catch (_) { arVoice = null; }
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    try { window.speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch (_) { /* ignore */ }
  }
  /**
   * Speak Arabic text if an Arabic voice exists; otherwise a silent no-op.
   * @param {string} text
   * @returns {boolean} whether speech started
   */
  function speak(text) {
    if (!arVoice || !text) return false;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).split(MASK).join('…'));
      u.voice = arVoice;
      u.lang = arVoice.lang;
      window.speechSynthesis.speak(u);
      return true;
    } catch (_) { return false; }
  }

  /**
   * Typewriter into an element; ends with rich(text). Instant under reduced motion.
   * @param {Element} el
   * @param {string} text
   * @param {{scroller?: Element}|Element} [opts] element to keep scrolled to bottom
   * @returns {Promise<void>}
   */
  function typeInto(el, text, opts) {
    const scroller = opts && opts.nodeType === 1 ? opts : (opts && opts.scroller) || null;
    const s = String(text ?? '');
    return new Promise((resolve) => {
      if (!el) return resolve();
      const token = (el.__rawiType = (el.__rawiType || 0) + 1);
      const keep = () => { if (scroller) scroller.scrollTop = scroller.scrollHeight; };
      if (R.reduceMotion || !s) { el.innerHTML = rich(s); keep(); return resolve(); }
      let i = 0;
      const step = () => {
        if (el.__rawiType !== token) return resolve();
        i = Math.min(s.length, i + 2);
        el.textContent = s.slice(0, i);
        keep();
        if (i < s.length) setTimeout(step, 22);
        else { el.innerHTML = rich(s); keep(); resolve(); }
      };
      step();
    });
  }

  /* ------------------------------------------------------------------------
     Theme — localStorage['rawi-theme'] = light|dark|auto → <html data-theme>
     ------------------------------------------------------------------------ */
  const theme = {
    /** @returns {'light'|'dark'|'auto'} the stored preference */
    get() {
      let t = null;
      try { t = localStorage.getItem(THEME_KEY); } catch (_) { /* storage blocked */ }
      if (!THEMES.includes(t)) t = document.documentElement.getAttribute('data-theme');
      return THEMES.includes(t) ? t : 'auto';
    },
    /**
     * Set and persist the theme.
     * @param {'light'|'dark'|'auto'} mode
     * @returns {'light'|'dark'|'auto'}
     */
    set(mode) {
      const m = THEMES.includes(mode) ? mode : 'auto';
      try { localStorage.setItem(THEME_KEY, m); } catch (_) { /* storage blocked */ }
      document.documentElement.setAttribute('data-theme', m);
      syncTheme();
      emit('rawi:theme', { mode: m, resolved: theme.resolved() });
      return m;
    },
    /** @returns {'light'|'dark'} what is actually showing */
    resolved() {
      const m = document.documentElement.getAttribute('data-theme');
      if (m === 'light' || m === 'dark') return m;
      return darkMQ.matches ? 'dark' : 'light';
    },
  };
  function syncTheme() {
    const m = theme.get();
    $$('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === m)));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.resolved() === 'dark' ? '#141311' : '#F6F1E8');
  }

  /* ------------------------------------------------------------------------
     Shell behaviour: drawer, theme toggle, health, nav badges, dialogs
     ------------------------------------------------------------------------ */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function initDrawer() {
    const nav = document.getElementById('rawi-nav');
    const btn = document.getElementById('rawi-menu');
    const scrim = document.getElementById('rawi-scrim');
    if (!nav || !btn) return;
    const desk = mq('(min-width: 1024px)');
    let open = false;
    let lastFocus = null;

    const apply = () => {
      if (desk.matches) {
        nav.removeAttribute('inert');
        nav.removeAttribute('role');
        nav.removeAttribute('aria-modal');
      } else if (!open) {
        nav.setAttribute('inert', '');
      }
    };
    const openDrawer = () => {
      if (open || desk.matches) return;
      open = true;
      lastFocus = document.activeElement;
      nav.removeAttribute('inert');
      nav.setAttribute('role', 'dialog');
      nav.setAttribute('aria-modal', 'true');
      nav.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      document.documentElement.classList.add('is-locked');
      if (scrim) { scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add('is-on')); }
      const first = nav.querySelector('[aria-current="page"]') || nav.querySelector(FOCUSABLE);
      setTimeout(() => { if (first) first.focus(); }, 30);
    };
    const closeDrawer = (restore) => {
      if (!open) return;
      open = false;
      nav.classList.remove('is-open');
      nav.removeAttribute('role');
      nav.removeAttribute('aria-modal');
      btn.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.remove('is-locked');
      if (scrim) {
        scrim.classList.remove('is-on');
        setTimeout(() => { if (!open) scrim.hidden = true; }, R.reduceMotion ? 0 : 260);
      }
      apply();
      if (restore !== false) (lastFocus && lastFocus.isConnected ? lastFocus : btn).focus();
    };

    btn.addEventListener('click', () => (open ? closeDrawer() : openDrawer()));
    if (scrim) scrim.addEventListener('click', () => closeDrawer());
    $$('[data-drawer-close]', nav).forEach((b) => b.addEventListener('click', () => closeDrawer()));
    nav.addEventListener('click', (e) => { if (open && e.target.closest('a[href]')) closeDrawer(false); });
    document.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
      if (e.key === 'Tab') {
        const f = $$(FOCUSABLE, nav).filter((x) => x.offsetParent !== null || x === document.activeElement);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || !nav.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !nav.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    });
    const onChange = () => { if (desk.matches && open) closeDrawer(false); apply(); };
    if (desk.addEventListener) desk.addEventListener('change', onChange);
    else if (desk.addListener) desk.addListener(onChange);
    apply();
    R.drawer = { open: openDrawer, close: closeDrawer, isOpen: () => open };
  }

  function initThemeToggle() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-theme-set]');
      if (!b) return;
      theme.set(b.dataset.themeSet);
    });
    const onSys = () => { syncTheme(); if (theme.get() === 'auto') emit('rawi:theme', { mode: 'auto', resolved: theme.resolved() }); };
    if (darkMQ.addEventListener) darkMQ.addEventListener('change', onSys);
    syncTheme();
  }

  function initHealth() {
    const els = $$('[data-health]');
    api.get('/api/health').then((h) => {
      R.health = h;
      const live = !!(h && h.ok !== false && h.provider && h.provider !== 'fallback');
      const who = h && h.provider === 'anthropic' ? 'Anthropic' : h && h.provider === 'openrouter' ? 'OpenRouter' : '';
      els.forEach((el) => {
        el.dataset.health = live ? 'live' : 'fallback';
        const t = el.querySelector('.health-text') || el;
        t.textContent = live ? 'متصل بالنموذج' : 'وضع احتياطي';
        el.title = live
          ? [who, h.model].filter(Boolean).join(' · ')
          : 'راوي شغّال بأجوبة جاهزة — كل إشي بضل يشتغل';
      });
      emit('rawi:health', h);
    });
  }

  function initNavBadges() {
    const badge = document.querySelector('[data-nav-badge="manager"]');
    if (!badge) return;
    setTimeout(() => {
      api.get('/api/metrics').then((m) => {
        const n = m && Number(m.cards_pending);
        if (n > 0) {
          badge.textContent = ar(n);
          badge.title = `${ar(n)} بطاقات بانتظار المراجعة`;
          badge.hidden = false;
        }
      });
    }, 400);
  }

  function initDialogs() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      const opener = t.closest('[data-open-dialog]');
      if (opener) {
        const d = document.getElementById(opener.dataset.openDialog);
        if (d && typeof d.showModal === 'function' && !d.open) { d.showModal(); return; }
      }
      const closer = t.closest('[data-close]');
      if (closer) {
        const d = closer.closest('dialog');
        if (d && d.open) { d.close(closer.dataset.close || ''); return; }
      }
      if (t.tagName === 'DIALOG' && t.open) {
        const r = t.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) t.close('');
      }
    });
  }

  function init() {
    initDrawer();
    initThemeToggle();
    initHealth();
    initNavBadges();
    initDialogs();
    const bar = document.getElementById('rawi-player');
    if (bar) ensurePlayer();
  }

  /* ------------------------------------------------------------------------
     Export
     ------------------------------------------------------------------------ */
  Object.assign(R, {
    $, $$, esc, rich, ar, num, jod, pct, date, relDay, duration, mask, sleep, today, dayDiff, daysPhrase, firstName,
    MASK, MONTHS, WEEKDAYS,
    api, store, toast, audio, speak, typeInto, theme,
    icons: Object.assign(R.icons || {}, ICONS),
    ui: Object.assign(R.ui || {}, {
      avatar, chip, statusChip, riskChip, conf, kcard, setCardStatus, onCardAction,
      ring, meter, sparkline, empty, skeleton, tabs,
    }),
  });
  Object.defineProperty(R, 'reduceMotion', {
    configurable: true,
    enumerable: true,
    get() { return !!reduceMQ.matches; },
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
