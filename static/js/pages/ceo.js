/* CEO cockpit — م. نادر. Reads /api/metrics and renders KPIs, risk matrix, coverage, trend and decisions. */
(function () {
  'use strict';
  const R = window.Rawi;
  if (!R) return;
  const $ = (s, r) => (r || document).querySelector(s);
  const ui = R.ui || {};
  const icons = R.icons || {};
  const esc = R.esc;
  const ar = R.ar;
  const N = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const RISK_WORD = { high: 'خطر عالي', medium: 'انتبه', low: 'تمام' };
  const RISK_ORDER = { high: 0, medium: 1, low: 2 };

  const els = {
    greet: $('#ceo-greet'), head: $('#ceo-headline'), sub: $('#ceo-sub'), kpis: $('#ceo-kpis'),
    dec: $('#ceo-decisions'), matrix: $('#ceo-matrix'), mlegend: $('#ceo-matrix-legend'),
    cov: $('#ceo-cov'), depts: $('#ceo-depts'), trend: $('#ceo-trend'), tlegend: $('#ceo-trend-legend'),
  };
  if (!els.kpis) return;

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'سهرانين يا م. نادر';
    if (h < 12) return 'صباح الخير يا م. نادر';
    if (h < 17) return 'يعطيك العافية يا م. نادر';
    return 'مسا الخير يا م. نادر';
  }

  function skeletons() {
    els.kpis.innerHTML = ui.skeleton ? ui.skeleton(5, { lines: 3 }) : '';
    els.dec.innerHTML = ui.skeleton ? ui.skeleton(3, { lines: 2 }) : '';
    els.matrix.innerHTML = ui.skeleton ? ui.skeleton(1, { lines: 6 }) : '';
    els.cov.innerHTML = ui.skeleton ? ui.skeleton(4, { lines: 2 }) : '';
    els.trend.innerHTML = ui.skeleton ? ui.skeleton(1, { lines: 4 }) : '';
  }

  const plural = (n, one, many) => (n === 1 ? one : many);

  function headline(m, people) {
    const dep = N(m.departing) || people.length;
    if (!dep) return { html: 'ما في حدا مغادر هالفترة — معرفة الشركة بأمان.', text: '' };
    const maxDays = people.reduce((a, p) => Math.max(a, N(p.days_left)), 0);
    const cov = R.pct(N(m.coverage_avg));
    const high = people.filter((p) => p.risk === 'high');
    let html = `${ar(dep)} ${plural(dep, 'موظف بيطلع', 'موظفين بيطلعوا')} خلال ${ar(maxDays)} يوم — <em>${esc(cov)}</em> بس من معرفتهم موثّقة`;
    let sub = '';
    if (high.length) {
      const h = high[0];
      sub = `أكبر خطر هلق: ${h.name}${h.risk_reason ? ' — ' + h.risk_reason : ''}.`;
    } else {
      sub = 'ما في خطر عالي هلق، بس في شغل لازم يكمل قبل آخر يوم لكل واحد.';
    }
    return { html, text: sub };
  }

  function statTile(label, icon, valueHTML, extra, foot, cls) {
    return `<div class="stat${cls ? ' ' + cls : ''}">
      <span class="stat-label">${icon || ''}${esc(label)}</span>
      ${valueHTML ? `<span class="stat-value">${valueHTML}</span>` : ''}
      ${extra || ''}
      ${foot ? `<span class="stat-foot">${foot}</span>` : ''}
    </div>`;
  }

  function renderKpis(m, people) {
    const prot = N(m.value_protected_jod), risk = N(m.value_at_risk_jod);
    const tot = prot + risk;
    const pProt = tot ? Math.round((prot / tot) * 100) : 0;
    const noSucc = people.filter((p) => !p.successor).length;
    const cov = N(m.coverage_avg);
    const tiles = [
      statTile('بيطلعوا من الشركة', icons.users, `${ar(N(m.departing))}<span class="stat-unit">${plural(N(m.departing), 'موظف', 'موظفين')}</span>`, '',
        `${N(m.at_risk) ? (ui.riskChip ? ui.riskChip('high') : '') + ar(N(m.at_risk)) + ' بخطر عالي' : 'ما في خطر عالي'}${noSucc ? ' · ' + ar(noSucc) + ' بلا بديل' : ''}`),
      `<div class="stat"><span class="stat-label">${icons.book || ''}المعرفة الموثّقة</span>
        <div class="ceo-ringstat">${ui.ring ? ui.ring(cov, { size: 76, label: 'متوسط التغطية', kind: 'auto' }) : `<span class="stat-value">${R.pct(cov)}</span>`}
          <span class="small muted">من مواضيع المغادرين انوثّقت بصوتهم</span></div>
        <span class="stat-foot">${ar(N(m.cards_approved))} من ${ar(N(m.cards_total))} بطاقة معتمدة</span></div>`,
      statTile('قيمة المعرفة بالسنة', icons.shield, `${R.num(prot)}<span class="stat-unit">د.أ محميّة</span>`,
        `<div class="ceo-split" role="img" aria-label="محمي ${pProt}٪ مقابل ${100 - pProt}٪ بخطر"><span class="ok" style="inline-size:${pProt}%"></span><span class="risk" style="inline-size:${100 - pProt}%"></span></div>
         <div class="ceo-split-legend"><span><i class="ceo-dot ok"></i>محميّة <b>${R.jod(prot)}</b></span><span><i class="ceo-dot risk"></i>بخطر <b>${R.jod(risk)}</b></span></div>`,
        '', 'wide'),
      statTile('فجوات مفتوحة', icons.alert, `${ar(N(m.gaps_open))}<span class="stat-unit">أسئلة</span>`, '',
        `${ar(N(m.cards_pending))} بطاقة بانتظار المراجعة`),
      statTile('دقائق مسجّلة بصوت أصحابها', icons.mic, `${R.num(N(m.minutes_recorded))}<span class="stat-unit">دقيقة</span>`, '',
        `${ar(N(m.sessions_done))} جلسات خلصت · ${ar(N(m.sessions_scheduled))} مجدولة`),
    ];
    els.kpis.innerHTML = tiles.join('');
  }

  /* ---------- Risk matrix ---------- */
  function renderMatrix(people) {
    if (!people.length) {
      els.matrix.innerHTML = ui.empty('ما في حدا على الخريطة', 'لما يكون في موظف مغادر رح يبيّن هون.');
      els.mlegend.innerHTML = '';
      return;
    }
    const W = 640, H = 380, pl = 56, pr = 24, pt = 20, pb = 52;
    const iw = W - pl - pr, ih = H - pt - pb;
    const maxD = Math.max(35, Math.ceil((people.reduce((a, p) => Math.max(a, N(p.days_left)), 0) + 5) / 7) * 7);
    const maxV = Math.max(1, ...people.map((p) => N(p.value_at_risk_jod)));
    // RTL: day 0 sits on the right edge; more time to the left.
    const x = (d) => pl + iw - (Math.max(0, Math.min(maxD, d)) / maxD) * iw;
    const y = (c) => pt + ih - Math.max(0, Math.min(1, c)) * ih;
    const r = (v) => 9 + 24 * Math.sqrt(Math.max(0, v) / maxV);
    let g = '';
    // danger zone: days_left ≤ 14 and coverage < 0.6
    const zx = x(14), zy = y(0.6);
    g += `<rect class="rm-zone" x="${zx}" y="${zy}" width="${x(0) - zx}" height="${y(0) - zy}" rx="6"/>`;
    g += `<text class="rm-zone-label" x="${x(0) - 8}" y="${zy + 18}" text-anchor="end">منطقة الخطر</text>`;
    [0, 0.25, 0.5, 0.75, 1].forEach((c) => {
      g += `<line class="rm-grid" x1="${pl}" x2="${pl + iw}" y1="${y(c)}" y2="${y(c)}"/>`;
      g += `<text class="rm-tick" x="${pl - 8}" y="${y(c) + 4}" text-anchor="end">${esc(R.pct(c))}</text>`;
    });
    for (let d = 0; d <= maxD; d += 7) {
      g += `<line class="rm-grid" x1="${x(d)}" x2="${x(d)}" y1="${pt}" y2="${pt + ih}"/>`;
      g += `<text class="rm-tick" x="${x(d)}" y="${pt + ih + 18}" text-anchor="middle">${ar(d)}</text>`;
    }
    g += `<line class="rm-axis" x1="${pl}" x2="${pl + iw}" y1="${pt + ih}" y2="${pt + ih}"/>`;
    g += `<text class="rm-axis-title" x="${pl + iw / 2}" y="${H - 8}" text-anchor="middle">الأيام الباقية لآخر يوم ←</text>`;
    g += `<text class="rm-axis-title" transform="translate(14 ${pt + ih / 2}) rotate(-90)" text-anchor="middle">نسبة التغطية</text>`;
    const sorted = people.slice().sort((a, b) => N(b.value_at_risk_jod) - N(a.value_at_risk_jod));
    sorted.forEach((p) => {
      const cx = x(N(p.days_left)), cy = y(N(p.coverage)), rr = r(N(p.value_at_risk_jod));
      const risk = RISK_WORD[p.risk] ? p.risk : 'medium';
      const below = cy - rr - 30 < pt;
      const ly = below ? cy + rr + 18 : cy - rr - 22;
      const label = `${p.name}: باقيله ${ar(N(p.days_left))} يوم، التغطية ${R.pct(N(p.coverage))}، بخطر ${R.jod(N(p.value_at_risk_jod))} — ${RISK_WORD[risk]}`;
      g += `<g class="rm-pt" tabindex="0" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>
        <circle class="rm-dot ${risk}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}"/>
        <text class="rm-name" x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle">${esc(p.name)}</text>
        <text class="rm-sub" x="${cx.toFixed(1)}" y="${(ly + 15).toFixed(1)}" text-anchor="middle">${esc(R.pct(N(p.coverage)))} · ${ar(N(p.days_left))} يوم</text>
      </g>`;
    });
    const desc = sorted.map((p) => `${p.name} باقيله ${N(p.days_left)} يوم وتغطيته ${Math.round(N(p.coverage) * 100)}٪`).join('، ');
    els.matrix.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="rm-t rm-d" preserveAspectRatio="xMidYMid meet">
      <title id="rm-t">خريطة الخطر: الأيام الباقية مقابل التغطية</title><desc id="rm-d">${esc(desc)}</desc>${g}</svg>`;
    els.mlegend.innerHTML = `<span class="legend-item"><i class="ceo-dot risk"></i>خطر عالي</span><span class="legend-item"><i class="ceo-dot warn"></i>انتبه</span><span class="legend-item"><i class="ceo-dot ok"></i>تمام</span><span class="legend-item small muted">حجم الدائرة = القيمة اللي بخطر بالسنة</span>`;
  }

  /* ---------- Coverage per person + dept ---------- */
  function renderCoverage(people, depts) {
    if (!people.length) {
      els.cov.innerHTML = ui.empty('ما في موظفين مغادرين', 'كل المعرفة بمكانها هلق.');
      els.depts.innerHTML = '';
      return;
    }
    const st = R.store && R.store.person ? R.store.person.bind(R.store) : null;
    els.cov.innerHTML = people.map((p) => {
      const person = (st && st(p.id)) || p;
      const succ = p.successor_name ? `البديل: ${esc(p.successor_name)}` : `${ui.chip ? ui.chip('بلا بديل', 'risk') : 'بلا بديل'}`;
      return `<div class="ceo-row">
        ${ui.avatar ? ui.avatar(person, 40) : ''}
        <div class="ceo-row-main">
          <div class="ceo-row-top"><span class="strong">${esc(p.name)}</span><span class="small muted">${esc(p.role || '')}</span><span class="ceo-pct">${esc(R.pct(N(p.coverage)))}</span></div>
          ${ui.meter ? ui.meter(N(p.coverage), { kind: 'auto', label: 'تغطية ' + p.name }) : ''}
          <div class="ceo-row-meta">${succ}<span>· ${ar(N(p.topics_covered))} من ${ar(N(p.topics_total))} مواضيع</span><span>· ${esc(R.relDay ? 'آخر يوم ' + R.relDay(p.last_day) : ar(N(p.days_left)) + ' يوم')}</span></div>
        </div>
      </div>`;
    }).join('');
    els.depts.innerHTML = (depts || []).map((d) => `<div class="ceo-dept">
      <div class="ceo-dept-top"><b>${esc(d.dept)}</b><span>${esc(R.pct(N(d.coverage)))}</span></div>
      ${ui.meter ? ui.meter(N(d.coverage), { kind: 'auto', label: 'تغطية ' + d.dept }) : ''}
    </div>`).join('');
  }

  /* ---------- Trend ---------- */
  function renderTrend(tl) {
    const rows = Array.isArray(tl) ? tl.slice(-14) : [];
    if (!rows.length) {
      els.trend.innerHTML = ui.empty('لسّا ما في نشاط', 'أول جلسة رح تبيّن هون.');
      els.tlegend.innerHTML = '';
      return;
    }
    const W = 640, H = 190, pl = 16, pr = 16, pt = 22, pb = 34;
    const iw = W - pl - pr, ih = H - pt - pb;
    const n = rows.length;
    const maxS = Math.max(1, ...rows.map((r) => N(r.sessions)));
    const maxC = Math.max(1, ...rows.map((r) => N(r.cards)));
    const slot = iw / n;
    // RTL: oldest on the right, newest on the left.
    const cx = (i) => pl + iw - slot * (i + 0.5);
    const yS = (v) => pt + ih - (v / maxS) * ih * 0.55;
    const yC = (v) => pt + ih - (v / maxC) * ih;
    let g = `<line class="rm-axis" x1="${pl}" x2="${pl + iw}" y1="${pt + ih}" y2="${pt + ih}"/>`;
    rows.forEach((r, i) => {
      const s = N(r.sessions);
      const bw = Math.min(22, slot * 0.5);
      if (s > 0) g += `<rect class="tr-bar${i === n - 1 ? ' today' : ''}" x="${(cx(i) - bw / 2).toFixed(1)}" y="${yS(s).toFixed(1)}" width="${bw.toFixed(1)}" height="${(pt + ih - yS(s)).toFixed(1)}" rx="3"><title>${esc(R.date ? R.date(r.date) : r.date)}: ${ar(s)} جلسات</title></rect>`;
    });
    const pts = rows.map((r, i) => [cx(i), yC(N(r.cards))]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    g += `<path class="tr-area" d="${line} L${pts[n - 1][0].toFixed(1)} ${pt + ih} L${pts[0][0].toFixed(1)} ${pt + ih} Z"/>`;
    g += `<path class="tr-line" d="${line}"/>`;
    rows.forEach((r, i) => {
      if (N(r.cards) > 0) {
        g += `<circle class="tr-pt" cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="3.5"><title>${esc(R.date ? R.date(r.date) : r.date)}: ${ar(N(r.cards))} بطاقات</title></circle>`;
        g += `<text class="tr-val" x="${pts[i][0].toFixed(1)}" y="${(pts[i][1] - 8).toFixed(1)}" text-anchor="middle">${ar(N(r.cards))}</text>`;
      }
    });
    const lbl = (r) => (R.date ? R.date(r.date) : r.date);
    g += `<text class="tr-tick" x="${cx(0)}" y="${H - 8}" text-anchor="middle">${esc(lbl(rows[0]))}</text>`;
    g += `<text class="tr-tick" x="${cx(n - 1)}" y="${H - 8}" text-anchor="middle">اليوم</text>`;
    const sumS = rows.reduce((a, r) => a + N(r.sessions), 0);
    const sumC = rows.reduce((a, r) => a + N(r.cards), 0);
    const sumA = rows.reduce((a, r) => a + N(r.approved), 0);
    els.trend.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="tr-t tr-d"><title id="tr-t">النشاط آخر ١٤ يوم</title><desc id="tr-d">${esc(`${sumS} جلسات و${sumC} بطاقات معرفة خلال ١٤ يوم`)}</desc>${g}</svg>
      <div class="ceo-trend-foot"><span><b>${ar(sumS)}</b> جلسات</span><span><b>${ar(sumC)}</b> بطاقات انكتبت</span><span><b>${ar(sumA)}</b> انعتمدت</span></div>`;
    els.tlegend.innerHTML = `<span class="legend-item"><i class="ceo-dot ink"></i>جلسات</span><span class="legend-item"><i class="ceo-dot ok"></i>بطاقات</span>`;
  }

  /* ---------- Decisions ---------- */
  function renderDecisions(m, people) {
    const items = [];
    people.slice().sort((a, b) => (RISK_ORDER[a.risk] ?? 1) - (RISK_ORDER[b.risk] ?? 1) || N(a.days_left) - N(b.days_left)).forEach((p) => {
      if (!p.successor) {
        items.push({ kind: 'risk', icon: icons.alert, title: `${p.name} ما إله بديل وباقيله ${ar(N(p.days_left))} يوم`,
          text: `${p.risk_reason || ''} عيّن بديل، وخلّينا نسجّل معه جلسة طارئة قبل ما يطلع.`,
          act: `<button class="btn primary" type="button" data-emergency="${esc(p.id)}">${icons.calendar || ''}جدول جلسة طارئة</button>${p.next_session ? `<a class="btn ghost" href="/meetings/${encodeURIComponent(p.next_session.id)}">الجلسة الجاية ${esc(R.relDay ? R.relDay(p.next_session.date) : '')}</a>` : ''}` });
      } else if (p.risk === 'high') {
        items.push({ kind: 'risk', icon: icons.alert, title: `${p.name}: خطر عالي`, text: p.risk_reason || '',
          act: p.next_session ? `<a class="btn" href="/meetings/${encodeURIComponent(p.next_session.id)}">${icons.calendar || ''}افتح الجلسة الجاية</a>` : `<button class="btn primary" type="button" data-emergency="${esc(p.id)}">${icons.calendar || ''}جدول جلسة طارئة</button>` });
      }
    });
    const pend = N(m.cards_pending);
    if (pend) items.push({ kind: 'warn', icon: icons.check, title: `${ar(pend)} بطاقات معرفة بانتظار الاعتماد`,
      text: 'المدراء المباشرين لازم يراجعوها حتى تنحسب ضمن القيمة المحميّة.', act: `<a class="btn" href="/manager">${icons.shield || ''}روح للمراجعة</a>` });
    const gaps = N(m.gaps_open);
    if (gaps) items.push({ kind: 'info', icon: icons.search, title: `${ar(gaps)} فجوات معرفة لسّا مفتوحة`,
      text: 'أسئلة ما إلها جواب موثّق — بتنحط تلقائياً بالجلسات الجاية.', act: `<a class="btn ghost" href="/meetings">${icons.calendar || ''}شوف الجلسات</a>` });
    if (!items.length) {
      els.dec.innerHTML = ui.empty('ما في قرارات بتستناك', 'كل إشي ماشي حسب الخطة. ارجع بكرا.');
      return;
    }
    els.dec.innerHTML = items.map((it) => `<div class="ceo-dec ${it.kind}">
      <div class="ceo-dec-body"><span class="ceo-dec-title">${esc(it.title)}</span>${it.text ? `<span class="ceo-dec-text">${esc(it.text)}</span>` : ''}
      <div class="ceo-dec-act">${it.act || ''}</div></div></div>`).join('');
  }

  els.dec.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-emergency]');
    if (!btn || btn.disabled) return;
    const id = btn.getAttribute('data-emergency');
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    const res = await R.api.post('/api/sessions', { employee_id: id });
    btn.removeAttribute('aria-busy');
    if (res && res.id) {
      const p = R.store && R.store.person ? R.store.person(id) : null;
      R.toast(`انحطّت جلسة طارئة${p && p.name ? ' مع ' + p.name : ''} ${R.relDay ? R.relDay(res.date) : ''}`, { kind: 'ok' });
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = `/meetings/${encodeURIComponent(res.id)}`;
      a.innerHTML = `${icons.calendar || ''}افتح الجلسة`;
      btn.replaceWith(a);
    } else {
      btn.disabled = false;
      R.toast('ما زبطت الجدولة، جرّب كمان مرة', { kind: 'info' });
    }
  });

  function renderError() {
    els.head.textContent = 'ما قدرنا نجيب الأرقام هلق';
    els.sub.textContent = 'تأكّد من الاتصال وجرّب كمان مرة.';
    els.kpis.innerHTML = ui.empty('الأرقام مش جاهزة', 'صار خلل بالاتصال بالخادم.', '<button class="btn" type="button" id="ceo-retry">جرّب كمان مرة</button>');
    ['dec', 'matrix', 'cov', 'trend'].forEach((k) => { els[k].innerHTML = ''; });
    els.depts.innerHTML = ''; els.mlegend.innerHTML = ''; els.tlegend.innerHTML = '';
    const b = $('#ceo-retry');
    if (b) b.addEventListener('click', load);
  }

  async function load() {
    els.greet.textContent = greeting();
    skeletons();
    const [m] = await Promise.all([R.api.get('/api/metrics'), R.store && R.store.load ? R.store.load().catch(() => null) : null]);
    if (!m || typeof m !== 'object' || m.error) { renderError(); return; }
    const people = (Array.isArray(m.by_employee) ? m.by_employee : []).filter(Boolean);
    const h = headline(m, people);
    els.head.innerHTML = h.html;
    if (h.text) els.sub.textContent = h.text;
    renderKpis(m, people);
    renderDecisions(m, people);
    renderMatrix(people);
    renderCoverage(people.slice().sort((a, b) => N(a.coverage) - N(b.coverage)), m.by_dept);
    renderTrend(m.timeline);
  }

  load();
})();
