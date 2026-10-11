/* Manager desk (م. سامر) — review queue, handover pair, open questions, upcoming sessions */
(function () {
  'use strict';
  const R = window.Rawi;
  if (!R) return;
  const { $, esc, ar } = R;
  const ME = 'samer';
  const LEAVER = 'omar';
  const SUCCESSOR = 'rana';

  let state = null;
  let metrics = null;
  let scope = 'team';
  let editing = null; // card id being edited
  const pendingUndo = { timer: null, fn: null };

  const els = {
    greet: $('#mgr-greet'), lede: $('#mgr-lede'), count: $('#mgr-count'),
    queue: $('#mgr-queue'), bulk: $('#mgr-bulk'), bulkBtn: $('#mgr-approve-omar'), bulkNote: $('#mgr-bulk-note'),
    scope: $('#mgr-scope'), pair: $('#mgr-pair'), pairRisk: $('#mgr-pair-risk'),
    qs: $('#mgr-questions'), sess: $('#mgr-sessions'),
    undo: $('#mgr-undo'), undoMsg: $('#mgr-undo-msg'), undoBtn: $('#mgr-undo-btn')
  };

  function list(k) { return (state && Array.isArray(state[k])) ? state[k].filter(Boolean) : []; }
  function person(id) { return (R.store.person && R.store.person(id)) || list('people').find((p) => p.id === id) || null; }
  function pname(id) { const p = person(id); return (p && p.name) || 'زميل'; }
  function teamIds() {
    const ids = new Set([LEAVER, SUCCESSOR]);
    list('people').forEach((p) => { if (p.manager === ME) ids.add(p.id); });
    return ids;
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'صباح الخير يا م. سامر' : (h < 18 ? 'مسا الخير يا م. سامر' : 'مسا النور يا م. سامر');
  }

  function pendingCards() {
    const team = teamIds();
    return list('cards')
      .filter((c) => c.status === 'pending' && (scope === 'all' || team.has(c.employee_id)))
      .sort((a, b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0) || (Number(b.value_jod_year) || 0) - (Number(a.value_jod_year) || 0));
  }

  /* ---------------- Header ---------------- */
  function renderHead() {
    els.greet.textContent = greeting();
    const team = teamIds();
    const n = list('cards').filter((c) => c.status === 'pending' && team.has(c.employee_id)).length;
    const omar = person(LEAVER);
    const days = omar && Number.isFinite(Number(omar.days_left)) ? Number(omar.days_left) : null;
    let s = n ? `عندك ${ar(n)} ${n === 1 ? 'بطاقة' : 'بطاقات'} من فريقك بستنّوا اعتمادك` : 'ما في ولا بطاقة بتستنّاك من فريقك، كل إشي معتمد';
    if (days != null) s += ` — وعمر باقيله ${R.daysPhrase ? R.daysPhrase(days) : ar(days) + ' أيام'} قبل آخر يوم.`;
    else s += '.';
    els.lede.textContent = s;
  }

  /* ---------------- Queue ---------------- */
  function editForm(c) {
    return `<form class="kcard mgr-edit${c.critical ? ' is-critical' : ''}" data-edit-id="${esc(c.id)}" aria-label="تعديل البطاقة">
      <label class="field"><span class="field-label">العنوان</span><input class="input" name="title" maxlength="120" value="${esc(c.title || '')}" required></label>
      <label class="field"><span class="field-label">المعلومة</span><textarea class="textarea" name="fact" required>${esc(c.fact || '')}</textarea></label>
      <div class="cluster">
        <button type="submit" class="btn sm primary">احفظ التعديل</button>
        <button type="button" class="btn sm ghost" data-edit-cancel>إلغاء</button>
      </div>
    </form>`;
  }

  function renderQueue() {
    const cards = pendingCards();
    els.count.textContent = ar(cards.length);
    const omarPending = list('cards').filter((c) => c.status === 'pending' && c.employee_id === LEAVER).length;
    els.bulk.hidden = omarPending === 0;
    els.bulkNote.textContent = omarPending ? `${ar(omarPending)} ${omarPending === 1 ? 'بطاقة' : 'بطاقات'} من جلسات عمر` : '';
    if (!cards.length) {
      els.queue.innerHTML = R.ui.empty(
        scope === 'team' ? 'خلصت المراجعة، يعطيك العافية' : 'ما في بطاقات بانتظار المراجعة بالشركة',
        'أول ما تخلص جلسة تسليم جديدة، بطاقاتها بتنزل هون عشان تعتمدها.',
        scope === 'team' ? '<button type="button" class="btn sm" data-scope-all>شوف كل الشركة</button>' : '<a class="btn sm" href="/meetings">روح عالجلسات</a>'
      );
      return;
    }
    const people = list('people');
    els.queue.innerHTML = cards.map((c) => (editing === c.id
      ? editForm(c)
      : R.ui.kcard(c, { people, actions: ['listen', 'approve', 'reject', 'edit'] }))).join('');
  }

  function animateOut(id) {
    const el = els.queue.querySelector(`[data-card-id="${CSS.escape(id)}"]`);
    if (el && !R.reduceMotion) el.classList.add('mgr-leaving');
  }

  function showUndo(msg, fn) {
    clearTimeout(pendingUndo.timer);
    pendingUndo.fn = fn;
    els.undoMsg.textContent = msg;
    els.undo.hidden = false;
    pendingUndo.timer = setTimeout(hideUndo, 6000);
  }
  function hideUndo() { clearTimeout(pendingUndo.timer); pendingUndo.fn = null; els.undo.hidden = true; }

  async function setStatus(id, status) {
    const card = list('cards').find((c) => c.id === id);
    if (!card) return;
    const prev = card.status;
    animateOut(id);
    card.status = status;
    setTimeout(renderAll, R.reduceMotion ? 0 : 200);
    const res = await R.api.patch(`/api/cards/${encodeURIComponent(id)}`, { status });
    if (!res) {
      card.status = prev; renderAll();
      R.toast('ما زبط الحفظ، جرّب كمان مرة', { kind: 'warn' });
      return;
    }
    Object.assign(card, res);
    const verb = status === 'approved' ? 'اعتمدت' : 'رفضت';
    showUndo(`${verb} «${card.title || 'البطاقة'}»`, async () => {
      card.status = prev; renderAll();
      const back = await R.api.patch(`/api/cards/${encodeURIComponent(id)}`, { status: prev });
      if (back) Object.assign(card, back);
      R.toast(back ? 'رجّعناها للمراجعة' : 'ما قدرنا نتراجع، جرّب كمان مرة', { kind: back ? 'info' : 'warn' });
      if (!back) { card.status = status; renderAll(); }
    });
  }

  async function saveEdit(form) {
    const id = form.getAttribute('data-edit-id');
    const card = list('cards').find((c) => c.id === id);
    if (!card) return;
    const title = form.title.value.trim();
    const fact = form.fact.value.trim();
    if (!title || !fact) { R.toast('العنوان والمعلومة لازم يكونوا معبّايين', { kind: 'warn' }); return; }
    const btn = form.querySelector('[type=submit]');
    if (btn) btn.disabled = true;
    const res = await R.api.patch(`/api/cards/${encodeURIComponent(id)}`, { title, fact });
    if (!res) { if (btn) btn.disabled = false; R.toast('ما زبط الحفظ، جرّب كمان مرة', { kind: 'warn' }); return; }
    Object.assign(card, res);
    editing = null;
    renderQueue();
    R.toast('انحفظ التعديل', { kind: 'ok' });
  }

  async function approveAllOmar() {
    els.bulkBtn.disabled = true;
    const res = await R.api.post('/api/cards/approve_all', { employee_id: LEAVER });
    els.bulkBtn.disabled = false;
    if (!res) { R.toast('ما زبط الاعتماد، جرّب كمان مرة', { kind: 'warn' }); return; }
    list('cards').forEach((c) => { if (c.employee_id === LEAVER && c.status === 'pending') c.status = 'approved'; });
    R.toast(`اعتمدت ${ar(res.approved || 0)} من بطاقات عمر`, { kind: 'ok' });
    await refresh();
  }

  /* ---------------- Handover pair ---------------- */
  function omarRow() {
    return (metrics && Array.isArray(metrics.by_employee) && metrics.by_employee.find((r) => r && r.id === LEAVER)) || null;
  }
  function nextSessionFor(eid) {
    const row = eid === LEAVER ? omarRow() : null;
    if (row && row.next_session) return row.next_session;
    const today = (state && state.today) || '';
    return list('sessions').filter((s) => s.employee_id === eid && s.status === 'scheduled' && (!today || String(s.date) >= today))
      .sort((a, b) => String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || ''))))[0] || null;
  }

  function renderPair() {
    const omar = person(LEAVER);
    const rana = person(SUCCESSOR);
    if (!omar) { els.pair.innerHTML = R.ui.empty('ما في تسليم شغّال', 'لما حدا من فريقك يقرر يطلع، التسليم بيبيّن هون.'); els.pairRisk.innerHTML = ''; return; }
    const row = omarRow();
    const topics = list('topics').filter((t) => t.employee_id === LEAVER);
    const coverage = row ? Number(row.coverage) || 0 : (topics.length ? topics.filter((t) => t.covered || t.status === 'covered').length / topics.length : 0);
    const days = row ? row.days_left : omar.days_left;
    const next = nextSessionFor(LEAVER);
    els.pairRisk.innerHTML = row && row.risk ? R.ui.riskChip(row.risk) : '';
    els.pair.innerHTML = `
      <div class="mgr-pair-names">
        <a class="who" href="/employee">${R.ui.avatar(omar, 36)}<span>${esc(omar.name)}</span></a>
        ${R.icons.arrow}
        ${rana ? `<a class="who" href="/onboarding">${R.ui.avatar(rana, 36)}<span>${esc(rana.name)}</span></a>` : '<span class="chip warn">ما في بديل لسّا</span>'}
      </div>
      <p class="small muted">${esc(omar.role || '')}${omar.dept ? ' · ' + esc(omar.dept) : ''}</p>
      <div class="stack tight">
        <div class="meter-row">${R.ui.meter(coverage, { kind: 'auto' })}<span class="meter-val">${R.pct(coverage)}</span></div>
        <p class="small muted">${row ? `غطّينا ${ar(row.topics_covered || 0)} من ${ar(row.topics_total || 0)} مواضيع` : 'تغطية المواضيع'}${row && row.risk_reason ? ' — ' + esc(row.risk_reason) : ''}</p>
      </div>
      <dl class="mgr-facts">
        <div><dt>باقيله</dt><dd>${days != null ? esc(R.daysPhrase ? R.daysPhrase(Number(days)) : ar(days) + ' أيام') : '—'}</dd></div>
        <div><dt>الجلسة الجاية</dt><dd>${next ? `<a href="/meetings/${encodeURIComponent(next.id)}">${esc(R.relDay(next.date))}${next.time ? ' · ' + ar(next.time) : ''}</a>` : 'مش محددة'}</dd></div>
      </dl>`;
  }

  /* ---------------- Questions ---------------- */
  function renderQuestions() {
    const qs = list('questions').filter((q) => q.asked_by === SUCCESSOR && q.status === 'open');
    const next = nextSessionFor(LEAVER);
    if (!qs.length) {
      els.qs.innerHTML = `<li>${R.ui.empty('رنا ما عندها أسئلة معلّقة', 'أي سؤال بتسأله وما إله جواب بالبطاقات رح يطلعلك هون.')}</li>`;
      return;
    }
    els.qs.innerHTML = qs.map((q) => `<li data-q-id="${esc(q.id)}">
      <p class="mgr-q-text">${esc(q.text)}</p>
      <div class="mgr-q-row">
        <span class="xsmall muted">لـ${esc(pname(q.employee_id))}${q.created ? ' · ' + esc(R.relDay(q.created)) : ''}</span>
        <span class="spacer"></span>
        ${next ? `<button type="button" class="btn sm" data-schedule="${esc(q.id)}">${R.icons.calendar}<span>حطّها بالجلسة الجاية</span></button>`
          : '<a class="btn sm" href="/meetings">احجز جلسة</a>'}
      </div>
    </li>`).join('');
  }

  async function scheduleQuestion(qid, btn) {
    const next = nextSessionFor(LEAVER);
    if (!next) { R.toast('ما في جلسة جاية لعمر، احجز وحدة من الجلسات', { kind: 'info' }); return; }
    if (btn) btn.disabled = true;
    const res = await R.api.patch(`/api/questions/${encodeURIComponent(qid)}`, { status: 'scheduled', session_id: next.id });
    if (!res) { if (btn) btn.disabled = false; R.toast('ما زبط، جرّب كمان مرة', { kind: 'warn' }); return; }
    const q = list('questions').find((x) => x.id === qid);
    if (q) Object.assign(q, res, { status: 'scheduled', session_id: next.id });
    renderQuestions();
    R.toast(`انحطّ السؤال بجلسة ${R.relDay(next.date)}، راوي رح يسأله أول إشي`, { kind: 'ok' });
  }

  /* ---------------- Sessions ---------------- */
  function renderSessions() {
    const team = teamIds();
    const today = (state && state.today) || '';
    let ss = list('sessions').filter((s) => (s.status === 'scheduled' || s.status === 'live') && (!today || String(s.date) >= today));
    const mine = ss.filter((s) => team.has(s.employee_id));
    if (scope === 'team' && mine.length) ss = mine;
    ss.sort((a, b) => String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || ''))));
    ss = ss.slice(0, 5);
    if (!ss.length) {
      els.sess.innerHTML = `<li>${R.ui.empty('ما في جلسات محجوزة', 'احجز جلسة تسليم من صفحة الجلسات.', '<a class="btn sm" href="/meetings">الجلسات</a>')}</li>`;
      return;
    }
    els.sess.innerHTML = ss.map((s) => `<li class="mgr-sess"><a href="/meetings/${encodeURIComponent(s.id)}">
      <span class="mgr-sess-date">${esc(R.relDay(s.date))}${s.time ? `<span class="xsmall muted">${ar(s.time)}</span>` : ''}</span>
      <span class="mgr-sess-text"><span class="strong">${esc(s.title || 'جلسة تسليم')}</span><span class="xsmall muted">مع ${esc(pname(s.employee_id))} · ${esc(R.date(s.date))}</span></span>
      <span class="spacer"></span>${R.ui.statusChip(s.status)}
    </a></li>`).join('');
  }

  function renderAll() {
    renderHead();
    renderQueue();
    renderPair();
    renderQuestions();
    renderSessions();
  }

  function renderOffline() {
    els.lede.textContent = 'ما قدرنا نوصل للسيرفر هلق. جرّب تحدّث الصفحة بعد شوي.';
    els.count.textContent = ar(0);
    const retry = '<button type="button" class="btn sm" data-retry>جرّب كمان مرة</button>';
    els.queue.innerHTML = R.ui.empty('الاتصال مقطوع', 'البطاقات محفوظة، بس ما قدرنا نجيبها هلق.', retry);
    els.pair.innerHTML = R.ui.empty('ما في بيانات هلق');
    els.qs.innerHTML = `<li>${R.ui.empty('ما في بيانات هلق')}</li>`;
    els.sess.innerHTML = `<li>${R.ui.empty('ما في بيانات هلق')}</li>`;
  }

  function renderSkeleton() {
    els.queue.innerHTML = R.ui.skeleton(4, { lines: 3 });
    els.pair.innerHTML = R.ui.skeleton(1, { lines: 4 });
    els.qs.innerHTML = `<li>${R.ui.skeleton(2, { lines: 2 })}</li>`;
    els.sess.innerHTML = `<li>${R.ui.skeleton(3, { lines: 1 })}</li>`;
  }

  async function refresh() {
    const [s, m] = await Promise.all([R.store.load(true), R.api.get('/api/metrics')]);
    state = s && !s.offline ? s : null;
    metrics = m || null;
    if (!state) { renderOffline(); return; }
    renderAll();
  }

  /* ---------------- Events ---------------- */
  function setScope(next) {
    scope = next;
    els.scope.querySelectorAll('[data-scope]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scope === scope)));
    if (state) { renderQueue(); renderSessions(); }
  }

  els.scope.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scope]');
    if (b) setScope(b.dataset.scope);
  });

  R.ui.onCardAction(els.queue, (action, id) => {
    const card = list('cards').find((c) => c.id === id);
    if (!card) return;
    if (action === 'listen') {
      if (card.audio_url) R.audio.play(card.audio_url, { label: `${pname(card.employee_id)} — ${card.title || ''}` });
      else R.toast('هالبطاقة ما إلها تسجيل صوتي', { kind: 'info' });
    } else if (action === 'approve') setStatus(id, 'approved');
    else if (action === 'reject') setStatus(id, 'rejected');
    else if (action === 'edit') {
      editing = id; renderQueue();
      const f = els.queue.querySelector(`[data-edit-id="${CSS.escape(id)}"] [name=title]`);
      if (f) f.focus();
    }
  });

  els.queue.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-edit-id]');
    if (f) { e.preventDefault(); saveEdit(f); }
  });
  els.queue.addEventListener('click', (e) => {
    if (e.target.closest('[data-edit-cancel]')) { editing = null; renderQueue(); }
    else if (e.target.closest('[data-scope-all]')) setScope('all');
    else if (e.target.closest('[data-retry]')) { renderSkeleton(); refresh(); }
  });
  els.bulkBtn.addEventListener('click', approveAllOmar);
  els.qs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-schedule]');
    if (b) scheduleQuestion(b.dataset.schedule, b);
  });
  els.undoBtn.addEventListener('click', () => { const fn = pendingUndo.fn; hideUndo(); if (fn) fn(); });

  renderSkeleton();
  refresh();
})();
