/* Rawi — meetings agenda page (/meetings) */
(function () {
  'use strict';
  const R = window.Rawi || {};
  const ui = R.ui || {};
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = R.esc || ((s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const ar = R.ar || ((n) => String(n));
  const IC = R.icons || {};
  const ico = (n) => IC[n] || '';

  let state = null;
  let metrics = null;

  const pad2 = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  function addDays(iso, n) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }
  const todayIso = () => (state && state.today) || isoOf(new Date());
  const relDay = (iso) => (R.relDay ? R.relDay(iso) : iso);
  const fmtDate = (iso) => (R.date ? R.date(iso, { weekday: true }) : iso);
  const chip = (t, k) => (ui.chip ? ui.chip(t, k) : `<span class="chip ${esc(k || '')}">${esc(t)}</span>`);
  const meter = (v, o) => (ui.meter ? ui.meter(v, o) : '');
  const avatar = (p, s) => (ui.avatar ? ui.avatar(p, s) : '');
  const skeleton = (n, o) => (ui.skeleton ? ui.skeleton(n, o) : '<div class="skel"><i></i><i></i></div>');
  const empty = (t, b, a) => (ui.empty ? ui.empty(t, b, a) : `<div class="empty"><b>${esc(t)}</b>${b ? `<p>${esc(b)}</p>` : ''}${a || ''}</div>`);

  const list = (k) => (state && Array.isArray(state[k]) ? state[k] : []);
  const person = (id) => list('people').find((p) => p && p.id === id) || null;
  const topic = (id) => list('topics').find((t) => t && t.id === id) || null;
  const pname = (p) => (p && (p.name || p.full_name)) || 'موظف';
  const sortKey = (s) => `${s.date || ''}T${s.time || '00:00'}`;

  function setBusy(id, html) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    el.removeAttribute('aria-busy');
  }

  function daysChip(n) {
    if (n == null || !Number.isFinite(Number(n))) return '';
    const d = Number(n);
    const kind = d <= 7 ? 'risk' : d <= 14 ? 'warn' : 'muted';
    const txt = d <= 0 ? 'آخر يوم اليوم' : d === 1 ? 'باقي يوم' : d === 2 ? 'باقي يومين' : `باقي ${ar(d)} ${d <= 10 ? 'أيام' : 'يوم'}`;
    return chip(txt, kind);
  }

  /* ---------- progress strip ---------- */
  function leavingRows() {
    const rows = metrics && Array.isArray(metrics.by_employee) ? metrics.by_employee : null;
    if (rows && rows.length) return rows;
    return list('people').filter((p) => p.status === 'leaving').map((p) => {
      const ts = list('topics').filter((t) => t.employee_id === p.id);
      const ss = list('sessions').filter((s) => s.employee_id === p.id);
      return {
        id: p.id, name: p.name, full_name: p.full_name, role: p.role, dept: p.dept, days_left: p.days_left,
        coverage: ts.length ? ts.filter((t) => t.covered).length / ts.length : 0,
        topics_total: ts.length, topics_covered: ts.filter((t) => t.covered).length,
        sessions_done: ss.filter((s) => s.status === 'done').length, sessions_total: ss.length,
      };
    });
  }

  function renderStrip() {
    const rows = leavingRows().slice().sort((a, b) => (a.days_left ?? 999) - (b.days_left ?? 999));
    const sub = document.getElementById('mt-people-sub');
    if (!rows.length) {
      if (sub) sub.textContent = '';
      setBusy('mt-strip', empty('ما في حدا مغادر هلق', 'لما حدا يقدّم استقالته، بيبيّن هون مع تقدّم جلساته.'));
      return;
    }
    if (sub) sub.textContent = `${ar(rows.length)} مغادرين · رتّبناهم حسب الأقرب للطلعة`;
    setBusy('mt-strip', rows.map((r) => {
      const p = person(r.id) || r;
      const cov = Number(r.coverage) || 0;
      const kind = cov >= 0.75 ? 'ok' : cov >= 0.5 ? 'warn' : 'risk';
      const done = Number(r.sessions_done) || 0;
      const total = Number(r.sessions_total) || 0;
      return `<article class="panel tight mt-person">
        <div class="mt-person-top">
          ${avatar(p, 44)}
          <div class="mt-person-id">
            <b>${esc(r.full_name || pname(p))}</b>
            <span class="muted">${esc([r.role, r.dept].filter(Boolean).join(' · '))}</span>
          </div>
        </div>
        <div class="cluster">${daysChip(r.days_left)}${r.risk && ui.riskChip ? ui.riskChip(r.risk) : ''}</div>
        <div class="mt-cov">
          <div class="mt-cov-row"><span>التغطية</span><b class="num">${R.pct ? R.pct(cov) : Math.round(cov * 100) + '%'}</b></div>
          ${meter(cov, { kind, label: `تغطية مواضيع ${pname(p)}` })}
        </div>
        <div class="mt-person-foot">
          <span class="mt-dots" aria-label="${ar(done)} من ${ar(total)} جلسات خلصت">${Array.from({ length: Math.max(total, 1) }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('')}</span>
          <span class="muted num">${ar(done)} من ${ar(total)} جلسات</span>
          <span class="spacer"></span>
          <button class="btn sm ghost" type="button" data-schedule="${esc(r.id)}">${ico('plus')}جدول</button>
        </div>
      </article>`;
    }).join(''));
  }

  /* ---------- session rows ---------- */
  function topicChips(s, max) {
    const ids = Array.isArray(s.topic_ids) ? s.topic_ids : [];
    const names = ids.map((id) => topic(id)).filter(Boolean).map((t) => t.name);
    const shown = names.slice(0, max || 4).map((n) => chip(n, 'muted no-dot')).join('');
    const more = names.length > (max || 4) ? chip(`+${ar(names.length - (max || 4))}`, 'muted no-dot') : '';
    return shown + more;
  }

  function sessionActions(s) {
    const href = `/meetings/${encodeURIComponent(s.id)}`;
    const main = s.status === 'live'
      ? `<a class="btn primary sm" href="${href}">${ico('live')}كمّل الجلسة</a>`
      : `<a class="btn ${s.date === todayIso() ? 'primary' : 'secondary'} sm" href="${href}">${ico('mic')}ابدأ</a>`;
    const live = s.employee_id === 'omar' ? `<a class="btn ghost sm" href="/live">${ico('spark')}جرّب العرض الحي</a>` : '';
    return `<div class="mt-actions">${main}${live}</div>`;
  }

  function agendaRow(s, opts) {
    const p = person(s.employee_id);
    const o = opts || {};
    return `<article class="panel tight mt-row${s.status === 'live' ? ' is-live' : ''}">
      <div class="mt-time">
        <b class="num">${esc(ar(s.time || '—'))}</b>
        ${o.showDay ? `<span class="muted">${esc(relDay(s.date))}</span>` : ''}
      </div>
      <div class="mt-row-main">
        <div class="mt-row-who">
          ${avatar(p, 32)}
          <a class="mt-row-title" href="/meetings/${encodeURIComponent(s.id)}">${esc(s.title || 'جلسة تسليم')}</a>
        </div>
        <div class="cluster mt-row-meta">
          <span class="muted">مع ${esc(pname(p))}${p && p.dept ? ' · ' + esc(p.dept) : ''}</span>
          ${ui.statusChip ? ui.statusChip(s.status) : ''}
          ${p && p.days_left != null ? daysChip(p.days_left) : ''}
        </div>
        <div class="cluster">${topicChips(s)}</div>
      </div>
      ${sessionActions(s)}
    </article>`;
  }

  function renderToday() {
    const t = todayIso();
    const rows = list('sessions').filter((s) => s.status === 'live' || (s.status === 'scheduled' && s.date === t))
      .sort((a, b) => (a.status === 'live' ? -1 : 0) - (b.status === 'live' ? -1 : 0) || sortKey(a).localeCompare(sortKey(b)));
    const sub = document.getElementById('mt-today-sub');
    if (sub) sub.textContent = fmtDate(t);
    setBusy('mt-today', rows.length ? rows.map((s) => agendaRow(s)).join('')
      : empty('ما في جلسات اليوم', 'يوم هادي. استغلّه وجدول جلسة لأقرب حدا طالع.', `<button class="btn sm" type="button" data-schedule="">${ico('plus')}جدولة جلسة</button>`));
  }

  function renderNext() {
    const t = todayIso();
    const rows = list('sessions').filter((s) => s.status === 'scheduled' && s.date && s.date > t).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const overdue = list('sessions').filter((s) => s.status === 'scheduled' && s.date && s.date < t);
    const sub = document.getElementById('mt-next-sub');
    if (sub) sub.textContent = rows.length ? `${ar(rows.length)} جلسات مجدولة` : '';
    if (!rows.length && !overdue.length) {
      setBusy('mt-next', empty('ما في إشي مجدول', 'كل يوم بيمرّ بدون جلسة هو معرفة ممكن تضيع.', `<button class="btn primary sm" type="button" data-schedule="">${ico('plus')}جدولة جلسة</button>`));
      return;
    }
    const groups = new Map();
    if (overdue.length) groups.set('__overdue', overdue);
    rows.forEach((s) => { if (!groups.has(s.date)) groups.set(s.date, []); groups.get(s.date).push(s); });
    let html = '';
    groups.forEach((items, d) => {
      const head = d === '__overdue'
        ? `<h3 class="mt-day-h">${chip('فاتت ولسا ما انعملت', 'warn')}</h3>`
        : `<h3 class="mt-day-h"><span>${esc(relDay(d))}</span><span class="muted">${esc(fmtDate(d))}</span></h3>`;
      html += `<div class="mt-day">${head}<div class="stack tight">${items.map((s) => agendaRow(s, { showDay: d === '__overdue' })).join('')}</div></div>`;
    });
    setBusy('mt-next', html);
  }

  function renderDone() {
    const rows = list('sessions').filter((s) => s.status === 'done').sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    const sub = document.getElementById('mt-done-sub');
    const mins = rows.reduce((a, s) => a + (Number(s.duration_min) || 0), 0);
    if (sub) sub.textContent = rows.length ? `${ar(rows.length)} جلسات · ${R.num ? R.num(mins) : ar(mins)} دقيقة مسجّلة` : '';
    if (!rows.length) {
      setBusy('mt-done', empty('لسا ما خلصت ولا جلسة', 'أول جلسة بتخلص بتطلع هون مع ملخصها والبطاقات اللي طلعت منها.'));
      return;
    }
    const cards = list('cards');
    setBusy('mt-done', rows.map((s) => {
      const p = person(s.employee_id);
      const nAns = Array.isArray(s.answers) ? s.answers.length : 0;
      const nCards = cards.filter((c) => c && c.session_id === s.id).length;
      const summary = s.summary ? (R.rich ? R.rich(s.summary) : esc(s.summary)) : '<span class="muted">ما في ملخص لهالجلسة.</span>';
      return `<article class="panel tight mt-done">
        <div class="mt-row-who">
          ${avatar(p, 32)}
          <div class="mt-person-id">
            <a class="mt-row-title" href="/meetings/${encodeURIComponent(s.id)}">${esc(s.title || 'جلسة تسليم')}</a>
            <span class="muted">${esc(pname(p))} · ${esc(relDay(s.date))}</span>
          </div>
        </div>
        <p class="mt-summary">${summary}</p>
        <dl class="mt-figs">
          <div><dt>أجوبة</dt><dd class="num">${ar(nAns)}</dd></div>
          <div><dt>بطاقات</dt><dd class="num">${ar(nCards)}</dd></div>
          <div><dt>دقيقة</dt><dd class="num">${ar(Number(s.duration_min) || 0)}</dd></div>
        </dl>
        <div class="mt-actions"><a class="btn sm secondary" href="/meetings/${encodeURIComponent(s.id)}">افتح الجلسة${ico('arrow')}</a>${s.employee_id === 'omar' ? `<a class="btn ghost sm" href="/live">جرّب العرض الحي</a>` : ''}</div>
      </article>`;
    }).join(''));
  }

  function renderAll() {
    renderStrip(); renderToday(); renderNext(); renderDone();
    const btn = document.getElementById('mt-open');
    if (btn) btn.disabled = !list('people').some((p) => p.status === 'leaving');
  }

  function renderError() {
    const retry = '<button class="btn sm" type="button" data-retry>جرّب كمان مرة</button>';
    ['mt-strip', 'mt-today', 'mt-next', 'mt-done'].forEach((id, i) =>
      setBusy(id, i === 0 ? empty('ما قدرنا نجيب الجلسات', 'في مشكلة بالاتصال. تأكد إن السيرفر شغّال وجرّب كمان مرة.', retry) : ''));
  }

  function renderSkeletons() {
    const s = (id, n, l) => { const el = document.getElementById(id); if (el) { el.innerHTML = skeleton(n, { lines: l }); el.setAttribute('aria-busy', 'true'); } };
    s('mt-strip', 4, 3); s('mt-today', 1, 2); s('mt-next', 3, 2); s('mt-done', 3, 4);
  }

  async function load(force) {
    if (!state) renderSkeletons();
    const [st, mx] = await Promise.all([
      R.store && R.store.load ? R.store.load(!!force) : (R.api ? R.api.get('/api/state') : null),
      R.api ? R.api.get('/api/metrics') : null,
    ]);
    if (!st || st.offline || !Array.isArray(st.sessions)) {
      if (!state) { renderError(); return; }
    } else state = st;
    metrics = mx || metrics;
    renderAll();
  }

  /* ---------- schedule dialog ---------- */
  const dlg = () => document.getElementById('mt-dialog');

  function fillChecks(pid) {
    const tWrap = document.getElementById('mt-topics');
    const qWrap = document.getElementById('mt-questions');
    const topics = list('topics').filter((t) => t.employee_id === pid && !t.covered);
    const qs = list('questions').filter((q) => q.employee_id === pid && q.status === 'open');
    tWrap.innerHTML = topics.length ? topics.map((t) => `<label class="check"><input type="checkbox" name="topic" value="${esc(t.id)}" checked> <span>${esc(t.name)}</span>${t.critical ? chip('حرج', 'risk') : ''}</label>`).join('')
      : '<p class="muted mt-none">كل مواضيعه انغطّت. ممكن تعمل جلسة مراجعة بدون مواضيع.</p>';
    qWrap.innerHTML = qs.length ? qs.map((q) => {
      const asker = person(q.asked_by);
      return `<label class="check"><input type="checkbox" name="question" value="${esc(q.id)}" checked> <span>${esc(q.text)}${asker ? ` <span class="muted">· ${esc(pname(asker))}</span>` : ''}</span></label>`;
    }).join('') : '<p class="muted mt-none">ما في أسئلة مفتوحة إله.</p>';
  }

  function openDialog(pid) {
    const d = dlg();
    if (!d || !state) return;
    const leaving = list('people').filter((p) => p.status === 'leaving').sort((a, b) => (a.days_left ?? 999) - (b.days_left ?? 999));
    if (!leaving.length) { R.toast && R.toast('ما في حدا مغادر نجدول معه', { kind: 'info' }); return; }
    const sel = document.getElementById('mt-person');
    sel.innerHTML = leaving.map((p) => `<option value="${esc(p.id)}">${esc(pname(p))} · ${esc(p.dept || '')}${p.days_left != null ? ` · باقي ${ar(p.days_left)}` : ''}</option>`).join('');
    sel.value = pid && leaving.some((p) => p.id === pid) ? pid : leaving[0].id;
    const date = document.getElementById('mt-date');
    date.value = addDays(todayIso(), 1);
    date.min = todayIso();
    document.getElementById('mt-time').value = '10:00';
    document.getElementById('mt-title').value = '';
    const err = document.getElementById('mt-error'); err.hidden = true; err.textContent = '';
    fillChecks(sel.value);
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
  }

  async function submit(e) {
    e.preventDefault();
    const err = document.getElementById('mt-error');
    const btn = document.getElementById('mt-submit');
    const pid = document.getElementById('mt-person').value;
    const date = document.getElementById('mt-date').value;
    const time = document.getElementById('mt-time').value;
    const topicIds = Array.from(document.querySelectorAll('#mt-topics input:checked')).map((i) => i.value);
    const qIds = Array.from(document.querySelectorAll('#mt-questions input:checked')).map((i) => i.value);
    let title = document.getElementById('mt-title').value.trim();
    if (!pid || !date || !time) { err.textContent = 'اختار الشخص والتاريخ والساعة.'; err.hidden = false; return; }
    if (!title) {
      const names = topicIds.map((id) => topic(id)).filter(Boolean).map((t) => t.name);
      title = names.length ? names.slice(0, 3).join(' و') : 'جلسة مراجعة';
    }
    btn.disabled = true;
    const res = R.api ? await R.api.post('/api/sessions', { employee_id: pid, title, date, time, topic_ids: topicIds, question_ids: qIds }) : null;
    btn.disabled = false;
    if (!res || res.error || !res.id) {
      err.textContent = (res && res.error) || 'ما زبطت الجدولة. جرّب كمان مرة.';
      err.hidden = false;
      return;
    }
    const d = dlg(); if (d && d.open) d.close();
    const p = person(pid);
    R.toast && R.toast(`تمام، جلسة ${pname(p)} ${relDay(res.date || date)} الساعة ${ar(res.time || time)}`, { kind: 'ok' });
    await load(true);
  }

  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    if (t.closest('#mt-open')) { openDialog(''); return; }
    const sch = t.closest('[data-schedule]');
    if (sch) { openDialog(sch.dataset.schedule); return; }
    if (t.closest('[data-retry]')) { state = null; load(true); }
  });

  function boot() {
    const sel = document.getElementById('mt-person');
    if (sel) sel.addEventListener('change', () => fillChecks(sel.value));
    const form = document.getElementById('mt-form');
    if (form) form.addEventListener('submit', submit);
    load(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
