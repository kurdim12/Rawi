/* Rawi — قاعدة المعرفة (knowledge base page) */
(function () {
  'use strict';
  const R = window.Rawi;
  if (!R) return;
  const { $, esc, rich, ar, ui } = R;

  const svg = (p) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
  const LOCAL_ICONS = {
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    spark: svg('<path d="M11 3.5 12.9 9l5.6 1.9-5.6 1.9L11 18.5l-1.9-5.7-5.6-1.9L9.1 9z"/>'),
  };
  const icon = (n) => (R.icons && R.icons[n]) || LOCAL_ICONS[n] || '';

  const S = {
    state: null,
    q: '',
    person: '',
    dept: '',
    status: 'approved',
    critical: false,
  };

  /* ---------- Arabic normalization ---------- */
  function norm(s) {
    return String(s || '')
      .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '')
      .replace(/ـ/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  const people = () => (S.state && S.state.people) || [];
  const cards = () => (S.state && S.state.cards) || [];
  const personOf = (id) => people().find((p) => p && p.id === id) || null;
  const sessionOf = (id) => ((S.state && S.state.sessions) || []).find((s) => s && s.id === id) || null;

  function haystack(c) {
    if (c._hay) return c._hay;
    const p = personOf(c.employee_id) || {};
    c._hay = norm([c.title, c.fact, (c.tags || []).join(' '), p.name, p.full_name, p.dept, p.role].join(' '));
    return c._hay;
  }

  /* ---------- stats ---------- */
  function renderStats() {
    const el = $('#kb-stats');
    if (!el) return;
    const all = cards();
    const approved = all.filter((c) => c.status === 'approved');
    const pending = all.filter((c) => c.status === 'pending');
    const crit = approved.filter((c) => c.critical).length;
    const value = approved.reduce((s, c) => s + (Number(c.value_jod_year) || 0), 0);
    const gaps = ((S.state && S.state.questions) || []).filter((q) => q.status !== 'answered').length;
    const ratio = all.length ? approved.length / all.length : 0;
    el.innerHTML = `
      <div class="stat">
        <span class="stat-label">${icon('book')}بطاقات معتمدة</span>
        <span class="stat-value">${ar(approved.length)}<span class="stat-unit">من ${ar(all.length)}</span></span>
        ${ui.meter ? ui.meter(ratio, { kind: 'auto', label: 'نسبة البطاقات المعتمدة' }) : ''}
      </div>
      <div class="stat">
        <span class="stat-label">${icon('pending') || icon('clock')}بانتظار المراجعة</span>
        <span class="stat-value">${ar(pending.length)}<span class="stat-unit">بطاقة</span></span>
        <span class="stat-foot">المدير بيراجعها قبل ما تنعتمد</span>
      </div>
      <div class="stat">
        <span class="stat-label">${icon('alert')}معرفة حرجة معتمدة</span>
        <span class="stat-value">${ar(crit)}<span class="stat-unit">بطاقة</span></span>
        <span class="stat-foot">قيمتها ${esc(R.jod(value))} بالسنة</span>
      </div>
      <div class="stat">
        <span class="stat-label">${icon('info')}فجوات مفتوحة</span>
        <span class="stat-value">${ar(gaps)}<span class="stat-unit">سؤال</span></span>
        <span class="stat-foot">بتنسأل بالجلسة الجاية</span>
      </div>`;
  }

  /* ---------- filters ---------- */
  function fillFilters() {
    const ps = $('#kb-person');
    const ds = $('#kb-dept');
    const withCards = new Set(cards().map((c) => c.employee_id));
    const plist = people().filter((p) => withCards.has(p.id));
    if (ps) {
      ps.innerHTML = '<option value="">الكل</option>' + plist.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.dept ? ' · ' + esc(p.dept) : ''}</option>`).join('');
      ps.value = S.person;
    }
    if (ds) {
      const depts = Array.from(new Set(plist.map((p) => p.dept).filter(Boolean)));
      ds.innerHTML = '<option value="">كل الأقسام</option>' + depts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
      ds.value = S.dept;
    }
  }

  function filtered() {
    const terms = norm(S.q).split(' ').filter((t) => t.length > 1 || /\d/.test(t));
    return cards().filter((c) => {
      if (!c) return false;
      if (S.status !== 'all' && c.status !== S.status) return false;
      if (S.status === 'all' && c.status === 'rejected') return false;
      if (S.critical && !c.critical) return false;
      if (S.person && c.employee_id !== S.person) return false;
      if (S.dept) { const p = personOf(c.employee_id); if (!p || p.dept !== S.dept) return false; }
      if (terms.length) { const h = haystack(c); if (!terms.every((t) => h.includes(t))) return false; }
      return true;
    }).sort((a, b) => (b.critical ? 1 : 0) - (a.critical ? 1 : 0) || String(b.created || '').localeCompare(String(a.created || '')));
  }

  function renderGrid() {
    const grid = $('#kb-grid');
    const count = $('#kb-count');
    if (!grid) return;
    const list = filtered();
    if (count) count.textContent = `${ar(list.length)} بطاقة`;
    if (!list.length) {
      const any = cards().length;
      const hasQ = S.q.trim();
      grid.innerHTML = any
        ? ui.empty(hasQ ? 'ما لقينا بطاقة بهالكلام' : 'ما في بطاقات بهالفلتر', hasQ ? 'جرّب كلمة ثانية، أو اضغط «اسأل راوي» وهو بيدوّرلك بالمعنى.' : 'غيّر الحالة أو الشخص لتشوف بطاقات أكثر.', '<button class="btn sm" type="button" data-kb-reset>امسح الفلاتر</button>')
        : ui.empty('لسا ما في معرفة موثّقة', 'أول ما تخلص جلسة تسليم، بطاقاتها بتطلع هون.', '<a class="btn sm primary" href="/meetings">شوف الجلسات</a>');
      return;
    }
    grid.innerHTML = list.map((c) => ui.kcard(c, { people: people(), actions: ['listen', 'open'] })).join('');
  }

  /* ---------- gaps ---------- */
  function renderGaps() {
    const el = $('#kb-gaps');
    const cnt = $('#kb-gaps-count');
    if (!el) return;
    const qs = ((S.state && S.state.questions) || []).filter((q) => q && q.status !== 'answered');
    if (cnt) cnt.textContent = `${ar(qs.length)} سؤال`;
    if (!qs.length) { el.innerHTML = ui.empty('ما في فجوات مفتوحة', 'كل الأسئلة إلها جواب لهلق.'); return; }
    const groups = new Map();
    qs.forEach((q) => { const k = q.employee_id || '_'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); });
    el.innerHTML = Array.from(groups.entries()).map(([pid, items]) => {
      const p = personOf(pid);
      const head = p
        ? `<div class="kb-gap-person">${ui.avatar ? ui.avatar(p, 'sm') : ''}<div><b>${esc(p.name)}</b><span class="muted small">${esc([p.role, p.dept].filter(Boolean).join(' · '))}</span></div></div>`
        : '<div class="kb-gap-person"><b>غير محدّد</b></div>';
      const rows = items.map((q) => {
        const asker = personOf(q.asked_by);
        const st = q.status === 'scheduled' ? ui.chip('مجدول بجلسة', 'info') : ui.chip('مفتوح', 'warn');
        return `<li class="kb-gap"><p>${rich(q.text)}</p><div class="kb-gap-meta">${st}${asker ? `<span class="muted small">سأل/ت ${esc(asker.name)}</span>` : ''}${q.created ? `<span class="muted small">${esc(R.relDay ? R.relDay(q.created) : q.created)}</span>` : ''}</div></li>`;
      }).join('');
      return `<div class="kb-gap-group">${head}<ul class="kb-gap-list">${rows}</ul></div>`;
    }).join('');
  }

  /* ---------- detail dialog ---------- */
  function openDetail(id) {
    const c = cards().find((x) => x && String(x.id) === String(id));
    const dlg = $('#kb-detail');
    if (!c || !dlg) return;
    const p = personOf(c.employee_id);
    const s = sessionOf(c.session_id);
    const ans = s && Array.isArray(s.answers) ? s.answers.find((a) => Number(a.index) === Number(c.answer_index)) || s.answers[c.answer_index] : null;
    $('#kb-detail-title').innerHTML = rich(c.title || 'بطاقة');
    const listen = c.audio_url
      ? `<button class="btn voice sm" type="button" data-kb-listen="${esc(c.audio_url)}" data-label="${esc(p ? p.name : 'التسجيل')}">${icon('play')}اسمع ${esc(p ? p.name : 'التسجيل')}</button>` : '';
    const approve = c.status === 'pending'
      ? `<button class="btn primary sm" type="button" data-kb-approve="${esc(c.id)}">${icon('check')}اعتمد البطاقة</button>` : '';
    $('#kb-detail-body').innerHTML = `
      <div class="cluster">${ui.statusChip(c.status)}${c.critical ? ui.chip('حرجة', 'risk') : ''}${ui.conf ? ui.conf(c.confidence) : ''}</div>
      <p class="kb-fact">${rich(c.fact)}</p>
      ${Number(c.value_jod_year) > 0 ? `<div class="kb-value"><span class="muted small">قيمتها تقريباً</span><b>${esc(R.jod(c.value_jod_year))}</b><span class="muted small">بالسنة</span></div>` : ''}
      ${p ? `<div class="kb-who">${ui.avatar ? ui.avatar(p) : ''}<div><b>${esc(p.full_name || p.name)}</b><span class="muted small">${esc([p.role, p.dept].filter(Boolean).join(' · '))}</span></div></div>` : ''}
      ${s ? `<div class="kb-sess"><span class="eyebrow">من جلسة</span><b>${esc(s.title || '')}</b><span class="muted small">${esc(s.date ? R.date(s.date) : '')}${s.time ? ' · ' + esc(ar(s.time)) : ''}</span></div>` : ''}
      ${ans ? `<div class="kb-qa"><p class="kb-qq"><span class="eyebrow">السؤال</span>${rich(ans.question)}</p><blockquote class="kb-tr"><span class="eyebrow">شو حكى</span>${rich(ans.transcript)}</blockquote></div>` : ''}
      ${(c.tags || []).length ? `<div class="tags">${c.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${listen || approve ? `<div class="cluster kb-dact">${listen}${approve}</div>` : ''}`;
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
  }

  async function approveCard(id, btn) {
    if (btn) btn.disabled = true;
    const res = await R.api.patch(`/api/cards/${encodeURIComponent(id)}`, { status: 'approved' });
    if (!res) {
      if (btn) btn.disabled = false;
      R.toast('ما زبط الاعتماد هلق، جرّب كمان شوي', { kind: 'info' });
      return;
    }
    const c = cards().find((x) => String(x.id) === String(id));
    if (c) { Object.assign(c, res.card || res, { status: 'approved' }); delete c._hay; }
    R.toast('انعتمدت البطاقة ✓', { kind: 'ok' });
    renderStats(); renderGrid();
    openDetail(id);
  }

  /* ---------- ask Rawi ---------- */
  async function ask() {
    const input = $('#kb-q');
    const box = $('#kb-answer');
    const q = (input && input.value || '').trim();
    if (!box) return;
    if (!q) { if (input) input.focus(); R.toast('اكتب سؤالك أول', { kind: 'info' }); return; }
    const btn = $('#kb-ask-btn');
    if (btn) btn.disabled = true;
    box.hidden = false;
    box.innerHTML = `<div class="kb-thinking">${icon('spark')}<span>راوي عم يدوّر بكلام الفريق…</span></div>${ui.skeleton(1, { lines: 2 })}`;
    const res = await R.api.post('/api/ask', { question: R.mask ? R.mask(q) : q });
    if (btn) btn.disabled = false;
    if (!res) {
      box.innerHTML = `<div class="kb-ans is-unknown"><b>ما قدرنا نوصل لراوي هلق.</b><p class="muted">جرّب كمان شوي، وبالأثناء دوّر بالبطاقات تحت.</p></div>`;
      return;
    }
    if (res.unknown || !res.answer) {
      box.innerHTML = `<div class="kb-ans is-unknown"><span class="eyebrow">راوي</span><b>هاد لسا مش موثّق عندنا.</b><p class="muted">جرّب تصيغه بكلمات ثانية، أو دوّر بالبطاقات تحت. وإذا ناقص، ضيفه سؤال لصاحب المعرفة بجلسته الجاية.</p></div>`;
      return;
    }
    const card = res.card || cards().find((c) => String(c.id) === String(res.card_id)) || null;
    box.innerHTML = `<div class="kb-ans"><span class="eyebrow">${icon('spark')}راوي بيقول</span><p class="kb-ans-text">${rich(res.answer)}</p></div>
      ${card ? `<div class="kb-src"><span class="muted small">المصدر</span>${ui.kcard(card, { people: people(), actions: ['listen', 'open'], compact: true, highlight: true })}</div>` : ''}`;
    if (card && card.audio_url && R.audio) {
      const p = personOf(card.employee_id);
      R.audio.play(card.audio_url, { label: p ? p.name : 'التسجيل' });
    }
  }

  /* ---------- wiring ---------- */
  function wire() {
    $$('[data-kb-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.kbIcon); });

    const input = $('#kb-q');
    let t = 0;
    if (input) input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { S.q = input.value; renderGrid(); }, 80); });
    const form = $('#kb-ask-form');
    if (form) form.addEventListener('submit', (e) => { e.preventDefault(); ask(); });

    const mic = $('#kb-mic');
    if (mic && input) {
      const V = R.Voice || window.RawiVoice;
      if (V && typeof V.dictate === 'function') {
        try { V.dictate({ button: mic, input, onFinal: (txt) => { if (txt && txt.trim()) { S.q = txt; renderGrid(); ask(); } } }); } catch (_) { mic.hidden = true; }
      } else mic.hidden = true;
    }

    const ps = $('#kb-person'); if (ps) ps.addEventListener('change', () => { S.person = ps.value; renderGrid(); });
    const ds = $('#kb-dept'); if (ds) ds.addEventListener('change', () => { S.dept = ds.value; renderGrid(); });
    const cr = $('#kb-critical'); if (cr) cr.addEventListener('change', () => { S.critical = cr.checked; renderGrid(); });
    const seg = $('#kb-status');
    if (seg) seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-status]');
      if (!b) return;
      S.status = b.dataset.status;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderGrid();
    });

    document.addEventListener('click', (e) => {
      const r = e.target.closest && e.target.closest('[data-kb-reset]');
      if (r) {
        S.q = ''; S.person = ''; S.dept = ''; S.critical = false; S.status = 'all';
        if (input) input.value = '';
        if (ps) ps.value = ''; if (ds) ds.value = ''; if (cr) cr.checked = false;
        if (seg) seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.status === 'all')));
        renderGrid();
      }
    });

    const onAct = (action, id) => { if (action === 'open') openDetail(id); };
    ui.onCardAction($('#kb-grid'), onAct);
    ui.onCardAction($('#kb-answer'), onAct);

    const body = $('#kb-detail-body');
    if (body) body.addEventListener('click', (e) => {
      const l = e.target.closest('[data-kb-listen]');
      if (l && R.audio) { R.audio.play(l.dataset.kbListen, { label: l.dataset.label }); return; }
      const a = e.target.closest('[data-kb-approve]');
      if (a) approveCard(a.dataset.kbApprove, a);
    });
  }

  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  async function load() {
    const grid = $('#kb-grid');
    if (grid) grid.innerHTML = ui.skeleton(6, { lines: 4 });
    const stats = $('#kb-stats');
    if (stats) stats.innerHTML = ui.skeleton(4, { lines: 2 });
    const gaps = $('#kb-gaps');
    if (gaps) gaps.innerHTML = ui.skeleton(2, { lines: 2 });
    let st = null;
    try { st = await R.store.load(); } catch (_) { st = null; }
    S.state = st && typeof st === 'object' ? st : { people: [], cards: [], sessions: [], questions: [] };
    ['people', 'cards', 'sessions', 'questions'].forEach((k) => { if (!Array.isArray(S.state[k])) S.state[k] = []; });
    const params = new URLSearchParams(location.search);
    if (params.get('q')) { S.q = params.get('q'); const i = $('#kb-q'); if (i) i.value = S.q; }
    if (params.get('person')) S.person = params.get('person');
    fillFilters();
    renderStats();
    renderGrid();
    renderGaps();
    if (S.state.offline) R.toast('مش قادرين نوصل للسيرفر، عم نعرض اللي عنا', { kind: 'info' });
    const open = params.get('card') || (location.hash.startsWith('#card-') ? location.hash.slice(6) : '');
    if (open) openDetail(open);
  }

  function start() { wire(); load(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
