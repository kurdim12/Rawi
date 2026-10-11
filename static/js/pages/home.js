/* Rawi — home page: hero, live proof strip, how it works, role chooser. */
(function () {
  'use strict';
  const R = window.Rawi;
  if (!R) return;
  const $ = R.$, $$ = R.$$, esc = R.esc;
  const icon = (n) => (R.icons && R.icons[n]) || '';

  /* Icons and step numbers declared in markup via data attributes */
  $$('[data-icon]').forEach((el) => {
    const svg = icon(el.getAttribute('data-icon'));
    if (svg) el.insertAdjacentHTML('afterbegin', svg);
  });
  $$('[data-step]').forEach((el) => { el.textContent = R.ar(el.getAttribute('data-step')); });

  /* ---------------- Live proof strip ---------------- */
  const proof = $('#home-proof');
  function renderProof(m) {
    if (!proof) return;
    if (!m) {
      proof.innerHTML = R.ui.empty('الأرقام مش جاهزة هلق',
        'ما قدرنا نجيب أرقام الشركة. جرّب تحدّث الصفحة، أو شوف العرض الحي.',
        '<a class="btn sm" href="/live">شوف العرض الحي</a>');
      proof.classList.add('is-empty');
      return;
    }
    proof.classList.remove('is-empty');
    const cov = Number(m.coverage_avg) || 0;
    proof.innerHTML = `
      <div class="stat">
        <span class="stat-label">${icon('users')}موظفين بيطلعوا قريب</span>
        <span class="stat-value">${R.ar(m.departing ?? 0)}<span class="stat-unit">موظفين</span></span>
        <span class="stat-foot">خبرتهم لازم تنحفظ قبل آخر يوم</span>
      </div>
      <div class="stat">
        <span class="stat-label">${icon('book')}من معرفتهم موثّقة</span>
        <span class="stat-value">${R.pct(cov)}</span>
        ${R.ui.meter(cov, { kind: 'auto', label: 'التغطية' })}
        <span class="stat-foot">${R.ar(m.cards_approved ?? 0)} بطاقة معتمدة</span>
      </div>
      <div class="stat">
        <span class="stat-label">${icon('shield')}قيمة محفوظة بالسنة</span>
        <span class="stat-value home-jod">${R.jod(m.value_protected_jod ?? 0)}</span>
        <span class="stat-foot">من بطاقات معتمدة</span>
      </div>
      <div class="stat">
        <span class="stat-label">${icon('alert')}أسئلة لسا بدها جواب</span>
        <span class="stat-value">${R.ar(m.gaps_open ?? 0)}<span class="stat-unit">فجوة</span></span>
        <span class="stat-foot">بتنحط بالجلسة الجاية</span>
      </div>`;
  }
  if (proof) {
    proof.innerHTML = R.ui.skeleton(4, { lines: 3 });
    R.api.get('/api/metrics').then(renderProof).catch(() => renderProof(null));
  }

  /* ---------------- Role cards ---------------- */
  const ROLES = [
    { id: 'nader', name: 'م. نادر', role: 'المدير التنفيذي', href: '/ceo', ico: 'chart',
      gives: 'صورة وحدة: مين طالع، قديش من خبرته انحفظت، ووين الخطر بالدينار.' },
    { id: 'samer', name: 'م. سامر', role: 'المدير المباشر', href: '/manager', ico: 'shield',
      gives: 'بطاقات بتستنى مراجعته، وأزواج التسليم، وأسئلة الموظف الجديد.' },
    { id: 'omar', name: 'عمر', role: 'الموظف المغادر', href: '/employee/omar', ico: 'mic',
      gives: 'جلساته الجاية، شو غطّى وشو ضايل، وخبرته بتضل باسمه.' },
    { id: 'rana', name: 'رنا', role: 'الموظفة الجديدة', href: '/onboarding/rana', ico: 'spark',
      gives: 'بتسأل راوي وبتسمع الجواب بصوت عمر، ومسار تعلّم أول ٣٠ يوم.' },
    { id: 'salma', name: 'سلمى', role: 'الموارد البشرية', href: '/hr', ico: 'users',
      gives: 'مسار المغادرين، والوصف الوظيفي الحقيقي مقابل الرسمي.' },
  ];
  const roles = $('#home-roles');
  function renderRoles() {
    if (!roles) return;
    roles.innerHTML = ROLES.map((r) => {
      const p = (R.store && R.store.person && R.store.person(r.id)) || { id: r.id, name: r.name };
      const meta = esc(p.role || r.role);
      return `
        <a class="panel home-role" href="${esc(r.href)}">
          <span class="home-role-top">
            ${R.ui.avatar(p, 48)}
            <span class="person-text">
              <span class="person-name">${esc(p.name || r.name)}</span>
              <span class="person-meta">${meta}</span>
            </span>
          </span>
          <span class="home-role-gives">${esc(r.gives)}</span>
          <span class="home-role-go">افتح الصفحة ${icon('arrow')}</span>
        </a>`;
    }).join('');
  }
  renderRoles();
  if (R.store && R.store.load) {
    R.store.load().then(renderRoles).catch(() => {});
  }
})();
