/* ==========================================================================
   راوي · styleguide page — a living showcase built from window.Rawi
   ========================================================================== */
(function () {
  'use strict';

  const R = window.Rawi;
  if (!R || !R.ui) return;
  const { $, $$, esc, rich, ar, ui, icons } = R;

  /* ------------------------------------------------------------------------
     Fixtures (fictional: شركة النخيل للمقاولات)
     ------------------------------------------------------------------------ */
  const PEOPLE = [
    { id: 'omar', name: 'عمر', full_name: 'عمر الحدّاد', initials: 'ع', role: 'مسؤول مشتريات أول', dept: 'المشتريات', status: 'leaving', days_left: 9 },
    { id: 'rana', name: 'رنا', full_name: 'رنا العمري', initials: 'ر', role: 'مسؤولة مشتريات', dept: 'المشتريات', status: 'incoming' },
    { id: 'samer', name: 'م. سامر', full_name: 'م. سامر القسوس', initials: 'س', role: 'مدير المشتريات', dept: 'المشتريات', status: 'active' },
    { id: 'nader', name: 'م. نادر', full_name: 'م. نادر الخطيب', initials: 'ن', role: 'المدير التنفيذي', dept: 'الإدارة', status: 'active' },
    { id: 'salma', name: 'سلمى', full_name: 'سلمى حدّاد', initials: 'س', role: 'مديرة الموارد البشرية', dept: 'الموارد البشرية', status: 'active' },
    { id: 'huda', name: 'هدى', full_name: 'هدى النابلسي', initials: 'ه', role: 'محاسبة رئيسية', dept: 'المالية', status: 'leaving', days_left: 21 },
    { id: 'dana', name: 'دانة', full_name: 'دانة الزعبي', initials: 'د', role: 'محاسبة', dept: 'المالية', status: 'incoming' },
    { id: 'yazan', name: 'يزن', full_name: 'يزن المومني', initials: 'ي', role: 'مهندس موقع', dept: 'المشاريع', status: 'leaving', days_left: 34 },
    { id: 'tareq', name: 'طارق', full_name: 'طارق العبادي', initials: 'ط', role: 'مهندس موقع', dept: 'المشاريع', status: 'incoming' },
    { id: 'majed', name: 'ماجد', full_name: 'ماجد الشوبكي', initials: 'م', role: 'أمين مستودع', dept: 'اللوجستيات', status: 'leaving', days_left: 5 },
  ];
  const P = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));

  const isoIn = (days) => {
    const t = R.today().split('-').map(Number);
    const d = new Date(t[0], t[1] - 1, t[2] + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  /* A short, soft, speech-like tone so the shared player has something real to play. */
  function demoWav() {
    try {
      const rate = 16000;
      const secs = 3.2;
      const n = Math.floor(rate * secs);
      const buf = new ArrayBuffer(44 + n * 2);
      const v = new DataView(buf);
      const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
      str(36, 'data'); v.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) {
        const t = i / rate;
        const f0 = 150 + 18 * Math.sin(2 * Math.PI * 0.7 * t);
        const syll = Math.max(0, Math.sin(2 * Math.PI * 3.6 * t)) ** 1.6;
        const fade = Math.min(1, t * 4, (secs - t) * 4);
        const s = (Math.sin(2 * Math.PI * f0 * t) * 0.6 + Math.sin(4 * Math.PI * f0 * t) * 0.25 + Math.sin(6 * Math.PI * f0 * t) * 0.1);
        v.setInt16(44 + i * 2, Math.round(s * syll * fade * 0.22 * 32767), true);
      }
      return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    } catch (_) { return null; }
  }
  const AUDIO = demoWav();

  const CARDS = [
    {
      id: 'sg-k1', employee_id: 'omar', session_id: 's-omar-2', answer_index: 0, status: 'approved', critical: true, confidence: 3,
      title: 'الخصم الشفهي مع سما للاتصالات',
      fact: 'مع سما للاتصالات في اتفاق شفهي من سنتين: إذا دفعنا فاتورتهم قبل يوم ١٢ من الشهر بيعطونا خصم ٣٪ كاش. مش مكتوب بالعقد، الاتفاق مع أبو خالد مدير المبيعات عندهم.',
      tags: ['موردين', 'دفعات', 'خصم'], value_jod_year: 14400, audio_url: AUDIO,
    },
    {
      id: 'sg-k2', employee_id: 'omar', session_id: 's-omar-2', answer_index: 1, status: 'pending', critical: false, confidence: 2,
      title: 'وين محفوظة بيانات بوابة الطلبيات',
      fact: R.mask('بيانات الدخول على بوابة سما للطلبيات: كلمة السر هي Nakheel2026. النسخة الورقية محفوظة بخزنة م. سامر، وهو اللي بيعطي الصلاحية لأي حدا جديد.').text,
      tags: ['صلاحيات', 'بوابات'], audio_url: AUDIO,
    },
    {
      id: 'sg-k3', employee_id: 'omar', session_id: 's-omar-1', answer_index: 2, status: 'pending', critical: true, confidence: 3,
      title: 'استلام الحديد الساعة ٦ الصبح',
      fact: 'شاحنات الحديد ممنوعة تفوت المدينة بالنهار، فبننسّق مع أبو محمود حارس الموقع يستلم الساعة ٦ الصبح، وإشعار الاستلام بنوقّعه تاني يوم. لو استنينا الدوام، الشحنة بترجع.',
      tags: ['استلام', 'مواقع'], value_jod_year: 6000,
    },
    {
      id: 'sg-k4', employee_id: 'huda', session_id: 's-huda-1', answer_index: 3, status: 'rejected', critical: false, confidence: 1,
      title: 'إقفال الشهر قبل يوم ٢٥',
      fact: 'بنسكّر الحسابات قبل يوم ٢٥ لأنه البنك العربي بيبعت كشف الحساب متأخر. المدير المالي قال هاد صار قديم، والنظام الجديد بيسحب الكشف لحاله.',
      tags: ['المالية', 'إقفال'],
    },
  ];

  const SESSIONS = [
    { id: 's1', employee_id: 'yazan', title: 'تسليم موقع العبدلي', date: isoIn(0), time: '09:30', status: 'live', duration_min: 18 },
    { id: 's2', employee_id: 'omar', title: 'بوابات الموردين والصلاحيات', date: isoIn(0), time: '14:00', status: 'scheduled' },
    { id: 's3', employee_id: 'majed', title: 'جرد المستودع والمفاتيح', date: isoIn(1), time: '11:00', status: 'scheduled' },
    { id: 's4', employee_id: 'huda', title: 'الإقفال الشهري والبنوك', date: isoIn(2), time: '10:00', status: 'scheduled' },
    { id: 's5', employee_id: 'omar', title: 'استلام الحديد والمواقع', date: isoIn(5), time: '12:30', status: 'scheduled' },
    { id: 's6', employee_id: 'omar', title: 'الموردين والدفعات', date: isoIn(-6), time: '10:00', status: 'done', duration_min: 34 },
    { id: 's7', employee_id: 'huda', title: 'الرواتب والضمان', date: isoIn(-3), time: '13:00', status: 'done', duration_min: 27 },
  ];

  /* ------------------------------------------------------------------------
     Icons: <span data-icon="name"> → inline SVG
     ------------------------------------------------------------------------ */
  function hydrateIcons(root) {
    $$('[data-icon]', root).forEach((el) => {
      const svg = icons[el.dataset.icon];
      if (!svg) return;
      if (el.classList.length) { el.innerHTML = svg; el.removeAttribute('data-icon'); }
      else el.outerHTML = svg;
    });
  }

  /* ------------------------------------------------------------------------
     ٠٢ Swatches
     ------------------------------------------------------------------------ */
  const SWATCHES = [
    { title: 'السطوح', items: [
      ['--bg', 'الورق — خلفية الصفحة'], ['--surface', 'سطح اللوحات والبطاقات'], ['--surface-2', 'سطح ثانوي، فقاعة الشخص'],
      ['--surface-3', 'غاطس — مسارات ومقسّم'], ['--sidebar', 'القائمة الجانبية'],
    ] },
    { title: 'الحبر والخطوط', items: [
      ['--ink', 'النص الأساسي'], ['--ink-2', 'نص ثانوي'], ['--ink-3', 'تفاصيل وتلميحات'],
      ['--line', 'حدود اللوحات'], ['--line-2', 'فواصل داخلية'], ['--line-strong', 'حدود عند المرور'],
    ] },
    { title: 'الصوت — للتسجيل والزر الأساسي بس', items: [
      ['--accent', 'زر الكلام، الزر الأساسي'], ['--accent-hover', 'ضغط ومرور'], ['--accent-text', 'نص بلون الصوت'], ['--accent-soft', 'خلفية الصوت'],
    ] },
    { title: 'الحالات — دايماً مع كلمة ونقطة', items: [
      ['--ok', 'معتمدة، تمام', '--ok-soft', ['معتمدة', 'ok']],
      ['--warn', 'بانتظار، انتبه', '--warn-soft', ['بانتظار المراجعة', 'warn']],
      ['--risk', 'خطر عالي', '--risk-soft', ['خطر عالي', 'risk']],
      ['--info', 'مجدولة، معلومة', '--info-soft', ['مجدولة', 'info']],
      ['--hl', 'ناقص بالرسمي', '--hl-line', ['ناقص بالرسمي', 'hl']],
    ] },
  ];
  function renderSwatches() {
    const box = $('#sg-swatches');
    if (!box) return;
    box.innerHTML = SWATCHES.map((g) => `
      <div class="sg-swatch-group">
        <h3 class="sg-group-title">${esc(g.title)}</h3>
        <div class="sg-swatch-grid">
          ${g.items.map(([tok, role, soft, sample]) => `
            <div class="sg-swatch${soft ? ' is-pair' : ''}">
              <span class="sg-swatch-color" style="background:var(${tok})">${soft ? `<span class="sg-swatch-soft" style="background:var(${soft})"></span>` : ''}</span>
              <span class="sg-swatch-meta">
                <code dir="ltr">${tok}</code>
                <span class="sg-hex" data-token="${tok}" dir="ltr"></span>
                <span class="sg-role">${esc(role)}</span>
                ${sample ? ui.chip(sample[0], sample[1]) : ''}
              </span>
            </div>`).join('')}
        </div>
      </div>`).join('');
    fillHex();
  }
  function fillHex() {
    const cs = getComputedStyle(document.documentElement);
    $$('.sg-hex[data-token]').forEach((el) => { el.textContent = cs.getPropertyValue(el.dataset.token).trim().toUpperCase(); });
  }

  /* ------------------------------------------------------------------------
     ٠٣ Theme panes (same composition, scoped data-theme)
     ------------------------------------------------------------------------ */
  function renderThemes() {
    [['#sg-theme-light', 'فاتح'], ['#sg-theme-dark', 'غامق']].forEach(([sel, name]) => {
      const el = $(sel);
      if (!el) return;
      el.innerHTML = `
        <div class="sg-theme-bar"><span class="chip ink no-dot">${name}</span><span class="spacer"></span>${ui.statusChip('live')}</div>
        <div class="sg-theme-body">
          <div class="stack tight">
            <span class="eyebrow">الموظف الجديد</span>
            <p class="sg-theme-title">رنا، هاد اللي بيعرفه عمر عن الدفعات</p>
          </div>
          ${ui.kcard(CARDS[0], { people: P, actions: ['listen', 'approve'] })}
          <div class="sg-theme-foot">
            <span class="ptt sm" aria-hidden="true">${icons.mic}</span>
            <div class="stack tight sg-theme-meter">
              <div class="meter-row"><span class="small muted">تغطية عمر</span><span class="spacer"></span><span class="meter-val">${R.pct(0.62)}</span></div>
              ${ui.meter(0.62, { kind: 'auto', label: 'تغطية عمر' })}
            </div>
          </div>
          <div class="cluster">${ui.riskChip('high')}${ui.riskChip('medium')}${ui.riskChip('low')}${ui.chip('ناقص بالرسمي', 'hl')}</div>
        </div>`;
    });
  }

  /* ------------------------------------------------------------------------
     ٠٤ Type helpers table
     ------------------------------------------------------------------------ */
  function renderHelpers() {
    const hero = $('#sg-num-hero');
    if (hero) hero.textContent = R.jod(48600);
    const rows = [
      ['Rawi.num(48600)', esc(R.num(48600))],
      ['Rawi.jod(48600)', esc(R.jod(48600))],
      ['Rawi.pct(0.52)', esc(R.pct(0.52))],
      ['Rawi.date(today, {weekday: true})', esc(R.date(R.today(), { weekday: true }))],
      ['Rawi.relDay(+1)', esc(R.relDay(isoIn(1)))],
      ['Rawi.relDay(-6)', esc(R.relDay(isoIn(-6)))],
      ['Rawi.relDay(+3)', esc(R.relDay(isoIn(3)))],
      ['Rawi.duration(185)', esc(R.duration(185))],
      ['Rawi.mask("كلمة السر هي Nakheel2026")', rich(R.mask('كلمة السر هي Nakheel2026').text)],
    ];
    const tb = $('#sg-helpers');
    if (tb) tb.innerHTML = rows.map(([k, v]) => `<li><span class="sg-helper-out">${v}</span><code dir="ltr">${esc(k)}</code></li>`).join('');
  }

  /* ------------------------------------------------------------------------
     ٠٧ Chips & people
     ------------------------------------------------------------------------ */
  function renderChips() {
    const set = (sel, html) => { const el = $(sel); if (el) el.innerHTML = html; };
    set('#sg-chip-kinds', [
      ui.chip('عادي'), ui.chip('تمام', 'ok'), ui.chip('انتبه', 'warn'), ui.chip('خطر', 'risk'),
      ui.chip('معلومة', 'info'), ui.chip('هادي', 'muted'), ui.chip('بالصوت', 'accent'), ui.chip('ناقص بالرسمي', 'hl'),
    ].join(''));
    set('#sg-chip-status', ['approved', 'pending', 'rejected', 'scheduled', 'live', 'done', 'open', 'answered'].map(ui.statusChip).join(''));
    set('#sg-chip-risk', ['high', 'medium', 'low'].map(ui.riskChip).join(''));
    set('#sg-chip-misc', [
      rich('[حُذفت]'), ui.conf(1), ui.conf(2), ui.conf(3),
      `<span class="crit">${icons.alert}حرجة</span>`,
      '<span class="tags"><span class="tag">موردين</span><span class="tag">دفعات</span><span class="tag">خصم</span></span>',
    ].join(''));
    set('#sg-redacted', rich(R.mask('بيانات الدخول: اسم المستخدم nakheel.proc وكلمة السر هي Nakheel2026، والنسخة الورقية بخزنة م. سامر.').text));
    set('#sg-avatars', PEOPLE.map((p) => `<span class="sg-avatar">${ui.avatar(p, 48)}<span>${esc(p.name)}</span></span>`).join(''));
    const meta = {
      omar: `${ui.chip(`باقيله ${ar(9)} أيام`, 'warn')}`,
      rana: `${ui.chip('بلّشت من ٣ أيام', 'info')}`,
      samer: `${ui.chip('بيعتمد البطاقات', 'muted')}`,
      majed: `${ui.riskChip('high')}`,
    };
    set('#sg-people', ['omar', 'rana', 'samer', 'majed'].map((id) => {
      const p = P[id];
      return `<li><span class="person">${ui.avatar(p, 40)}<span class="person-text"><span class="person-name">${esc(p.full_name)}</span><span class="person-meta">${esc(p.role)} · ${esc(p.dept)}</span></span></span><span class="spacer"></span>${meta[id]}</li>`;
    }).join(''));
  }

  /* ------------------------------------------------------------------------
     ٠٨ Figures
     ------------------------------------------------------------------------ */
  function renderFigures() {
    const trend = [3, 4, 4, 6, 7, 7, 9, 10, 11, 11, 13, 14, 15, 15].map((x) => x * 3240);
    const stats = $('#sg-stats');
    if (stats) {
      stats.innerHTML = `
        <div class="stat">
          <span class="stat-label">${icons.door}بيطلعوا خلال ${ar(34)} يوم</span>
          <span class="stat-value">${ar(4)}<span class="stat-unit">موظفين</span></span>
          <span class="stat-foot">${ui.riskChip('high')}ماجد بلا بديل</span>
        </div>
        <div class="stat">
          <span class="stat-label">${icons.book}المعرفة الموثّقة</span>
          <span class="stat-value">${R.pct(0.52)}</span>
          ${ui.meter(0.52, { kind: 'auto', label: 'المعرفة الموثّقة' })}
          <span class="stat-foot">${ar(15)} من ${ar(24)} بطاقة معتمدة</span>
        </div>
        <div class="stat">
          <span class="stat-label">${icons.shield}قيمة محميّة بالسنة</span>
          <span class="stat-value">${R.num(48600)}<span class="stat-unit">د.أ</span></span>
          ${ui.sparkline(trend, { w: 220, h: 36, label: 'القيمة المحمية آخر ١٤ يوم', kind: 'ok' })}
          <span class="stat-foot"><span class="stat-delta up">+${R.num(9720)}</span> هالأسبوع</span>
        </div>
        <div class="stat">
          <span class="stat-label">${icons.alert}فجوات مفتوحة</span>
          <span class="stat-value">${ar(7)}<span class="stat-unit">أسئلة</span></span>
          <span class="stat-foot">رنا سألت ${ar(3)} منهم · ${R.relDay(isoIn(1))} بتنحط بجلسة</span>
        </div>`;
    }
    const rings = $('#sg-rings');
    if (rings) {
      rings.innerHTML = [['omar', 0.62], ['huda', 0.4], ['yazan', 0.78], ['majed', 0.18]].map(([id, v]) =>
        `<div class="sg-ring">${ui.ring(v, { size: 96, kind: 'auto', label: `${P[id].name} · باقي ${P[id].days_left > 10 ? ar(P[id].days_left) + ' يوم' : ar(P[id].days_left) + ' أيام'}` })}</div>`).join('');
    }
    const meters = $('#sg-meters');
    if (meters) {
      const row = (label, v, kind) => `<div><div class="meter-row"><span class="small">${esc(label)}</span><span class="spacer"></span><span class="meter-val">${R.pct(v)}</span></div>${ui.meter(v, { kind, label })}</div>`;
      meters.innerHTML = [
        row('متوسط التغطية', 0.52, 'ink'),
        row('المشتريات', 0.71, 'warn'),
        row('اللوجستيات', 0.18, 'risk'),
        row('المشاريع', 0.82, 'ok'),
        `<div class="sg-sparks">
          <div><span class="small muted">جلسات · ١٤ يوم</span>${ui.sparkline([0, 1, 0, 2, 1, 1, 3, 0, 2, 1, 2, 3, 1, 2], { w: 160, h: 36 })}</div>
          <div><span class="small muted">بطاقات معتمدة</span>${ui.sparkline([1, 2, 2, 3, 5, 5, 6, 8, 9, 9, 11, 12, 14, 15], { w: 160, h: 36, kind: 'ok' })}</div>
        </div>`,
      ].join('');
    }
  }

  /* ------------------------------------------------------------------------
     ٠٩ Knowledge cards
     ------------------------------------------------------------------------ */
  function renderCards() {
    const box = $('#sg-kcards');
    if (!box) return;
    box.innerHTML = [
      ui.kcard(CARDS[0], { people: P, source: 'session', actions: ['listen', 'approve', 'open'] }),
      ui.kcard(CARDS[1], { people: P, source: 'session', actions: ['listen', 'approve', 'reject', 'edit'] }),
      ui.kcard(CARDS[2], { people: P, actions: ['approve', 'reject', 'open'] }),
      ui.kcard(CARDS[3], { people: P, actions: ['reject'], compact: true }),
    ].join('');
  }
  function wireCards() {
    const box = $('#sg-kcards');
    ui.onCardAction(box, (action, id, e) => {
      const btn = e.target.closest('[data-action]');
      const next = btn && btn.dataset.nextStatus;
      if (action === 'approve') R.toast(next === 'approved' ? 'اعتمدت البطاقة — رنا بتقدر تسمعها هلق' : 'رجعت البطاقة للمراجعة', { kind: 'ok' });
      if (action === 'reject') R.toast(next === 'rejected' ? 'انرفضت البطاقة وما رح توصل لحدا' : 'رجعت البطاقة للمراجعة', { kind: 'info' });
      if (action === 'edit') R.toast('التعديل بيصير بنفس البطاقة بصفحة المدير المباشر', { kind: 'info' });
      if (action === 'open') openSheet(CARDS.find((c) => c.id === id) || CARDS[0]);
    });
    const hl = $('#sg-highlight');
    if (hl) hl.addEventListener('click', () => {
      const card = $('#sg-kcards .kcard');
      if (!card) return;
      card.classList.remove('is-highlight');
      void card.offsetWidth;
      card.classList.add('is-highlight');
      card.scrollIntoView({ behavior: R.reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
      setTimeout(() => card.classList.remove('is-highlight'), 2200);
    });
  }

  /* ------------------------------------------------------------------------
     Sheet (card detail)
     ------------------------------------------------------------------------ */
  function openSheet(card) {
    const sheet = $('#sg-sheet');
    const body = $('#sg-sheet-body');
    if (!sheet || !body || typeof sheet.showModal !== 'function') return;
    const p = P[card.employee_id] || P.omar;
    $('#sg-sheet-title').innerHTML = rich(card.title);
    body.innerHTML = `
      <div class="person">${ui.avatar(p, 44)}<span class="person-text"><span class="person-name">${esc(p.full_name)}</span><span class="person-meta">${esc(p.role)} · ${esc(p.dept)}</span></span><span class="spacer"></span>${ui.statusChip(card.status)}</div>
      <dl class="kv">
        <dt>المصدر</dt><dd>الجلسة ${ar(2)} · الجواب ${ar(Number(card.answer_index) + 1)} · ${esc(R.date(isoIn(-6), { weekday: true }))}</dd>
        <dt>الثقة</dt><dd>${ui.conf(card.confidence)}</dd>
        ${card.value_jod_year ? `<dt>القيمة</dt><dd>${esc(R.jod(card.value_jod_year))} بالسنة</dd>` : ''}
      </dl>
      <div class="stack tight">
        <p class="sg-label">الكلام الأصلي</p>
        <div class="bubble employee"><div class="who">${esc(p.name)} · الجواب ${ar(Number(card.answer_index) + 1)}</div><p>${rich(card.fact)}</p></div>
      </div>
      ${card.audio_url ? `<button class="btn voice" type="button" data-sheet-listen>${icons.play}اسمع ${esc(R.firstName(p))}</button>` : ''}
      <div class="callout">${icons.users}<div><b>سؤال مرتبط من رنا</b><p>شو بنعمل لو المورد بعت فاتورة غلط؟ ${ui.statusChip('open')}</p></div></div>`;
    const l = body.querySelector('[data-sheet-listen]');
    if (l) l.addEventListener('click', () => R.audio.play(card.audio_url, { label: R.firstName(p) }));
    sheet.showModal();
  }

  /* ------------------------------------------------------------------------
     ١٠ Conversation + PTT demo
     ------------------------------------------------------------------------ */
  function bubble(role, whoHTML, bodyHTML) {
    return `<div class="bubble ${role}"><div class="who">${whoHTML}</div><p>${bodyHTML}</p></div>`;
  }
  function renderChat() {
    const box = $('#sg-chat');
    if (!box) return;
    const play = AUDIO ? ` <button class="play" type="button" data-url="${esc(AUDIO)}" data-label="عمر">${icons.play}اسمع</button>` : '';
    box.innerHTML = [
      bubble('rawi', 'راوي', esc('أهلاً عمر. خلّينا نبلّش: شو الإشي اللي لو موظف جديد عمله حسب النظام بالزبط رح يخرب؟')),
      bubble('employee', `عمر · الجواب ${ar(1)}${play}`, rich(CARDS[0].fact)),
      bubble('rawi', 'راوي', esc('يعني قبل يوم ١٢ بنوفّر ٣٪. ومين غيرك بيعرف عن هالاتفاق مع أبو خالد؟')),
      bubble('employee', `عمر · الجواب ${ar(2)}${play}`, rich(CARDS[1].fact)),
      `<div class="bubble rawi"><div class="who">راوي</div><p><span class="typing-dots" role="img" aria-label="راوي عم يفكّر"><i></i><i></i><i></i></span></p></div>`,
    ].join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.play[data-url]');
      if (b) R.audio.play(b.dataset.url, { label: b.dataset.label || 'عمر' });
    });
  }

  function wirePTT() {
    const btn = $('#sg-ptt');
    const wrap = $('#sg-ptt-wrap');
    const live = $('#sg-live');
    const liveText = $('#sg-live-text');
    const label = $('#sg-ptt-text');
    const chat = $('#sg-chat');
    if (!btn || !wrap) return;
    const SAY = 'إذا غبت، الدفعات المستعجلة بتغطّيها لينا من المالية لحد ٢٠٠٠ دينار، والباسورد تبع البوابة Sama2026 بخزنة م. سامر.';
    let on = false;
    let started = 0;
    let tick = null;
    let typer = null;
    let shown = 0;
    const start = () => {
      if (on) return;
      on = true;
      started = Date.now();
      shown = 0;
      wrap.classList.add('is-recording');
      R.audio.stop();
      live.hidden = false;
      liveText.textContent = '';
      label.textContent = 'عم بسمعك… ٠:٠٠';
      tick = setInterval(() => { label.textContent = `عم بسمعك… ${R.duration((Date.now() - started) / 1000)}`; }, 250);
      typer = setInterval(() => {
        shown = Math.min(SAY.length, shown + 3);
        liveText.textContent = SAY.slice(0, shown);
      }, 45);
    };
    const stop = async () => {
      if (!on) return;
      on = false;
      clearInterval(tick); clearInterval(typer);
      wrap.classList.remove('is-recording');
      label.textContent = 'اضغط واحكي';
      const said = SAY.slice(0, Math.max(shown, 24)).trim();
      live.hidden = true;
      const { text, found } = R.mask(said);
      if (found) R.toast('تم حذف كلمة سر قبل الإرسال', { kind: 'lock' });
      const dots = chat.querySelector('.typing-dots');
      if (dots) dots.closest('.bubble').remove();
      const n = chat.querySelectorAll('.bubble.employee').length + 1;
      chat.insertAdjacentHTML('beforeend', bubble('employee', `عمر · الجواب ${ar(n)}`, rich(text)));
      chat.insertAdjacentHTML('beforeend', '<div class="bubble rawi"><div class="who">راوي</div><p></p></div>');
      const p = chat.lastElementChild.querySelector('p');
      await R.sleep(R.reduceMotion ? 0 : 500);
      await R.typeInto(p, 'تمام. يعني لينا بتغطّي لحد ٢٠٠٠ دينار، وأي إشي أكبر بدّه توقيع م. سامر. صح هيك؟');
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      start();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, () => stop()));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      if (!e.repeat) start();
    });
    btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } });
    btn.addEventListener('blur', () => stop());
  }

  /* ------------------------------------------------------------------------
     ١١ Tabs + table / cards view
     ------------------------------------------------------------------------ */
  let view = 'table';
  function sessionsTable(list) {
    if (!list.length) return ui.empty('ما في جلسات هون', 'جدول جلسة من صفحة الجلسات.');
    if (view === 'cards') {
      return `<div class="grid auto">${list.map((s) => {
        const p = P[s.employee_id];
        return `<div class="card flat stack tight"><div class="person">${ui.avatar(p, 36)}<span class="person-text"><span class="person-name">${esc(s.title)}</span><span class="person-meta">${esc(p.name)} · ${esc(p.dept)}</span></span></div>
          <div class="cluster">${ui.statusChip(s.status)}<span class="small muted">${esc(R.relDay(s.date))} · ${esc(ar(s.time))}</span></div></div>`;
      }).join('')}</div>`;
    }
    return `<div class="table-wrap"><table class="table stacked">
      <thead><tr><th scope="col">الموظف</th><th scope="col">الجلسة</th><th scope="col">الموعد</th><th scope="col" class="num">المدة</th><th scope="col">الحالة</th></tr></thead>
      <tbody>${list.map((s) => {
        const p = P[s.employee_id];
        return `<tr>
          <td data-label="الموظف"><span class="person">${ui.avatar(p, 32)}<span class="person-text"><span class="cell-main">${esc(p.name)}</span><span class="cell-sub">${esc(p.dept)}</span></span></span></td>
          <td data-label="الجلسة">${esc(s.title)}</td>
          <td data-label="الموعد"><span class="nowrap">${esc(R.date(s.date, { weekday: true }))}</span><span class="cell-sub">${esc(R.relDay(s.date))} · ${esc(ar(s.time))}</span></td>
          <td data-label="المدة" class="num">${s.duration_min ? `${esc(ar(s.duration_min))} دقيقة` : '—'}</td>
          <td data-label="الحالة">${ui.statusChip(s.status)}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }
  function renderTabs() {
    const t0 = R.today();
    const groups = [
      SESSIONS.filter((s) => s.date === t0),
      SESSIONS.filter((s) => s.status === 'scheduled' && s.date > t0),
      SESSIONS.filter((s) => s.status === 'done'),
    ];
    groups.forEach((g, i) => { const el = $(`#sg-tp-${i + 1}`); if (el) el.innerHTML = sessionsTable(g); });
  }
  function wireTabs() {
    ui.tabs($('#sg-tabs'));
    const seg = $('#sg-seg');
    if (seg) seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      view = b.textContent.trim() === 'بطاقات' ? 'cards' : 'table';
      renderTabs();
    });
  }

  /* ------------------------------------------------------------------------
     ١٢ States
     ------------------------------------------------------------------------ */
  function renderStates() {
    const e = $('#sg-empty');
    if (e) e.innerHTML = ui.empty('لسا ما في بطاقات', 'لما تخلص أول جلسة مع عمر، بيطلعلك هون كل إشي حكاه، مربوط بصوته.', '<button class="btn sm" type="button" data-open-dialog="sg-dialog">جدولة جلسة</button>');
    loadSkeleton();
  }
  let skelTimer = null;
  function loadSkeleton() {
    const box = $('#sg-skeleton');
    if (!box) return;
    clearTimeout(skelTimer);
    box.innerHTML = ui.skeleton(2, { lines: 3 });
    skelTimer = setTimeout(() => {
      box.innerHTML = ui.kcard(CARDS[0], { compact: true, actions: [] }) + ui.kcard(CARDS[2], { compact: true, actions: [] });
      box.firstElementChild.classList.add('fade-in');
    }, 1600);
  }
  function wireStates() {
    const r = $('#sg-reload');
    if (r) r.addEventListener('click', loadSkeleton);
    const MSG = {
      ok: 'اعتمدت كل البطاقات — رنا بتقدر تسأل هلق',
      lock: 'تم حذف كلمة سر قبل الإرسال',
      info: 'سؤالك انضاف لأسئلة الجلسة الجاية مع عمر',
    };
    $$('[data-sg-toast]').forEach((b) => b.addEventListener('click', () => R.toast(MSG[b.dataset.sgToast], { kind: b.dataset.sgToast })));
    const a = $('#sg-audio');
    if (a && AUDIO) { a.dataset.url = AUDIO; a.addEventListener('click', () => R.audio.play(AUDIO, { label: 'عمر' })); }
    const os = $('#sg-open-sheet');
    if (os) os.addEventListener('click', () => openSheet(CARDS[0]));
    const dlg = $('#sg-dialog');
    if (dlg) dlg.addEventListener('close', () => { if (dlg.returnValue === 'ok') R.toast('انجدولت الجلسة — راوي رح يبلّش بأسئلة رنا', { kind: 'ok' }); dlg.returnValue = ''; });
    const ap = $('#sg-approve-toggle');
    if (ap) ap.addEventListener('click', () => {
      const on = ap.getAttribute('aria-pressed') !== 'true';
      ap.setAttribute('aria-pressed', String(on));
      ap.textContent = on ? '✓ معتمدة' : 'اعتماد';
    });
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */
  hydrateIcons(document);
  renderSwatches();
  renderThemes();
  renderHelpers();
  renderChips();
  renderFigures();
  renderCards();
  wireCards();
  renderChat();
  wirePTT();
  renderTabs();
  wireTabs();
  renderStates();
  wireStates();
  hydrateIcons(document);

  document.addEventListener('rawi:theme', () => requestAnimationFrame(fillHex));
})();
