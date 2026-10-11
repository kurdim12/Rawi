/* Rawi — HR page (سلمى): departures pipeline, roles official vs real, exit reports. */
(function () {
  'use strict';
  const R = window.Rawi;
  if (!R) return;
  const { $, esc, ar, pct, ui } = R;
  const I = R.icons || {};

  const STAGES = [
    { key: 'announced', label: 'أُعلن', hint: 'لسا ما صارت ولا جلسة' },
    { key: 'sessions', label: 'جلسات', hint: 'التغطية أقل من ٧٥٪' },
    { key: 'review', label: 'مراجعة', hint: 'بطاقات بتستنى أو تغطية أقل من ٩٠٪' },
    { key: 'handover', label: 'تسليم', hint: 'جاهز يسلّم' },
  ];

  let state = null;
  let metrics = null;

  function stageOf(e) {
    const cov = Number(e.coverage) || 0;
    if (!Number(e.sessions_done)) return 'announced';
    if (cov < 0.75) return 'sessions';
    if (Number(e.pending) > 0 || cov < 0.9) return 'review';
    return 'handover';
  }

  function person(id) {
    return ((state && state.people) || []).find((p) => p && p.id === id) || null;
  }

  function daysLabel(n) {
    if (n === null || n === undefined) return '';
    const v = Number(n);
    if (v <= 0) return 'آخر يوم اليوم';
    if (v === 1) return 'باقي يوم واحد';
    if (v === 2) return 'باقي يومين';
    if (v <= 10) return `باقي ${ar(v)} أيام`;
    return `باقي ${ar(v)} يوم`;
  }

  /* ---------------- alert (majed) ---------------- */
  function renderAlert() {
    const slot = $('#hr-alert');
    if (!slot) return;
    const m = ((metrics && metrics.by_employee) || []).find((e) => e.id === 'majed');
    if (!m || (Number(m.sessions_done) > 0 && !(m.risk === 'high' && !m.successor))) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="callout warn hr-alert" role="alert">
      <span class="hr-alert-ico">${I.clock || ''}</span>
      <div class="hr-alert-text">
        <b>${esc(m.full_name || m.name)} ${esc(daysLabel(m.days_left))}، وما إله بديل</b>
        <p>${esc(m.risk_reason || 'معرفته بالمستودع والمواد الخطرة لسا مش موثّقة.')} التغطية ${pct(Number(m.coverage) || 0)}.</p>
      </div>
      <button class="btn primary" type="button" id="hr-emergency">${I.calendar || ''}جدول جلسة طارئة</button>
    </div>`;
    const btn = $('#hr-emergency');
    if (btn) btn.addEventListener('click', scheduleEmergency);
  }

  async function scheduleEmergency(ev) {
    const btn = ev.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('is-busy');
    const s = await R.api.post('/api/sessions', { employee_id: 'majed', title: 'جلسة طارئة: المستودع والمواد الخطرة' });
    btn.classList.remove('is-busy');
    if (s && s.id) {
      btn.innerHTML = `${I.check || ''}انجدولت`;
      R.toast(`انجدولت جلسة طارئة لماجد${s.date ? ' ' + R.relDay(s.date) : ''}${s.time ? ' الساعة ' + ar(s.time) : ''}`);
      R.store.clear();
      load(true);
    } else {
      btn.disabled = false;
      R.toast((R.api.lastError && R.api.lastError.error) || 'ما زبطت الجدولة، جرّب كمان مرة');
    }
  }

  /* ---------------- stats ---------------- */
  function renderStats() {
    const el = $('#hr-stats');
    if (!el) return;
    const m = metrics || {};
    const by = m.by_employee || [];
    const noSucc = by.filter((e) => !e.successor).length;
    const cov = Number(m.coverage_avg) || 0;
    el.innerHTML = [
      stat('مغادرين', ar(m.departing ?? by.length), 'موظف', `${ar(noSucc)} بدون بديل`),
      stat('بخطر عالي', ar(m.at_risk ?? by.filter((e) => e.risk === 'high').length), 'موظف', 'قبل آخر يوم'),
      `<div class="stat"><span class="stat-label">متوسط التغطية</span><span class="stat-value">${pct(cov)}</span>${ui.meter(cov, { kind: 'auto', label: 'متوسط التغطية' })}<span class="stat-foot">من المواضيع الأساسية</span></div>`,
      stat('أسئلة مفتوحة', ar(m.gaps_open ?? 0), 'سؤال', `${ar(m.cards_pending ?? 0)} بطاقة بتستنى مراجعة`),
    ].join('');
  }
  function stat(label, value, unit, foot) {
    return `<div class="stat"><span class="stat-label">${esc(label)}</span><span class="stat-value">${value} <span class="stat-unit">${esc(unit)}</span></span><span class="stat-foot">${esc(foot)}</span></div>`;
  }

  /* ---------------- pipeline ---------------- */
  function renderPipeline() {
    const el = $('#hr-pipeline');
    if (!el) return;
    const by = (metrics && metrics.by_employee) || [];
    if (!by.length) {
      el.innerHTML = ui.empty('ما في حدا مغادر هلق', 'لما ينعلن عن موظف مغادر رح يبيّن هون بأول مرحلة.');
      return;
    }
    const groups = {};
    STAGES.forEach((s) => { groups[s.key] = []; });
    by.forEach((e) => groups[stageOf(e)].push(e));
    el.innerHTML = STAGES.map((s, i) => `<div class="hr-col" data-stage="${s.key}">
      <div class="hr-col-head"><span class="hr-step">${ar(i + 1)}</span><b>${esc(s.label)}</b><span class="badge-count">${ar(groups[s.key].length)}</span></div>
      <p class="hr-col-hint">${esc(s.hint)}</p>
      <div class="hr-col-body">${groups[s.key].length ? groups[s.key].map(personCard).join('') : '<p class="hr-col-empty">ما في حدا بهالمرحلة</p>'}</div>
    </div>`).join('');
  }

  function personCard(e) {
    const p = person(e.id) || e;
    const cov = Number(e.coverage) || 0;
    const succ = e.successor ? `<span class="chip ok">البديل: ${esc(e.successor_name || (person(e.successor) || {}).name || '')}</span>` : '<span class="chip risk">بدون بديل</span>';
    return `<button type="button" class="hr-person" data-pid="${esc(e.id)}" aria-label="تقرير خروج ${esc(e.full_name || e.name)}">
      <span class="hr-person-top">${ui.avatar(p, 40)}<span class="hr-person-id"><b>${esc(e.full_name || e.name)}</b><span class="muted small">${esc(e.role || '')}</span></span></span>
      <span class="hr-person-meta"><span class="hr-days${Number(e.days_left) <= 7 ? ' is-urgent' : ''}">${esc(daysLabel(e.days_left))}</span>${succ}</span>
      <span class="hr-person-cov"><span class="small">التغطية</span><b>${pct(cov)}</b></span>
      ${ui.meter(cov, { kind: 'auto', label: `تغطية ${e.name}` })}
      <span class="hr-person-foot small muted">${ar(e.approved || 0)} معتمدة · ${ar(e.pending || 0)} بتستنى · ${ar(e.gaps || 0)} فجوة</span>
    </button>`;
  }

  /* ---------------- roles ---------------- */
  function renderRoles() {
    const el = $('#hr-roles');
    if (!el) return;
    const roles = ((state && state.roles) || []).slice(0, 4);
    if (!roles.length) {
      el.innerHTML = ui.empty('ما في وظائف موثّقة لسا', 'أول ما تنضاف وظيفة رح تشوف وصفها الرسمي والحقيقي هون.');
      return;
    }
    el.innerHTML = `<div class="tabs" role="tablist" aria-label="الوظائف">${roles.map((r, i) => {
      const h = person(r.holder);
      return `<button class="tab" type="button" role="tab" id="hr-tab-${i}" aria-controls="hr-panel-${i}" aria-selected="${i === 0}">${esc(r.title)}${h ? ` <span class="muted small">· ${esc(h.name)}</span>` : ''}</button>`;
    }).join('')}</div>${roles.map((r, i) => `<div class="tabpanel hr-role" role="tabpanel" id="hr-panel-${i}" aria-labelledby="hr-tab-${i}"${i ? ' hidden' : ''}>${rolePanel(r)}</div>`).join('')}`;
    ui.tabs(el);
  }

  function rolePanel(r) {
    const h = person(r.holder);
    const cards = ((state && state.cards) || []).filter((c) => c.employee_id === r.holder && c.status === 'approved');
    const missing = cards.filter((c) => c.missing_in_official).length;
    const official = (r.official || []).map((t) => `<li>${esc(t)}</li>`).join('') || '<li class="muted">ما في وصف رسمي مكتوب</li>';
    const real = cards.length
      ? cards.map((c) => `<li class="${c.missing_in_official ? 'is-missing' : ''}"><div class="hr-real-top"><b>${esc(c.title)}</b>${c.missing_in_official ? '<span class="chip hl">ناقص بالرسمي</span>' : ''}</div><p>${esc(c.fact)}</p></li>`).join('')
      : `<li class="hr-real-empty">${ui.empty('لسا ما في بطاقات معتمدة', h ? `أول ما تنعتمد بطاقات ${h.name} رح يبيّن الوصف الحقيقي هون.` : 'الوصف الحقيقي بيتعبّى من البطاقات المعتمدة.')}</li>`;
    const kpis = (r.kpis || []).map((k) => `<li>${esc(k)}</li>`).join('') || '<li class="muted">ما في مؤشرات لسا</li>';
    const qs = (r.interview_questions || []).map((q, i) => `<li><p>${esc(q)}</p><button type="button" class="btn sm ghost hr-copy" data-q="${esc(q)}" aria-label="انسخ السؤال ${ar(i + 1)}">${I.book || ''}انسخ</button></li>`).join('') || '<li class="muted">ما في أسئلة لسا</li>';
    return `<div class="hr-role-meta cluster"><span class="chip muted no-dot">${esc(r.dept || '')}</span>${h ? `<span class="chip muted no-dot">الحالي: ${esc(h.full_name || h.name)}</span>` : ''}${missing ? `<span class="chip hl">${ar(missing)} مهام ناقصة بالرسمي</span>` : ''}</div>
      <div class="hr-compare">
        <div class="hr-desc"><h3>الوصف الرسمي</h3><ul class="hr-list">${official}</ul></div>
        <div class="hr-desc hr-desc-real"><h3>الوصف الحقيقي <span class="muted small">من ${ar(cards.length)} بطاقة معتمدة</span></h3><ul class="hr-list hr-real">${real}</ul></div>
      </div>
      <div class="hr-extra">
        <div><h3>مؤشرات الأداء</h3><ul class="hr-list hr-kpis">${kpis}</ul></div>
        <div><h3>أسئلة مقابلة للبديل</h3><ol class="hr-qs">${qs}</ol></div>
      </div>`;
  }

  async function copyText(t) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(t); return true; } } catch (_) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (_) { return false; }
  }

  /* ---------------- exit report ---------------- */
  function openReport(pid) {
    const dlg = $('#hr-report');
    if (!dlg) return;
    const e = ((metrics && metrics.by_employee) || []).find((x) => x.id === pid) || {};
    const p = person(pid) || e;
    const s = state || {};
    const sessions = (s.sessions || []).filter((x) => x.employee_id === pid);
    const cards = (s.cards || []).filter((x) => x.employee_id === pid && x.status === 'approved');
    const gaps = (s.questions || []).filter((x) => x.employee_id === pid && x.status !== 'answered');
    const topicsOpen = (s.topics || []).filter((x) => x.employee_id === pid && !x.covered);
    const cov = Number(e.coverage) || 0;
    $('#hr-report-title').textContent = `تقرير خروج: ${p.full_name || p.name || ''}`;
    const succ = e.successor ? (e.successor_name || (person(e.successor) || {}).name || '') : '';
    $('#hr-report-body').innerHTML = `
      <div class="hr-rep-head">${ui.ring(cov, { size: 88, kind: 'auto', label: 'التغطية' })}
        <div class="stack tight"><b>${esc(p.role || e.role || '')} · ${esc(p.dept || e.dept || '')}</b>
        <span class="muted small">${esc(daysLabel(e.days_left))}${e.last_day ? ' · آخر يوم ' + esc(R.date(e.last_day)) : ''}</span>
        <span class="cluster">${succ ? `<span class="chip ok">البديل: ${esc(succ)}</span>` : '<span class="chip risk">بدون بديل</span>'}${e.risk ? ui.riskChip(e.risk) : ''}</span></div>
      </div>
      ${e.risk_reason ? `<p class="hr-rep-reason">${esc(e.risk_reason)}</p>` : ''}
      <h3>الجلسات <span class="muted small">(${ar(sessions.length)})</span></h3>
      ${sessions.length ? `<ul class="hr-rep-list">${sessions.map((x) => `<li><span>${esc(x.title || 'جلسة')}</span><span class="cluster">${x.date ? `<span class="muted small">${esc(R.date(x.date))}</span>` : ''}${ui.statusChip(x.status)}</span></li>`).join('')}</ul>` : '<p class="muted">لسا ما انجدولت ولا جلسة.</p>'}
      <h3>البطاقات المعتمدة <span class="muted small">(${ar(cards.length)})</span></h3>
      ${cards.length ? `<ul class="hr-rep-list hr-rep-cards">${cards.map((c) => `<li><div><b>${esc(c.title)}</b><p>${esc(c.fact)}</p></div>${c.missing_in_official ? '<span class="chip hl">ناقص بالرسمي</span>' : ''}</li>`).join('')}</ul>` : '<p class="muted">ما في بطاقات معتمدة لسا.</p>'}
      <h3>الفجوات المفتوحة <span class="muted small">(${ar(gaps.length + topicsOpen.length)})</span></h3>
      ${gaps.length || topicsOpen.length ? `<ul class="hr-rep-list">${topicsOpen.map((t) => `<li><span>${esc(t.name)}</span><span class="cluster">${t.critical ? '<span class="chip risk">حرج</span>' : ''}<span class="chip muted no-dot">موضوع مش مغطّى</span></span></li>`).join('')}${gaps.map((q) => `<li><span>${esc(q.text)}</span>${ui.statusChip(q.status)}</li>`).join('')}</ul>` : '<p class="muted">ما في فجوات مفتوحة. تمام.</p>'}
    `;
    try { dlg.showModal(); } catch (_) { dlg.setAttribute('open', ''); }
  }

  /* ---------------- load ---------------- */
  function skeletons() {
    const st = $('#hr-stats'); if (st) st.innerHTML = ui.skeleton(4, { lines: 2 });
    const pl = $('#hr-pipeline'); if (pl) pl.innerHTML = STAGES.map(() => `<div class="hr-col">${ui.skeleton(2, { lines: 3 })}</div>`).join('');
    const rl = $('#hr-roles'); if (rl) rl.innerHTML = ui.skeleton(3, { lines: 3 });
  }

  async function load(force) {
    const [s, m] = await Promise.all([R.store.load(force), R.api.get('/api/metrics')]);
    state = s || { people: [], roles: [], cards: [], sessions: [], questions: [], topics: [] };
    metrics = m || { by_employee: [] };
    if (!m) R.toast('ما قدرنا نجيب الأرقام هلق، عم نعرض اللي عنا');
    renderAlert();
    renderStats();
    renderPipeline();
    renderRoles();
  }

  function wire() {
    const x = $('#hr-report-x'); if (x) x.innerHTML = I.x || '×';
    const pr = $('#hr-print'); if (pr) { pr.insertAdjacentHTML('afterbegin', I.book || ''); pr.addEventListener('click', () => window.print()); }
    const pl = $('#hr-pipeline');
    if (pl) pl.addEventListener('click', (ev) => { const b = ev.target.closest('.hr-person'); if (b) openReport(b.dataset.pid); });
    const rl = $('#hr-roles');
    if (rl) rl.addEventListener('click', async (ev) => {
      const b = ev.target.closest('.hr-copy');
      if (!b) return;
      const ok = await copyText(b.dataset.q || '');
      R.toast(ok ? 'انتسخ السؤال' : 'ما زبط النسخ، حدّده وانسخه بإيدك');
      if (ok) { b.classList.add('is-copied'); setTimeout(() => b.classList.remove('is-copied'), 1500); }
    });
  }

  function init() { wire(); skeletons(); load(false); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
