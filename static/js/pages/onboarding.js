/* Rawi — onboarding hub (/onboarding/<pid>) */
(function () {
  'use strict';
  const R = window.Rawi;
  if (!R) return;
  const $ = (s) => document.querySelector(s);
  const esc = R.esc;
  const INCOMING = ['rana', 'dana', 'tareq'];
  const FEMALE = ['huda', 'salma', 'rana', 'dana'];
  const pid = (document.body.dataset.pid || 'rana').trim() || 'rana';
  const KEY = 'rawi-ob-check-' + pid;

  let S = null;
  let me = null;
  let pred = null;

  const isFemale = (p) => {
    if (!p) return false;
    if (p.gender) return /^f/i.test(String(p.gender));
    if (FEMALE.indexOf(p.id) >= 0) return true;
    return /[ةى]$/.test(String(p.name || ''));
  };
  const nameOf = (p) => (p && (p.name || p.full_name)) || '';
  const fname = (p) => (R.firstName ? R.firstName(p) : nameOf(p)) || nameOf(p);
  const person = (id) => (S && Array.isArray(S.people) ? S.people.find((x) => x && x.id === id) : null) || null;

  function readChecks() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; }
  }
  function writeChecks(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (_) { /* ignore */ }
  }

  /* ---------------- switcher ---------------- */
  function renderSwitch() {
    const nav = $('#ob-switch');
    if (!nav) return;
    let list = INCOMING.map((id) => person(id) || { id: id, name: { rana: 'رنا', dana: 'دانة', tareq: 'طارق' }[id] });
    if (S && Array.isArray(S.people)) {
      const extra = S.people.filter((p) => p && p.status === 'incoming' && INCOMING.indexOf(p.id) < 0);
      list = list.concat(extra);
    }
    nav.innerHTML = list.map((p) =>
      `<a href="/onboarding/${encodeURIComponent(p.id)}"${p.id === pid ? ' aria-current="page"' : ''}>${esc(fname(p))}</a>`).join('');
  }

  /* ---------------- hero ---------------- */
  function renderHero() {
    const el = $('#ob-hero');
    if (!el) return;
    if (!me) {
      el.innerHTML = R.ui.empty('ما لقينا هالموظف', 'جرّب تختار حدا من فوق.', '<a class="btn sm" href="/onboarding/rana">روح لرنا</a>');
      return;
    }
    const ob = (S.onboarding || []).find((o) => o && o.person_id === pid) || {};
    const n = me.start_date ? R.dayDiff(me.start_date) : null;
    let dayHTML = '';
    let prog = 0;
    if (n === null) {
      dayHTML = '<span class="chip muted no-dot">أول ٣٠ يوم</span>';
    } else if (n > 0) {
      dayHTML = `<span class="chip warn no-dot">بتبلّش بعد ${esc(R.ar(n === 1 ? 'يوم' : n === 2 ? 'يومين' : n + (n <= 10 ? ' أيام' : ' يوم')))}</span>`;
    } else {
      const day = Math.min(30, -n + 1);
      prog = day / 30;
      dayHTML = `<span class="chip ok no-dot">اليوم ${esc(R.ar(day))} من ${esc(R.ar(30))}</span>`;
    }
    const predName = pred ? fname(pred) : '';
    const welcome = ob.welcome || (pred
      ? `أهلين فيك ${fname(me)}. سجّلت لك كل إشي بعرفه عن الشغل هون، اسأل راوي عن أي إشي وبتسمع الجواب بصوتي.`
      : '');
    const predRole = pred ? [pred.role, pred.dept].filter(Boolean).join(' · ') : '';
    el.innerHTML = `
      <div class="ob-hero-main">
        <div class="ob-hero-text">
          <h1 class="ob-title">أهلاً ${esc(fname(me))}</h1>
          <p class="lede">${esc([me.role, me.dept].filter(Boolean).join(' · ') || 'أهلاً فيك معنا')}</p>
          <div class="cluster">${dayHTML}${me.start_date ? `<span class="chip muted no-dot">بلّشت ${esc(R.date(me.start_date))}</span>` : ''}</div>
          ${n !== null && n <= 0 ? `<div class="ob-days" aria-hidden="true"><i style="inline-size:${Math.round(prog * 100)}%"></i></div>` : ''}
        </div>
        ${pred ? `
        <figure class="ob-welcome">
          <div class="ob-welcome-who">${R.ui.avatar(pred)}<div><b>${esc(nameOf(pred))}</b><span class="muted">${esc(predRole)}</span></div></div>
          <blockquote>${R.rich(welcome)}</blockquote>
          <figcaption class="muted">رسالة ترحيب من ${esc(predName)} — ${isFemale(pred) ? 'كانت' : 'كان'} بمكانك قبلك</figcaption>
        </figure>` : `<div class="ob-welcome">${R.ui.empty('ما في حدا قبلك بهالدور', 'راوي بجاوبك من قاعدة المعرفة كاملة.')}</div>`}
      </div>`;
  }

  /* ---------------- ask ---------------- */
  function renderSuggestions() {
    const el = $('#ob-sugg');
    if (!el) return;
    const topics = (S.topics || []).filter((t) => t && pred && t.employee_id === pred.id);
    const qs = topics.slice(0, 5).map((t) => `شو لازم أعرف عن ${t.name}؟`);
    if (!qs.length) qs.push('مين الموردين الرئيسيين؟', 'كيف بتمشي الدفعات؟');
    el.innerHTML = '<span class="muted ob-sugg-lbl">جرّب:</span>' + qs.map((q) =>
      `<button class="chip no-dot ob-chip" type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('');
  }

  let asking = false;
  async function ask(question) {
    const q = String(question || '').trim();
    const out = $('#ob-answer');
    if (!q || asking || !out) return;
    asking = true;
    const btn = $('#ob-ask-btn');
    if (btn) btn.disabled = true;
    out.hidden = false;
    out.innerHTML = `<div class="ob-a-q"><span class="muted">سؤالك:</span> ${esc(q)}</div><div class="skel" role="status"><span class="sr">راوي عم يدوّر…</span><i></i><i></i></div>`;
    const predId = pred ? pred.id : 'omar';
    let res = null;
    try {
      res = await R.api.post('/api/ask', { question: q, employee_id: predId, log_gap: true, asked_by: pid });
    } catch (_) { res = null; }
    const pn = pred ? fname(pred) : 'اللي قبلك';
    if (!res) {
      out.innerHTML = `<div class="ob-a-q"><span class="muted">سؤالك:</span> ${esc(q)}</div>${R.ui.empty('ما قدرنا نوصل لراوي هلق', 'جرّب كمان شوي.')}`;
    } else if (res.unknown || !res.answer) {
      out.innerHTML = `<div class="ob-a-q"><span class="muted">سؤالك:</span> ${esc(q)}</div>
        <div class="ob-unknown">
          <b>${esc(pn)} ${isFemale(pred) ? 'ما حكت' : 'ما حكى'} عن هاد لسا</b>
          <span class="chip warn no-dot">أُضيفت لأسئلة الجلسة الجاية</span>
        </div>`;
      if (S && Array.isArray(S.questions)) {
        S.questions.push({ id: res.question_id || ('local-' + Date.now()), employee_id: predId, text: q, asked_by: pid, status: 'open', created: R.today() });
        renderQuestions();
      }
    } else {
      const card = res.card || (res.card_id ? (S.cards || []).find((c) => c && c.id === res.card_id) : null);
      out.innerHTML = `<div class="ob-a-q"><span class="muted">سؤالك:</span> ${esc(q)}</div>
        <div class="ob-a-body"><p class="ob-a-text" id="ob-a-text"></p>
        <div class="cluster ob-a-meta">
          <span class="chip muted no-dot">المصدر: ${esc(res.source || (card ? card.title : '') || ('كلام ' + pn))}</span>
          ${card && card.audio_url ? `<button class="btn voice sm" type="button" id="ob-a-play">${R.icons.play || ''}اسمع ${esc(pn)}</button>` : ''}
        </div></div>`;
      const play = $('#ob-a-play');
      if (play && card) play.addEventListener('click', () => R.audio.play(card.audio_url, { label: pn }));
      const typing = R.typeInto($('#ob-a-text'), res.answer);
      if (card && card.audio_url) R.audio.play(card.audio_url, { label: pn });
      await typing;
    }
    asking = false;
    if (btn) btn.disabled = false;
  }

  function wireAsk() {
    const form = $('#ob-ask-form');
    const input = $('#ob-q');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); ask(input && input.value); });
    const sugg = $('#ob-sugg');
    if (sugg) sugg.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-q]');
      if (!b) return;
      if (input) input.value = b.dataset.q;
      ask(b.dataset.q);
    });
    const mic = $('#ob-mic');
    try {
      if (R.Voice && typeof R.Voice.dictate === 'function' && mic && input) {
        R.Voice.dictate({ button: mic, input: input, onFinal: (t) => { if (t && t.trim()) ask(t); } });
      }
    } catch (_) { /* ignore */ }
  }

  /* ---------------- learning path ---------------- */
  function renderPath() {
    const el = $('#ob-path');
    if (!el) return;
    const cards = (S.cards || []).filter((c) => c && pred && c.employee_id === pred.id && c.status === 'approved');
    const cnt = $('#ob-path-count');
    if (cnt) cnt.textContent = cards.length ? `${R.ar(cards.length)} بطاقة` : '';
    if (!cards.length) {
      el.innerHTML = R.ui.empty('لسا ما في بطاقات معتمدة', pred ? `أول ما تنعتمد بطاقات ${fname(pred)} رح تطلع هون.` : 'رح تطلع هون أول ما تجهز.');
      return;
    }
    const topics = S.topics || [];
    const groups = new Map();
    cards.forEach((c) => {
      const k = c.topic_id || '_';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    });
    let i = 0;
    el.innerHTML = Array.from(groups.entries()).map(([tid, list]) => {
      i += 1;
      const t = topics.find((x) => x && x.id === tid);
      const title = t ? t.name : 'مواضيع ثانية';
      return `<details class="ob-topic"${i <= 2 ? ' open' : ''}>
        <summary><span class="ob-step">${esc(R.ar(i))}</span><b>${esc(title)}</b>${t && t.critical ? '<span class="chip risk no-dot">حرج</span>' : ''}<span class="spacer"></span><span class="muted ob-topic-n">${esc(R.ar(list.length))} بطاقة</span></summary>
        <div class="stack tight ob-topic-cards">${list.map((c) => R.ui.kcard(c, { actions: ['listen'], compact: true })).join('')}</div>
      </details>`;
    }).join('');
  }

  /* ---------------- checklist ---------------- */
  function renderChecklist() {
    const el = $('#ob-check');
    if (!el) return;
    const ob = (S.onboarding || []).find((o) => o && o.person_id === pid);
    const items = ob && Array.isArray(ob.checklist) ? ob.checklist : [];
    const cnt = $('#ob-check-count');
    const meter = $('#ob-check-meter');
    if (!items.length) {
      el.innerHTML = R.ui.empty('ما في قائمة لسا', 'مديرك رح يجهّزلك قائمة أول ٣٠ يوم.');
      if (cnt) cnt.textContent = '';
      if (meter) meter.innerHTML = '';
      return;
    }
    const saved = readChecks();
    const done = (it) => (Object.prototype.hasOwnProperty.call(saved, it.id) ? !!saved[it.id] : !!it.done);
    const n = items.filter(done).length;
    if (cnt) cnt.textContent = `${R.ar(n)} من ${R.ar(items.length)}`;
    if (meter) {
      try { meter.innerHTML = R.ui.meter(n / items.length, { label: 'التقدّم' }); } catch (_) { meter.innerHTML = ''; }
    }
    el.innerHTML = items.map((it) => {
      const card = it.card_id ? (S.cards || []).find((c) => c && c.id === it.card_id) : null;
      return `<label class="check ob-check${done(it) ? ' is-done' : ''}"><input type="checkbox" data-id="${esc(it.id)}"${done(it) ? ' checked' : ''}> <span>${R.rich(it.text || '')}${card ? `<small class="muted ob-check-card">من بطاقة: ${esc(card.title || '')}</small>` : ''}</span></label>`;
    }).join('');
  }
  function wireChecklist() {
    const el = $('#ob-check');
    if (!el) return;
    el.addEventListener('change', (e) => {
      const cb = e.target;
      if (!cb || !cb.dataset || !cb.dataset.id) return;
      const saved = readChecks();
      saved[cb.dataset.id] = !!cb.checked;
      writeChecks(saved);
      renderChecklist();
      if (cb.checked) R.toast('برافو! خلصت خطوة', { kind: 'ok' });
    });
  }

  /* ---------------- questions ---------------- */
  function renderQuestions() {
    const el = $('#ob-qs');
    if (!el) return;
    const qs = (S.questions || []).filter((q) => q && q.asked_by === pid);
    const answered = qs.filter((q) => q.status === 'answered');
    const waiting = qs.filter((q) => q.status !== 'answered');
    const cnt = $('#ob-qs-count');
    if (cnt) cnt.textContent = qs.length ? `${R.ar(answered.length)} تجاوبت · ${R.ar(waiting.length)} بتستنى` : '';
    if (!qs.length) {
      el.innerHTML = R.ui.empty('لسا ما سألت إشي', 'اسأل راوي فوق، واللي ما إله جواب بنسأله بالجلسة الجاية.');
      return;
    }
    const row = (q) => {
      const ok = q.status === 'answered';
      const st = ok ? '<span class="chip ok no-dot">تجاوب</span>' : q.status === 'scheduled' ? '<span class="chip info no-dot">بالجلسة الجاية</span>' : '<span class="chip warn no-dot">بيستنى</span>';
      return `<div class="ob-q"><p>${R.rich(q.text || '')}</p><div class="cluster">${st}${q.created ? `<span class="muted ob-q-date">${esc(R.relDay(q.created) || R.date(q.created))}</span>` : ''}</div></div>`;
    };
    el.innerHTML = waiting.concat(answered).map(row).join('');
  }

  /* ---------------- people ---------------- */
  function renderPeople() {
    const el = $('#ob-people');
    if (!el) return;
    const cards = (S.cards || []).filter((c) => c && pred && c.employee_id === pred.id && c.status === 'approved');
    const text = cards.map((c) => `${c.title || ''} ${c.fact || ''}`).join(' ');
    const seen = new Set([pid]);
    const list = [];
    const add = (p, why) => { if (p && !seen.has(p.id)) { seen.add(p.id); list.push({ p, why }); } };
    if (me && me.manager) add(person(me.manager), 'مديرك المباشر');
    if (pred) add(pred, isFemale(pred) ? 'كانت بمكانك' : 'كان بمكانك');
    (S.people || []).forEach((p) => {
      if (!p || seen.has(p.id)) return;
      const fn = fname(p);
      if (fn && fn.length > 1 && text.indexOf(fn) >= 0) add(p, 'مذكور ببطاقات ' + (pred ? fname(pred) : 'المعرفة'));
    });
    if (!list.length) {
      el.innerHTML = R.ui.empty('لسا ما في أسماء', 'رح نضيف الناس المهمين أول ما يتذكروا بالبطاقات.');
      return;
    }
    el.innerHTML = list.slice(0, 6).map(({ p, why }) =>
      `<div class="ob-person">${R.ui.avatar(p)}<div><b>${esc(nameOf(p))}</b><span class="muted">${esc([p.role, why].filter(Boolean).join(' · '))}</span></div></div>`).join('');
  }

  /* ---------------- boot ---------------- */
  function renderAll() {
    me = person(pid);
    pred = me && me.predecessor ? person(me.predecessor) : null;
    const src = $('#ob-ask-src');
    if (src) src.textContent = pred ? `من كلام ${fname(pred)}` : 'من قاعدة المعرفة';
    const steps = [renderSwitch, renderHero, renderSuggestions, renderPath, renderChecklist, renderQuestions, renderPeople];
    steps.forEach((f) => { try { f(); } catch (err) { console.warn('[onboarding]', err); } });
  }

  wireAsk();
  wireChecklist();
  try { R.ui.onCardAction($('#ob-path'), () => {}); } catch (_) { /* ignore */ }

  Promise.resolve(R.store.load()).then((s) => {
    S = s && typeof s === 'object' ? s : null;
    if (!S) S = { people: [], topics: [], cards: [], questions: [], onboarding: [] };
    ['people', 'topics', 'cards', 'questions', 'onboarding'].forEach((k) => { if (!Array.isArray(S[k])) S[k] = []; });
    renderAll();
  }).catch(() => {
    S = { people: [], topics: [], cards: [], questions: [], onboarding: [] };
    renderAll();
  });
})();
