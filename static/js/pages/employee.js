/* Rawi — employee page: the departing person's own hub (/employee/<pid>). */
(function () {
  'use strict';
  const R = window.Rawi;
  if (!R) return;
  const { $, esc, ar, ui, icons } = R;
  const LEAVING = ['omar', 'huda', 'yazan', 'majed'];
  const FALLBACK_NAMES = { omar: 'عمر', huda: 'هدى', yazan: 'يزن', majed: 'ماجد' };
  const pid = (document.body.dataset.pid || 'omar').trim();
  const ic = (k) => (icons && icons[k]) || '';
  const set = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
  let busy = false;

  function yearsWord(n) {
    const v = Number(n) || 0;
    return v >= 3 && v <= 10 ? 'سنين' : 'سنة';
  }

  /* ---------- switcher ---------- */
  function renderSwitch(people) {
    const leaving = (people || []).filter((p) => p && p.status === 'leaving');
    const list = leaving.length ? leaving : LEAVING.map((id) => ({ id, name: FALLBACK_NAMES[id] }));
    set('#emp-switch', list.map((p) => `<a href="/employee/${encodeURIComponent(p.id)}" class="emp-sw" role="button" aria-pressed="${p.id === pid}"${p.id === pid ? ' aria-current="page"' : ''}>${ui.avatar(p, 24)}<span>${esc(p.name || FALLBACK_NAMES[p.id] || p.id)}</span></a>`).join(''));
  }

  /* ---------- hero ---------- */
  function renderHero(d, people) {
    const p = d.person || {};
    const m = d.metrics || {};
    const days = Number.isFinite(Number(p.days_left)) ? Number(p.days_left) : Number(m.days_left);
    const succ = p.successor ? (R.store.person(p.successor) || (people || []).find((x) => x.id === p.successor)) : null;
    const succName = m.successor_name || (succ && succ.name) || '';
    const years = Number(p.years) || 0;
    const coverage = Number(m.coverage) || 0;
    let legacy;
    if (succName && p.id !== 'majed') {
      legacy = `خبرة ${esc(ar(years))} ${yearsWord(years)} ما رح تضيع — رح تضل بصوتك عند ${esc(succName)}`;
    } else {
      legacy = `خبرة ${esc(ar(years))} ${yearsWord(years)} ما رح تضيع — رح تضل بصوتك محفوظة للي بيجي بعدك`;
    }
    const daysTxt = Number.isFinite(days) ? (days > 0 ? ar(days) : '٠') : '—';
    const unit = days === 1 ? 'يوم' : (days >= 3 && days <= 10 ? 'أيام' : 'يوم');
    set('#emp-hero', `
      <div class="emp-hero-main">
        <span class="eyebrow">${ic('door')}${esc([p.role, p.dept].filter(Boolean).join(' · '))}</span>
        <h1 class="page-title">أهلاً ${esc(p.name || '')}</h1>
        <p class="lede emp-legacy">${legacy}</p>
        <div class="cluster emp-hero-meta">
          ${p.last_day ? `<span class="chip muted no-dot">${ic('calendar')}آخر يوم: ${esc(R.date(p.last_day, { weekday: true }))}</span>` : ''}
          ${m.risk ? ui.riskChip(m.risk) : ''}
          ${succName ? `<span class="chip info no-dot">${ic('user')}البديل: ${esc(succName)}</span>` : `<span class="chip warn no-dot">${ic('alert')}لسا ما في بديل</span>`}
        </div>
      </div>
      <div class="emp-countdown" aria-label="باقي ${esc(daysTxt)} ${unit}">
        <span class="emp-count-num tnum">${esc(daysTxt)}</span>
        <span class="emp-count-unit">${days > 0 ? `${unit} باقية` : 'آخر يوم'}</span>
      </div>
      <div class="emp-ring">${ui.ring(coverage, { size: 132, kind: 'auto', label: 'معرفتك الموثّقة' })}
        <span class="small muted">${esc(ar(m.topics_covered || 0))} من ${esc(ar(m.topics_total || 0))} مواضيع</span></div>`);
  }

  /* ---------- next session ---------- */
  function renderNext(d) {
    const m = d.metrics || {};
    const sessions = d.sessions || [];
    const live = sessions.find((s) => s && s.status === 'live');
    const next = live || m.next_session || sessions.filter((s) => s && s.status === 'scheduled').sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
    if (!next) {
      set('#emp-next', `${ui.empty('ما في جلسة مجدولة', 'جدول جلسة ونكمّل المواضيع اللي لسا ما حكيناها.', `<button type="button" class="btn primary" data-act="schedule">${ic('plus')}جدول جلسة</button>`)}`);
      return;
    }
    const topics = (d.topics || []).filter((t) => (next.topic_ids || []).includes(t.id));
    set('#emp-next', `
      <div class="emp-next-body">
        <div class="emp-next-date">
          <span class="emp-next-day">${esc(R.relDay(next.date))}</span>
          <span class="small muted">${esc(R.date(next.date, { weekday: true }))}${next.time ? ` · ${esc(ar(next.time))}` : ''}</span>
        </div>
        <h3 class="emp-next-title">${esc(next.title || 'جلسة تسليم')}</h3>
        ${topics.length ? `<div class="tags">${topics.map((t) => `<span class="tag">${esc(t.name)}</span>`).join('')}</div>` : ''}
        <p class="small muted">راوي بيسألك وإنت بتحكي على راحتك. كل جواب بيصير بطاقة بصوتك.</p>
        <div class="cluster">
          <a class="btn primary lg" href="/meetings/${encodeURIComponent(next.id)}">${ic('mic')}ابدأ الجلسة</a>
          <button type="button" class="btn ghost" data-act="schedule">${ic('calendar')}جدول جلسة ثانية</button>
        </div>
      </div>`);
  }

  /* ---------- topics ---------- */
  function topicLi(t) {
    return `<li class="emp-topic${t.covered ? ' is-done' : ''}"><span class="emp-topic-ico">${t.covered ? ic('check') : ''}</span><span class="emp-topic-name">${esc(t.name)}</span>${t.critical ? '<span class="chip risk no-dot emp-crit">حرج</span>' : ''}${t.value_jod_year ? `<span class="xsmall muted nowrap">${esc(R.jod(t.value_jod_year))}/سنة</span>` : ''}</li>`;
  }
  function renderTopics(d) {
    const ts = d.topics || [];
    if (!ts.length) { set('#emp-topics', ui.empty('ما في مواضيع لسا', 'مديرك بيحدد المواضيع، وبتطلع هون.')); set('#emp-t-sub', ''); return; }
    const done = ts.filter((t) => t.covered);
    const left = ts.filter((t) => !t.covered).sort((a, b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0));
    set('#emp-t-sub', `${ar(done.length)} من ${ar(ts.length)} انحكت`);
    set('#emp-topics', `
      <div class="emp-topic-col"><h3 class="emp-col-h">${ic('alert')}لسا باقي <span class="badge-count">${esc(ar(left.length))}</span></h3>
        ${left.length ? `<ul class="emp-topic-list">${left.map(topicLi).join('')}</ul>` : `<p class="small muted">كل المواضيع انحكت. يعطيك العافية!</p>`}</div>
      <div class="emp-topic-col"><h3 class="emp-col-h">${ic('check')}انحكت <span class="badge-count">${esc(ar(done.length))}</span></h3>
        ${done.length ? `<ul class="emp-topic-list">${done.map(topicLi).join('')}</ul>` : `<p class="small muted">لسا ما غطّينا ولا موضوع. أول جلسة بتفرق.</p>`}</div>`);
  }

  /* ---------- questions ---------- */
  function renderQuestions(d, people) {
    const qs = (d.questions || []).filter((q) => q && q.status !== 'answered')
      .sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
    set('#emp-q-count', qs.length ? `<span class="chip warn">${esc(ar(qs.length))} مستنية</span>` : '');
    if (!qs.length) { set('#emp-questions', `<li class="emp-li-empty">${ui.empty('ما في أسئلة مستنية', 'لما حدا يسأل عن إشي بتعرفه، بيطلع هون.')}</li>`); return; }
    set('#emp-questions', qs.map((q) => {
      const who = R.store.person(q.asked_by) || (people || []).find((x) => x.id === q.asked_by) || { id: q.asked_by, name: q.asked_by || '؟' };
      return `<li class="emp-q">${ui.avatar(who, 36)}<span class="emp-q-text"><span class="emp-q-body">${esc(q.text)}</span><span class="person-meta">${esc(who.name || '')} · ${esc(R.relDay(q.created))}</span></span></li>`;
    }).join(''));
  }

  /* ---------- cards ---------- */
  function renderCards(d) {
    const cs = d.cards || [];
    if (!cs.length) { set('#emp-cards', `<div class="panel">${ui.empty('لسا ما في بطاقات', 'بعد أول جلسة، كل معلومة بتحكيها بتصير بطاقة هون.')}</div>`); return; }
    const groups = [['pending', 'بانتظار المراجعة'], ['approved', 'معتمدة'], ['rejected', 'مرفوضة']];
    set('#emp-cards', groups.map(([st, label]) => {
      const list = cs.filter((c) => (c.status || 'pending') === st);
      if (!list.length) return '';
      return `<div class="emp-card-group"><h3 class="emp-col-h">${ui.statusChip(st)}<span class="badge-count">${esc(ar(list.length))}</span></h3>
        <div class="kgrid">${list.map((c) => ui.kcard(c, { actions: ['listen'] })).join('')}</div></div>`;
    }).join('') || `<div class="panel">${ui.empty('لسا ما في بطاقات', '')}</div>`);
  }

  /* ---------- sessions timeline ---------- */
  function renderSessions(d) {
    const ss = (d.sessions || []).slice().sort((a, b) => String(a.starts_at || a.date || '').localeCompare(String(b.starts_at || b.date || '')));
    if (!ss.length) { set('#emp-sessions', `<li class="emp-li-empty">${ui.empty('ما في جلسات لسا', 'أول جلسة بتاخد نص ساعة تقريباً.', `<button type="button" class="btn primary" data-act="schedule">${ic('plus')}جدول جلسة</button>`)}</li>`); return; }
    set('#emp-sessions', ss.map((s) => {
      const nCards = (d.cards || []).filter((c) => c.session_id === s.id).length;
      return `<li class="emp-tl is-${esc(s.status || 'scheduled')}"><span class="emp-tl-dot" aria-hidden="true"></span>
        <a class="emp-tl-body" href="/meetings/${encodeURIComponent(s.id)}">
          <span class="cluster"><b>${esc(s.title || 'جلسة')}</b>${ui.statusChip(s.status)}</span>
          <span class="small muted">${esc(R.date(s.date, { weekday: true }))}${s.time ? ` · ${esc(ar(s.time))}` : ''}${s.duration_min ? ` · ${esc(ar(s.duration_min))} دقيقة` : ''}${nCards ? ` · ${esc(ar(nCards))} بطاقات` : ''}</span>
          ${s.summary ? `<span class="small emp-tl-sum">${esc(s.summary)}</span>` : ''}
        </a></li>`;
    }).join(''));
  }

  /* ---------- actions ---------- */
  async function schedule(btn) {
    if (busy) return;
    busy = true;
    if (btn) btn.disabled = true;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    const res = await R.api.post('/api/sessions', { employee_id: pid, date: iso, time: '10:00' });
    busy = false;
    if (btn) btn.disabled = false;
    if (!res) { R.toast('ما زبطت الجدولة، جرّب كمان مرة', { kind: 'warn' }); return; }
    R.toast(`انجدولت جلسة ${R.relDay(res.date || iso)} الساعة ${ar(res.time || '10:00')}`, { kind: 'ok' });
    if (R.store.clear) R.store.clear();
    load();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-act="schedule"]');
    if (b) { e.preventDefault(); schedule(b); }
  });
  ui.onCardAction($('#emp-cards'), () => {});

  function renderError() {
    const retry = `<button type="button" class="btn" id="emp-retry">${ic('refresh')}جرّب كمان مرة</button>`;
    set('#emp-hero', ui.empty('ما قدرنا نجيب معلوماتك', 'يمكن الشبكة. جرّب كمان مرة بعد شوي.', retry));
    ['#emp-next', '#emp-topics', '#emp-cards'].forEach((s) => set(s, ui.empty('مش متوفر هلق', '')));
    set('#emp-questions', `<li class="emp-li-empty">${ui.empty('مش متوفر هلق', '')}</li>`);
    set('#emp-sessions', `<li class="emp-li-empty">${ui.empty('مش متوفر هلق', '')}</li>`);
    const r = $('#emp-retry'); if (r) r.addEventListener('click', load);
  }

  async function load() {
    let state = null;
    try { state = await R.store.load(); } catch (_) { state = null; }
    const people = (state && state.people) || [];
    renderSwitch(people);
    const d = await R.api.get(`/api/people/${encodeURIComponent(pid)}`);
    if (!d || !d.person) { renderError(); return; }
    try { document.title = `${d.person.name} · راوي`; } catch (_) { /* noop */ }
    renderHero(d, people);
    renderNext(d);
    renderTopics(d);
    renderQuestions(d, people);
    renderCards(d);
    renderSessions(d);
  }

  renderSwitch([]);
  load();
})();
