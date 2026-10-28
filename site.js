/* Darshan Sanjel's site script. Plain JS, no build step, loaded with `defer` on every page.
   ------------------------------------------------------------------------------------
   CONFIG: the one value you can fill in.
   - Cloudflare Web Analytics token: from dash.cloudflare.com > Analytics & Logs > Web Analytics.
     Leave empty to load no analytics at all.                                          */
// TODO(darshan): paste your Cloudflare Web Analytics token here (or leave '' to disable analytics).
const CF_ANALYTICS_TOKEN = '';

(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  };

  /* Footer year */
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* The site is dark-only; forget the light/dark choice and the dragon's sleep state older versions saved. */
  ['theme', 'ember'].forEach((k) => store.get(k) && store.set(k, null));
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  /* Click-to-copy (any button with data-copy) */
  $$('[data-copy]').forEach((btn) => {
    const label = $('span', btn) || btn;
    const original = label.textContent;
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch {
        const ta = Object.assign(document.createElement('textarea'), { value: text });
        ta.setAttribute('readonly', '');
        ta.className = 'vh';
        document.body.append(ta);
        ta.select();
        try { ok = document.execCommand('copy'); } catch { ok = false; }
        ta.remove();
      }
      label.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      const live = $('#copy-live');
      if (live) live.textContent = ok ? `${text} copied to clipboard` : '';
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { label.textContent = original; }, 1800);
    });
  });

  /* Résumé print button prints only the résumé */
  $$('[data-print-resume]').forEach((b) => b.addEventListener('click', () => {
    document.body.classList.add('print-resume');
    window.print();
  }));
  window.addEventListener('afterprint', () => document.body.classList.remove('print-resume'));

  /* ---- Motion (all of it is skipped for prefers-reduced-motion) ---- */
  const header = $('.top');
  const onScroll = () => header && header.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Number children so CSS can stagger them (style properties set via CSSOM are allowed by the CSP).
  const stagger = (els, cap = 8) => els.forEach((el, i) => el.style.setProperty('--i', Math.min(i, cap)));
  $$('.diagram').forEach((fig) => { stagger($$('.wire', fig), 12); stagger($$('.sig', fig), 12); });

  const REVEAL = [
    '.band-head', '.proj', '.spec-wrap', '.history > div', '.resume', '.post-card', '.case-body > section',
    '.fault', '.diagram', '.features li', '.learning .item', '.next-case', '.prose > *', '.lost-card',
  ].join(',');
  const targets = $$(REVEAL);
  if (!calm.matches && 'IntersectionObserver' in window) {
    const groups = new Map();
    targets.forEach((el) => {
      el.dataset.reveal = '';
      const sibs = groups.get(el.parentElement) || [];
      sibs.push(el);
      groups.set(el.parentElement, sibs);
    });
    groups.forEach((sibs) => sibs.forEach((el, i) => el.style.setProperty('--i', Math.min(i, 8))));
    // Anything already on screen is shown as-is, so nothing above the fold ever flashes.
    // Read every position first, then write, so this costs one layout instead of one per element.
    const fold = innerHeight;
    const onScreen = targets.map((el) => el.getBoundingClientRect().top < fold);
    targets.forEach((el, i) => onScreen[i] && el.classList.add('in'));
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    targets.forEach((el) => !el.classList.contains('in') && io.observe(el));
    document.documentElement.classList.add('reveal-ready');
  } else {
    targets.forEach((el) => el.classList.add('in'));
  }

  // A post's table of contents follows the section you're reading.
  const toc = $$('.toc a');
  if (toc.length && 'IntersectionObserver' in window) {
    const byId = new Map(toc.map((a) => [a.hash.slice(1), a]));
    const spy = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      toc.forEach((a) => { a.classList.remove('is-active'); a.removeAttribute('aria-current'); });
      const a = byId.get(en.target.id);
      if (a) { a.classList.add('is-active'); a.setAttribute('aria-current', 'location'); }
    }), { rootMargin: '-35% 0px -60% 0px' });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* Privacy-friendly analytics, only when a token is configured */
  if (CF_ANALYTICS_TOKEN) {
    const s = document.createElement('script');
    s.defer = true;
    s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.dataset.cfBeacon = JSON.stringify({ token: CF_ANALYTICS_TOKEN });
    document.head.append(s);
  }
})();
