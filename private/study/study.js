/* The study site under /private/study/. Plain JS, no build step.
   Content: private/study/data.json, locked with the same password and the same tool (tools/lock.html)
   as /private/. The readable source is private-src/study.json on your computer (gitignored).
   After unlocking, the decrypted content is kept in sessionStorage so moving between study pages
   doesn't ask again; closing the tab (or "Lock") forgets it. Progress (ids and scores only, no
   content) is kept in localStorage. No network requests except the one locked file. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const PAGE = document.body.dataset.study || 'home';
  const CONTENT_KEY = 'study-content';
  const PROGRESS_KEY = 'study-progress';
  const ROOT = '/private/study/';

  const form = $('#unlock');
  const status = $('#unlock-status');
  const app = $('#study');
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
  if (!form || !app) return;

  const session = {
    get() { try { return sessionStorage.getItem(CONTENT_KEY); } catch { return null; } },
    set(v) { try { sessionStorage.setItem(CONTENT_KEY, v); } catch { /* storage blocked: unlock per page */ } },
    clear() { try { sessionStorage.removeItem(CONTENT_KEY); } catch { /* storage blocked */ } },
  };

  /* ---------- Progress (localStorage) ---------- */
  const progress = (() => {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch { p = {}; }
    p.done ||= {}; p.cards ||= {}; p.videos ||= {};
    const save = () => { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* storage blocked */ } };
    return {
      data: p,
      done: (id) => !!p.done[id],
      mark(id, on = true) { if (on) p.done[id] = true; else delete p.done[id]; save(); },
      card(id, on) { if (on) p.cards[id] = true; else delete p.cards[id]; save(); },
      known: (id) => !!p.cards[id],
      setQuiz(score, total) {
        const last = { score, total, at: new Date().toISOString() };
        p.quiz = { last, best: !p.quiz?.best || score / total > p.quiz.best.score / p.quiz.best.total ? last : p.quiz.best };
        save();
      },
      setVideo(i, url) { if (url) p.videos[i] = url; else delete p.videos[i]; save(); },
      reset() { p.done = {}; p.cards = {}; delete p.quiz; save(); },
    };
  })();

  /* ---------- Tiny DOM helpers ---------- */
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  /** Text with `inline code` spans. Never parsed as HTML. */
  function rich(text) {
    const frag = document.createDocumentFragment();
    String(text).split(/(`[^`]+`)/).forEach((part) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length > 1) frag.append(h('code', {}, part.slice(1, -1)));
      else if (part) frag.append(part);
    });
    return frag;
  }
  function codeBlock(text, label = 'Copy') {
    const pre = h('pre', { tabindex: '0' }, h('code', {}, text));
    const btn = h('button', { type: 'button', class: 'copy-btn code-copy', 'aria-label': 'Copy code' }, label);
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; } catch { btn.textContent = 'Press Ctrl+C'; }
      setTimeout(() => { btn.textContent = label; }, 1600);
    });
    return h('div', { class: 'code-block' }, btn, pre);
  }
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const hash = (s) => { let x = 5381; for (const c of s) x = ((x * 33) ^ c.charCodeAt(0)) >>> 0; return x.toString(36); };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  function checkbox(id, label = 'Reviewed') {
    const input = h('input', { type: 'checkbox' });
    input.checked = progress.done(id);
    input.addEventListener('change', () => progress.mark(id, input.checked));
    return h('label', { class: 'check' }, input, h('span', {}, label));
  }

  /* ---------- Structure ---------- */
  const ROUTES = [
    ['home', 'Dashboard', ''],
    ['hardware', 'Hardware', 'hardware/'],
    ['troubleshooting', 'Troubleshooting', 'troubleshooting/'],
    ['server-mgmt', 'Server mgmt', 'server-mgmt/'],
    ['linux', 'Linux', 'linux/'],
    ['logs', 'Logs', 'logs/'],
    ['quiz', 'Quiz', 'quiz/'],
    ['flashcards', 'Flashcards', 'flashcards/'],
    ['cheatsheet', 'Cheat sheet', 'cheatsheet/'],
  ];
  const href = (id) => ROOT + ROUTES.find((r) => r[0] === id)[2];

  /** Every trackable item in a section: topics, plus scenarios / the terminal exercise / log samples. */
  function sectionItems(D, sec) {
    const ids = sec.topics.map((t) => `t:${sec.id}:${t.id}`);
    if (sec.id === 'troubleshooting') D.scenarios.forEach((s) => ids.push(`sc:${s.id}`));
    if (sec.id === 'linux') ids.push('ex:linux');
    (sec.samples || []).forEach((s) => ids.push(`log:${s.id}`));
    return ids;
  }

  function nav() {
    return h('nav', { class: 'study-nav no-print', 'aria-label': 'Study sections' },
      ROUTES.map(([id, label]) => h('a', { href: href(id), 'aria-current': id === PAGE ? 'page' : null }, label)));
  }

  /* ---------- Pages ---------- */
  function renderHome(D) {
    const out = [];
    // Countdown
    const when = new Date(D.meta.interview);
    const mins = Math.round((when - Date.now()) / 60000);
    const left = mins > 0
      ? `${Math.floor(mins / 1440) ? `${Math.floor(mins / 1440)}d ` : ''}${Math.floor((mins % 1440) / 60)}h ${mins % 60}m to go`
      : 'Interview time has passed. Good luck!';
    out.push(h('div', { class: 'study-hero' },
      h('p', { class: 'study-when' }, h('b', {}, D.meta.interviewLabel), ' · ', h('span', { class: 'num' }, left)),
      D.meta.note ? h('p', {}, D.meta.note) : null));

    // Section progress
    const cards = D.sections.map((sec) => {
      const ids = sectionItems(D, sec);
      const n = ids.filter((id) => progress.done(id)).length;
      return h('li', { class: 'prog-card' },
        h('a', { href: href(sec.id) }, h('b', {}, sec.title), h('span', {}, sec.blurb)),
        h('div', { class: 'prog-row' },
          h('progress', { max: String(ids.length), value: String(n), 'aria-label': `${sec.title} progress` }),
          h('span', { class: 'num' }, `${n}/${ids.length}`)));
    });
    const known = D.flashcards.filter((c) => progress.known(cardId(c))).length;
    cards.push(h('li', { class: 'prog-card' },
      h('a', { href: href('flashcards') }, h('b', {}, 'Flashcards'), h('span', {}, 'Cards you marked "got it".')),
      h('div', { class: 'prog-row' },
        h('progress', { max: String(D.flashcards.length), value: String(known), 'aria-label': 'Flashcards known' }),
        h('span', { class: 'num' }, `${known}/${D.flashcards.length}`))));
    const q = progress.data.quiz;
    cards.push(h('li', { class: 'prog-card' },
      h('a', { href: href('quiz') }, h('b', {}, 'Mock quiz'), h('span', {}, q ? `Last ${q.last.score}/${q.last.total} · best ${q.best.score}/${q.best.total}` : 'Not taken yet.')),
      h('div', { class: 'prog-row' },
        h('progress', { max: String(q?.best.total || 1), value: String(q?.best.score || 0), 'aria-label': 'Best quiz score' }),
        h('span', { class: 'num' }, q ? `${pct(q.best.score, q.best.total)}%` : '–'))));
    out.push(h('h2', {}, 'Progress'), h('ul', { class: 'prog-grid' }, cards));

    // Videos
    const vids = (D.videos || []).map((v, i) => {
      const saved = progress.data.videos[i];
      const url = v.url || saved || '';
      const input = h('input', { type: 'url', inputmode: 'url', placeholder: 'Paste a video link', value: saved || '', 'aria-label': `Link for ${v.title}` });
      const save = h('button', { type: 'button', class: 'btn small' }, 'Save');
      save.addEventListener('click', () => {
        const val = input.value.trim();
        if (val && !/^https:\/\//i.test(val)) { input.setCustomValidity('Use an https:// link'); input.reportValidity(); return; }
        input.setCustomValidity('');
        progress.setVideo(i, val);
        draw();
      });
      return h('li', { class: 'video-slot' },
        h('b', {}, v.title),
        url && /^https:\/\//i.test(url)
          ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Open video ↗')
          : h('span', { class: 'muted' }, 'Empty slot.'),
        v.url ? null : h('div', { class: 'video-edit' }, input, save),
        v.url ? null : h('small', { class: 'muted' }, `Saved on this device only. To make it permanent, set videos[${i}].url in study.json.`));
    });
    out.push(h('h2', {}, 'Videos from the guide'), h('ul', { class: 'video-grid' }, vids));

    const reset = h('button', { type: 'button', class: 'btn small' }, 'Reset all progress');
    reset.addEventListener('click', () => { if (confirm('Clear all study progress on this device?')) { progress.reset(); draw(); } });
    out.push(h('div', { class: 'study-actions' }, h('a', { class: 'btn small', href: href('cheatsheet') }, 'Printable cheat sheet'), reset));
    return out;
  }

  function topicCard(sec, t) {
    const id = `t:${sec.id}:${t.id}`;
    return h('article', { class: 'topic', id: t.id },
      h('h2', {}, t.title),
      h('ul', {}, t.lines.map((l) => h('li', {}, rich(l)))),
      t.code ? codeBlock(t.code) : null,
      t.sample ? h('div', { class: 'sample' }, h('span', { class: 'label' }, 'Sample output'), h('pre', { tabindex: '0' }, t.sample)) : null,
      h('p', { class: 'say' }, h('b', {}, 'Say it: '), rich(t.say)),
      checkbox(id));
  }

  function renderSection(D, sec) {
    const out = [];
    if (sec.topics.length > 3) {
      out.push(h('nav', { class: 'jump', 'aria-label': 'On this page' }, sec.topics.map((t) => h('a', { href: `#${t.id}` }, t.title)),
        sec.id === 'linux' ? h('a', { href: '#terminal' }, 'Practice terminal') : null));
    }
    if (sec.id === 'linux') out.push(renderTerminal(D));
    out.push(h('div', { class: 'topics' }, sec.topics.map((t) => topicCard(sec, t))));
    if (sec.id === 'troubleshooting') out.push(h('h2', { class: 'study-part' }, 'Step through it'), ...D.scenarios.map(renderScenario));
    if (sec.samples) {
      out.push(h('h2', { class: 'study-part' }, 'Read the log'));
      sec.samples.forEach((s) => out.push(h('article', { class: 'topic', id: s.id },
        h('h3', {}, s.title),
        h('pre', { class: 'log', tabindex: '0' }, s.log),
        h('p', {}, h('b', {}, s.question)),
        h('details', {}, h('summary', {}, 'Show the answer'), h('ul', {}, s.answer.map((a) => h('li', {}, rich(a))))),
        checkbox(`log:${s.id}`))));
    }
    return out;
  }

  function renderScenario(sc) {
    const box = h('article', { class: 'topic scenario', id: sc.id });
    let step = 0;
    const draw = () => {
      const s = sc.steps[step];
      const feedback = h('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
      const body = [h('h3', {}, sc.title), h('p', { class: 'muted' }, sc.intro)];
      if (step >= sc.steps.length) {
        progress.mark(`sc:${sc.id}`);
        const again = h('button', { type: 'button', class: 'btn small' }, 'Run it again');
        again.addEventListener('click', () => { step = 0; draw(); });
        body.push(h('p', { class: 'feedback is-ok' }, 'Done. ', rich(sc.takeaway)), again);
      } else {
        body.push(h('p', { class: 'step-count num' }, `Step ${step + 1} of ${sc.steps.length}`), h('p', { class: 'prompt' }, rich(s.prompt)));
        const opts = shuffle(s.options).map((o) => {
          const b = h('button', { type: 'button', class: 'choice' }, rich(o.text));
          b.addEventListener('click', () => {
            if (o.correct) {
              $$('.choice', box).forEach((x) => { x.disabled = true; });
              b.classList.add('is-right');
              feedback.className = 'feedback is-ok';
              feedback.replaceChildren('Right. ', rich(o.why));
              const next = h('button', { type: 'button', class: 'btn solid small' }, step + 1 < sc.steps.length ? 'Next step' : 'Finish');
              next.addEventListener('click', () => { step += 1; draw(); $('.prompt, .feedback', box)?.focus?.(); });
              feedback.after(next);
              next.focus();
            } else {
              b.classList.add('is-wrong');
              b.disabled = true;
              feedback.className = 'feedback is-bad';
              feedback.replaceChildren('Not yet. ', rich(o.why));
            }
          });
          return b;
        });
        body.push(h('div', { class: 'choices' }, opts), feedback);
      }
      if (progress.done(`sc:${sc.id}`)) body.push(h('p', { class: 'muted small' }, '✓ Completed before'));
      box.replaceChildren(...body);
    };
    draw();
    return box;
  }

  /* ---------- Fake terminal ---------- */
  function renderTerminal(D) {
    const T = D.terminal;
    const HOME = T.home;
    let fs; let cwd; const hist = []; let hi = 0; let stepI = 0;
    const parentOf = (p) => (p === '/' ? '/' : p.slice(0, p.lastIndexOf('/')) || '/');
    const base = (p) => p.slice(p.lastIndexOf('/') + 1);
    const join = (a, b) => (a === '/' ? `/${b}` : `${a}/${b}`);
    function reset() {
      fs = new Map([['/', { t: 'd' }]]);
      const mk = (p) => { if (!fs.has(p)) { mk(parentOf(p)); fs.set(p, { t: 'd' }); } };
      mk(HOME);
      (T.dirs || []).forEach(mk);
      Object.entries(T.files || {}).forEach(([p, c]) => { mk(parentOf(p)); fs.set(p, { t: 'f', c }); });
      cwd = HOME; stepI = 0;
    }
    function resolve(p) {
      if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
      const parts = (p.startsWith('/') ? p : `${cwd}/${p}`).split('/');
      const out = [];
      for (const x of parts) { if (!x || x === '.') continue; if (x === '..') out.pop(); else out.push(x); }
      return `/${out.join('/')}`;
    }
    const children = (d) => [...fs.keys()].filter((k) => k !== d && parentOf(k) === d).sort();
    const subtree = (p) => [...fs.keys()].filter((k) => k === p || k.startsWith(p === '/' ? '/' : `${p}/`));
    const tilde = (p) => (p === HOME ? '~' : p.startsWith(`${HOME}/`) ? `~${p.slice(HOME.length)}` : p);
    const size = (p) => (fs.get(p).t === 'd' ? 4096 : new TextEncoder().encode(fs.get(p).c).length);
    const human = (n) => (n < 1024 ? String(n) : `${(n / 1024).toFixed(1)}K`);

    function parse(argv) {
      const flags = new Set(); const args = [];
      argv.forEach((a) => { if (/^-[a-zA-Z]+$/.test(a)) [...a.slice(1)].forEach((f) => flags.add(f)); else if (a !== '--') args.push(a); });
      return { flags, args };
    }
    function copyTree(src, dst) {
      subtree(src).forEach((k) => fs.set(dst + k.slice(src.length), { ...fs.get(k) }));
    }
    /** Where cp/mv put src: into dst if dst is a directory, else at dst. */
    function target(src, dstArg) {
      const d = resolve(dstArg);
      return fs.get(d)?.t === 'd' ? join(d, base(src)) : d;
    }

    const cmds = {
      help: () => `Commands: pwd, ls [-l -a -h], cd, mkdir [-p], touch, cp [-r], mv, rm [-r -f], cat, man <cmd>\nAlso: clear, history, echo, whoami, hostname, uptime, nproc, uname -a, lscpu, free -h, lsblk, df -h, lspci,\n      sudo dmidecode -t memory, dmesg | grep -i edac\nUp/Down arrows recall commands. This is a sandbox: nothing here touches a real system.`,
      pwd: () => cwd,
      whoami: () => T.user,
      echo: (a) => a.join(' '),
      history: () => hist.map((c, i) => `${String(i + 1).padStart(4)}  ${c}`).join('\n'),
      man: (a) => (a[0] ? (T.man[a[0]] || `No manual entry for ${a[0]}`) : 'What manual page do you want?\nFor example, try \'man ls\'.'),
      ls(argv) {
        const { flags, args } = parse(argv);
        const targets = args.length ? args : ['.'];
        const lines = [];
        const fmt = (p, name) => {
          if (!flags.has('l')) return name;
          const n = fs.get(p);
          const sz = flags.has('h') ? human(size(p)) : String(size(p));
          return `${n.t === 'd' ? 'drwxr-xr-x' : '-rw-r--r--'} ${n.t === 'd' ? 2 : 1} ${T.user} ${T.user} ${sz.padStart(5)} Nov 17 09:00 ${name}`;
        };
        targets.forEach((arg, i) => {
          const p = resolve(arg);
          const n = fs.get(p);
          if (!n) { lines.push(`ls: cannot access '${arg}': No such file or directory`); return; }
          if (n.t === 'f') { lines.push(fmt(p, arg)); return; }
          if (targets.length > 1) lines.push(`${i ? '\n' : ''}${arg}:`);
          let kids = children(p).map((k) => [k, base(k)]);
          if (!flags.has('a')) kids = kids.filter(([, nm]) => !nm.startsWith('.'));
          else kids = [[p, '.'], [parentOf(p), '..'], ...kids];
          if (flags.has('l')) { lines.push(`total ${kids.length * 4}`); kids.forEach(([k, nm]) => lines.push(fmt(k, nm))); } else if (kids.length) lines.push(kids.map(([k, nm]) => (fs.get(k).t === 'd' ? `${nm}/` : nm)).join('  '));
        });
        return lines.join('\n');
      },
      cd(argv) {
        const arg = argv[0] || '~';
        const p = resolve(arg);
        if (!fs.has(p)) return `cd: ${arg}: No such file or directory`;
        if (fs.get(p).t !== 'd') return `cd: ${arg}: Not a directory`;
        cwd = p; return '';
      },
      mkdir(argv) {
        const { flags, args } = parse(argv);
        if (!args.length) return 'mkdir: missing operand';
        return args.map((a) => {
          const p = resolve(a);
          if (fs.has(p)) return flags.has('p') && fs.get(p).t === 'd' ? '' : `mkdir: cannot create directory '${a}': File exists`;
          if (!fs.has(parentOf(p))) {
            if (!flags.has('p')) return `mkdir: cannot create directory '${a}': No such file or directory`;
            const chain = []; let q = p; while (!fs.has(q)) { chain.unshift(q); q = parentOf(q); }
            if (fs.get(q).t !== 'd') return `mkdir: cannot create directory '${a}': Not a directory`;
            chain.forEach((c) => fs.set(c, { t: 'd' })); return '';
          }
          if (fs.get(parentOf(p)).t !== 'd') return `mkdir: cannot create directory '${a}': Not a directory`;
          fs.set(p, { t: 'd' }); return '';
        }).filter(Boolean).join('\n');
      },
      touch(argv) {
        const { args } = parse(argv);
        if (!args.length) return 'touch: missing file operand';
        return args.map((a) => {
          const p = resolve(a);
          if (fs.has(p)) return '';
          if (fs.get(parentOf(p))?.t !== 'd') return `touch: cannot touch '${a}': No such file or directory`;
          fs.set(p, { t: 'f', c: '' }); return '';
        }).filter(Boolean).join('\n');
      },
      cat(argv) {
        const { args } = parse(argv);
        if (!args.length) return 'cat: missing file operand (in a real shell, cat waits for input; press Ctrl+C)';
        return args.map((a) => {
          const n = fs.get(resolve(a));
          if (!n) return `cat: ${a}: No such file or directory`;
          if (n.t === 'd') return `cat: ${a}: Is a directory`;
          return n.c;
        }).join('\n');
      },
      cp(argv) {
        const { flags, args } = parse(argv);
        if (args.length < 2) return args.length ? `cp: missing destination file operand after '${args[0]}'` : 'cp: missing file operand';
        const dstArg = args.pop();
        if (args.length > 1 && fs.get(resolve(dstArg))?.t !== 'd') return `cp: target '${dstArg}' is not a directory`;
        return args.map((a) => {
          const src = resolve(a); const n = fs.get(src);
          if (!n) return `cp: cannot stat '${a}': No such file or directory`;
          if (n.t === 'd' && !flags.has('r') && !flags.has('R')) return `cp: -r not specified; omitting directory '${a}'`;
          const dst = target(src, dstArg);
          if (dst === src) return `cp: '${a}' and '${dstArg}' are the same file`;
          if (dst.startsWith(`${src}/`)) return `cp: cannot copy a directory, '${a}', into itself, '${dstArg}'`;
          if (fs.get(parentOf(dst))?.t !== 'd') return `cp: cannot create regular file '${dstArg}': No such file or directory`;
          if (fs.get(dst)?.t === 'd' && n.t === 'f') return `cp: cannot overwrite directory '${dstArg}' with non-directory`;
          if (n.t === 'd') copyTree(src, dst); else fs.set(dst, { ...n });
          return '';
        }).filter(Boolean).join('\n');
      },
      mv(argv) {
        const { args } = parse(argv);
        if (args.length < 2) return args.length ? `mv: missing destination file operand after '${args[0]}'` : 'mv: missing file operand';
        const dstArg = args.pop();
        if (args.length > 1 && fs.get(resolve(dstArg))?.t !== 'd') return `mv: target '${dstArg}' is not a directory`;
        return args.map((a) => {
          const src = resolve(a); const n = fs.get(src);
          if (!n) return `mv: cannot stat '${a}': No such file or directory`;
          const dst = target(src, dstArg);
          if (dst === src) return `mv: '${a}' and '${dstArg}' are the same file`;
          if (dst.startsWith(`${src}/`)) return `mv: cannot move '${a}' to a subdirectory of itself, '${dstArg}'`;
          if (fs.get(parentOf(dst))?.t !== 'd') return `mv: cannot move '${a}' to '${dstArg}': No such file or directory`;
          if (fs.get(dst)?.t === 'd' && n.t === 'f') return `mv: cannot overwrite directory '${dstArg}' with non-directory`;
          const moved = subtree(src).map((k) => [k, fs.get(k)]);
          moved.forEach(([k]) => fs.delete(k));
          subtree(dst).forEach((k) => fs.delete(k));
          moved.forEach(([k, v]) => fs.set(dst + k.slice(src.length), v));
          if (cwd === src || cwd.startsWith(`${src}/`)) cwd = dst + cwd.slice(src.length);
          return '';
        }).filter(Boolean).join('\n');
      },
      rm(argv) {
        const { flags, args } = parse(argv);
        const rec = flags.has('r') || flags.has('R'); const force = flags.has('f');
        if (!args.length) return force ? '' : 'rm: missing operand';
        return args.map((a) => {
          const p = resolve(a);
          if (p === '/' && rec) return "rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe\n(Real systems refuse this one. A path like /home/tech/* would not be refused. That's why rm -rf is dangerous.)";
          const n = fs.get(p);
          if (!n) return force ? '' : `rm: cannot remove '${a}': No such file or directory`;
          if (n.t === 'd' && !rec) return `rm: cannot remove '${a}': Is a directory`;
          if (a === '.' || a === '..' || /\/\.\.?$/.test(a)) return `rm: refusing to remove '.' or '..' directory: skipping '${a}'`;
          subtree(p).forEach((k) => fs.delete(k));
          if (!fs.has(cwd)) { let q = cwd; while (!fs.has(q)) q = parentOf(q); cwd = q; }
          return '';
        }).filter(Boolean).join('\n');
      },
    };

    const out = h('div', { class: 'term-out', role: 'log', 'aria-live': 'polite', 'aria-label': 'Terminal output' });
    const promptEl = h('span', { class: 'term-prompt', 'aria-hidden': 'true' });
    const input = h('input', { class: 'term-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send', 'aria-label': 'Terminal command' });
    const promptText = () => `${T.user}@${T.host}:${tilde(cwd)}$`;
    const print = (text, cls) => { if (text) out.append(h('div', { class: cls || 'term-line' }, text)); };

    // Exercise panel
    const steps = T.exercise || [];
    const exList = h('ol', { class: 'ex-steps' });
    const exNote = h('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
    const checkOk = (c) => {
      if (c.dir) return fs.get(resolve(c.dir))?.t === 'd';
      if (c.file) return fs.get(resolve(c.file))?.t === 'f';
      if (c.missing) return !fs.has(resolve(c.missing));
      return false;
    };
    function drawSteps() {
      exList.replaceChildren(...steps.map((s, i) => h('li', { class: i < stepI ? 'is-done' : i === stepI ? 'is-current' : '' , 'aria-current': i === stepI ? 'step' : null },
        h('span', {}, rich(s.task)),
        i === stepI ? h('details', {}, h('summary', {}, 'Hint'), h('code', {}, s.hint)) : null)));
      if (stepI >= steps.length && steps.length) {
        exNote.className = 'feedback is-ok';
        exNote.textContent = 'Exercise complete: mkdir, touch, cp, mv and rm all done.';
        progress.mark('ex:linux');
      }
    }
    function evalSteps() {
      const before = stepI;
      while (stepI < steps.length && steps[stepI].checks.every(checkOk)) stepI += 1;
      if (stepI > before && stepI < steps.length) { exNote.className = 'feedback is-ok'; exNote.textContent = `Step ${before + 1} done. Next: ${steps[stepI].task}`; }
      drawSteps();
    }

    function run(line) {
      const cmd = line.trim().replace(/\s+/g, ' ');
      print(`${promptText()} ${line}`, 'term-line term-echo');
      if (!cmd) return;
      hist.push(cmd); hi = hist.length;
      if (cmd === 'clear') { out.replaceChildren(); return; }
      if (T.canned[cmd] != null) { print(T.canned[cmd]); return; }
      let argv = cmd.match(/'[^']*'|"[^"]*"|\S+/g).map((a) => a.replace(/^(['"])(.*)\1$/, '$2'));
      if (argv[0] === 'sudo' && argv.length > 1) argv = argv.slice(1);
      const [name, ...rest] = argv;
      if (rest.includes('--help') && T.man[name]) { print(T.man[name]); return; }
      if (/[|>]/.test(cmd)) { print('Pipes and redirection are not supported in this sandbox (except the canned commands in help).', 'term-line term-err'); return; }
      const fn = cmds[name];
      if (!fn) { print(`${name}: command not found (type 'help')`, 'term-line term-err'); return; }
      const res = fn(rest);
      print(res, /cannot|No such|missing|not a|Is a dir|refusing|dangerous|omitting|not supported|same file|itself/.test(res || '') ? 'term-line term-err' : 'term-line');
      evalSteps();
    }

    const formEl = h('form', { class: 'term-form' }, h('label', { class: 'term-row' }, promptEl, input));
    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      run(input.value);
      input.value = '';
      promptEl.textContent = promptText();
      out.scrollTop = out.scrollHeight;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' && hi > 0) { hi -= 1; input.value = hist[hi]; e.preventDefault(); }
      if (e.key === 'ArrowDown') { hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; e.preventDefault(); }
    });
    const screen = h('div', { class: 'study-term' }, out, formEl);
    screen.addEventListener('click', (e) => { if (!e.target.closest('a, button, summary') && !getSelection().toString()) input.focus({ preventScroll: true }); });
    const resetBtn = h('button', { type: 'button', class: 'btn small' }, 'Reset terminal');
    const boot = () => {
      reset(); out.replaceChildren(); exNote.textContent = '';
      print("Practice terminal. Type 'help' to see what works. Start with: pwd, then ls -la", 'term-line term-dim');
      promptEl.textContent = promptText(); drawSteps();
    };
    resetBtn.addEventListener('click', () => { boot(); input.focus(); });
    boot();

    return h('section', { class: 'topic term-wrap', id: 'terminal', 'aria-labelledby': 'term-title' },
      h('h2', { id: 'term-title' }, 'Practice terminal'),
      h('p', { class: 'muted' }, 'A sandbox with a small fake filesystem. Your home is ', h('code', {}, HOME), '. Nothing here touches a real system.'),
      screen,
      h('div', { class: 'exercise' },
        h('h3', {}, 'Guided exercise'),
        exList, exNote,
        h('div', { class: 'study-actions' }, resetBtn, progress.done('ex:linux') ? h('span', { class: 'muted small' }, '✓ Completed before') : null)));
  }

  /* ---------- Flashcards ---------- */
  const cardId = (c) => `c:${hash(c.s + c.q)}`;
  function renderFlashcards(D) {
    const titles = Object.fromEntries(D.sections.map((s) => [s.id, s.title]));
    let filter = 'all'; let skipKnown = false; let queue = []; let flipped = false;
    const wrap = h('div', { class: 'flash' });
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by section' });
    const skip = h('input', { type: 'checkbox' });
    const start = (doShuffle = true) => {
      const pool = D.flashcards.filter((c) => (filter === 'all' || c.s === filter) && !(skipKnown && progress.known(cardId(c))));
      queue = doShuffle ? shuffle(pool) : pool; flipped = false; draw();
    };
    const sections = ['all', ...new Set(D.flashcards.map((c) => c.s))];
    sections.forEach((s) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s === filter) }, s === 'all' ? 'All' : titles[s] || s);
      b.addEventListener('click', () => { filter = s; $$('.chip', chips).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); start(); });
      chips.append(b);
    });
    skip.addEventListener('change', () => { skipKnown = skip.checked; start(); });
    const shuffleBtn = h('button', { type: 'button', class: 'btn small' }, 'Shuffle');
    shuffleBtn.addEventListener('click', () => start(true));
    const stats = h('p', { class: 'num muted', role: 'status', 'aria-live': 'polite' });

    function draw() {
      const known = D.flashcards.filter((c) => progress.known(cardId(c))).length;
      stats.textContent = `${queue.length} left in this round · ${known}/${D.flashcards.length} known overall`;
      if (!queue.length) {
        const again = h('button', { type: 'button', class: 'btn solid' }, 'Start another round');
        again.addEventListener('click', () => start());
        wrap.replaceChildren(h('div', { class: 'card-face done' }, h('p', {}, 'Round finished.'), again));
        return;
      }
      const c = queue[0];
      const face = h('button', { type: 'button', class: `card-face${flipped ? ' is-back' : ''}`, 'aria-label': flipped ? 'Answer. Tap to show the question' : 'Question. Tap to show the answer' },
        h('span', { class: 'label' }, `${titles[c.s] || c.s} · ${flipped ? 'Answer' : 'Question'}`),
        h('span', { class: 'card-text' }, rich(flipped ? c.a : c.q)),
        h('span', { class: 'card-hint muted' }, flipped ? '' : 'Tap or press Space to flip'));
      face.addEventListener('click', () => { flipped = !flipped; draw(); $('.card-face', wrap)?.focus(); });
      const againBtn = h('button', { type: 'button', class: 'btn' }, 'Again');
      const gotBtn = h('button', { type: 'button', class: 'btn solid' }, 'Got it');
      againBtn.addEventListener('click', () => {
        progress.card(cardId(c), false);
        queue.push(queue.shift()); flipped = false; draw(); $('.card-face', wrap)?.focus();
      });
      gotBtn.addEventListener('click', () => {
        progress.card(cardId(c), true);
        queue.shift(); flipped = false; draw(); $('.card-face', wrap)?.focus();
      });
      wrap.replaceChildren(face, h('div', { class: 'card-btns' }, againBtn, gotBtn));
    }
    start();
    return [
      h('div', { class: 'flash-tools' }, chips, h('div', { class: 'study-actions' }, shuffleBtn, h('label', { class: 'check' }, skip, h('span', {}, 'Skip cards I already know')))),
      stats, wrap,
    ];
  }

  /* ---------- Quiz ---------- */
  function renderQuiz(D) {
    const titles = Object.fromEntries(D.sections.map((s) => [s.id, s.title]));
    const box = h('div', { class: 'quiz' });
    let items; let i; let answers; let ratings;

    function begin() {
      items = shuffle(D.quiz.mc).map((q) => {
        const order = shuffle(q.options.map((_, k) => k));
        return { ...q, order };
      });
      i = 0; answers = []; ratings = [];
      drawQ();
    }
    function intro() {
      const q = progress.data.quiz;
      const go = h('button', { type: 'button', class: 'btn solid' }, 'Start the quiz');
      go.addEventListener('click', begin);
      box.replaceChildren(
        h('p', {}, `${D.quiz.mc.length} multiple-choice questions, then ${D.quiz.scenarios.length} "explain your approach" scenarios you answer out loud (or type), then compare with a model answer.`),
        q ? h('p', { class: 'muted num' }, `Last: ${q.last.score}/${q.last.total} · Best: ${q.best.score}/${q.best.total}`) : '',
        go);
    }
    function drawQ() {
      if (i >= items.length) return drawScenario(0);
      const q = items[i];
      const feedback = h('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
      const legend = h('legend', { class: 'prompt' }, rich(q.q));
      const opts = q.order.map((k) => {
        const b = h('button', { type: 'button', class: 'choice' }, rich(q.options[k]));
        b.addEventListener('click', () => {
          const ok = k === q.answer;
          answers[i] = { s: q.s, ok };
          $$('.choice', box).forEach((x, n) => {
            x.disabled = true;
            if (q.order[n] === q.answer) x.classList.add('is-right');
          });
          if (!ok) b.classList.add('is-wrong');
          feedback.className = `feedback ${ok ? 'is-ok' : 'is-bad'}`;
          feedback.replaceChildren(ok ? 'Correct. ' : `Not quite. Answer: ${q.options[q.answer]}. `, rich(q.why));
          const next = h('button', { type: 'button', class: 'btn solid small' }, i + 1 < items.length ? 'Next question' : 'On to the scenarios');
          next.addEventListener('click', () => { i += 1; drawQ(); $('legend', box)?.focus(); });
          feedback.after(next);
          next.focus();
        });
        return b;
      });
      legend.tabIndex = -1;
      box.replaceChildren(
        h('p', { class: 'step-count num' }, `Question ${i + 1} of ${items.length} · ${titles[q.s] || q.s}`),
        h('progress', { max: String(items.length), value: String(i), 'aria-label': 'Quiz progress' }),
        h('fieldset', { class: 'q' }, legend, h('div', { class: 'choices' }, opts)),
        feedback);
    }
    function drawScenario(n) {
      if (n >= D.quiz.scenarios.length) return results();
      const sc = D.quiz.scenarios[n];
      const ta = h('textarea', { rows: '6', 'aria-label': 'Your answer (optional)', placeholder: 'Type your answer, or say it out loud, then reveal the model answer.' });
      const reveal = h('button', { type: 'button', class: 'btn solid small' }, 'Show the model answer');
      const model = h('div', { class: 'model', hidden: true },
        h('span', { class: 'label' }, 'Model answer'), h('p', {}, sc.model),
        h('p', { class: 'muted' }, 'How did yours compare?'));
      const rate = (v) => { ratings[n] = { s: sc.s, v }; drawScenario(n + 1); $('.prompt', box)?.focus(); };
      const yes = h('button', { type: 'button', class: 'btn small' }, 'I covered the key points');
      const no = h('button', { type: 'button', class: 'btn small' }, 'I missed some');
      yes.addEventListener('click', () => rate(true));
      no.addEventListener('click', () => rate(false));
      model.append(h('div', { class: 'study-actions' }, yes, no));
      reveal.addEventListener('click', () => { model.hidden = false; reveal.hidden = true; yes.focus(); });
      const prompt = h('p', { class: 'prompt', tabindex: '-1' }, h('b', {}, sc.prompt));
      box.replaceChildren(h('p', { class: 'step-count num' }, `Scenario ${n + 1} of ${D.quiz.scenarios.length}`), prompt, ta, reveal, model);
    }
    function results() {
      const score = answers.filter((a) => a.ok).length;
      progress.setQuiz(score, items.length);
      const by = {};
      answers.forEach((a) => { by[a.s] ||= { ok: 0, n: 0 }; by[a.s].n += 1; if (a.ok) by[a.s].ok += 1; });
      ratings.forEach((r) => { if (!r.v) { by[r.s] ||= { ok: 0, n: 0 }; by[r.s].missedScenario = true; } });
      const weak = Object.entries(by).filter(([, v]) => v.ok / (v.n || 1) < 0.8 || v.missedScenario);
      const retake = h('button', { type: 'button', class: 'btn solid' }, 'Take it again');
      retake.addEventListener('click', begin);
      box.replaceChildren(
        h('h2', { tabindex: '-1', class: 'result' }, `${score}/${items.length} · ${pct(score, items.length)}%`),
        h('p', { class: 'muted' }, `Scenarios: ${ratings.filter((r) => r.v).length}/${ratings.length} covered the key points.`),
        h('div', { class: 'table-scroll', tabindex: '0' }, h('table', { class: 'by-section' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Section'), h('th', {}, 'Score'))),
          h('tbody', {}, Object.entries(by).map(([s, v]) => h('tr', {},
            h('td', {}, titles[s] || s), h('td', { class: 'num' }, `${v.ok}/${v.n}${v.missedScenario ? ' · scenario missed' : ''}`)))))),
        weak.length
          ? h('div', {}, h('h3', {}, 'Review these'), h('ul', { class: 'review' }, weak.map(([s]) => h('li', {}, ROUTES.some((r) => r[0] === s) ? h('a', { href: href(s) }, titles[s] || s) : (titles[s] || s)))))
          : h('p', { class: 'feedback is-ok' }, 'Every section at 80% or better.'),
        retake);
      $('.result', box).focus();
    }
    intro();
    return box;
  }

  /* ---------- Cheat sheet ---------- */
  function renderCheatsheet(D) {
    const print = h('button', { type: 'button', class: 'btn solid small no-print' }, 'Print / save as PDF');
    print.addEventListener('click', () => window.print());
    return [
      h('div', { class: 'study-actions no-print' }, print),
      h('div', { class: 'cheat' },
        h('p', { class: 'cheat-title' }, h('b', {}, `${D.meta.title} · cheat sheet`), ` · ${D.meta.interviewLabel}`),
        D.cheatsheet.map((g) => h('section', {}, h('h2', {}, g.title), h('ul', {}, g.items.map((it) => h('li', {}, rich(it))))))),
    ];
  }

  /* ---------- Unlock + draw ---------- */
  let D = null;
  function draw() {
    const sec = D.sections.find((s) => s.id === PAGE);
    let body;
    if (PAGE === 'home') body = renderHome(D);
    else if (sec) body = renderSection(D, sec);
    else if (PAGE === 'quiz') body = [renderQuiz(D)];
    else if (PAGE === 'flashcards') body = renderFlashcards(D);
    else if (PAGE === 'cheatsheet') body = renderCheatsheet(D);
    else body = [h('p', {}, 'Unknown page.')];
    const lock = h('button', { type: 'button', class: 'btn small' }, 'Lock');
    lock.addEventListener('click', () => { session.clear(); location.reload(); });
    app.replaceChildren(nav(), h('div', { class: 'study-body' }, body), h('div', { class: 'study-actions no-print study-foot' }, lock, h('span', { class: 'muted small' }, 'Unlocked for this tab. Closing it locks the study site again.')));
    const lede = $('.page-head .lede');
    if (lede) lede.textContent = sec ? sec.blurb : lede.dataset.unlocked || lede.textContent;
  }
  function show(json) {
    D = JSON.parse(json);
    form.hidden = true;
    status.textContent = '';
    document.documentElement.classList.add('is-unlocked');
    app.hidden = false;
    draw();
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }

  const cached = session.get();
  if (cached) { try { show(cached); return; } catch { session.clear(); } }

  const say = (text, bad = false) => { status.textContent = text; status.classList.toggle('is-error', bad); };
  let data = null;
  const load = window.VaultCrypto.load('/private/study/data.json').then((d) => {
    data = d;
    if (!data) { say("The study site isn't set up yet.", true); form.querySelector('button').disabled = true; }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await load;
    if (!data) return;
    const input = form.elements.password;
    const btn = form.querySelector('button');
    if (!input.value) { say('Enter the password.', true); input.focus(); return; }
    btn.disabled = true;
    say('Unlocking…');
    try {
      const json = await window.VaultCrypto.decrypt(data, input.value);
      input.value = '';
      session.set(json);
      show(json);
      $('.study-nav [aria-current]')?.focus();
    } catch {
      say('Wrong password.', true);
      input.select();
    } finally {
      btn.disabled = false;
    }
  });
})();
