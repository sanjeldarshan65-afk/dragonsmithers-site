/* The private page. private/data.json holds the content encrypted with a password
   (PBKDF2-SHA256 -> AES-256-GCM, made by tools/lock.html). Nothing readable is on the server:
   the browser derives the key from the password typed here and decrypts locally. A wrong
   password fails the AES-GCM check, so there is no stored hash to guess against offline
   beyond the ciphertext itself. Each <section data-tab="…"> in the content becomes a tab. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const form = $('#unlock');
  const status = $('#unlock-status');
  const vault = $('#vault');
  if (!form || !vault) return;

  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const say = (text, bad = false) => { status.textContent = text; status.classList.toggle('is-error', bad); };
  let data = null;

  const load = fetch('/private/data.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => {
      data = d && d.v === 1 && d.ct ? d : null;
      if (!data) {
        say("This section isn't set up yet.", true);
        form.querySelector('button').disabled = true;
      }
    });

  async function decrypt(password) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(data.salt), iterations: data.iter },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
    );
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(data.iv) }, key, unb64(data.ct));
    return new TextDecoder().decode(plain);
  }

  function render(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const sections = [...tpl.content.querySelectorAll('section[data-tab]')];
    const tablist = Object.assign(document.createElement('div'), { className: 'vault-tabs' });
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', 'Private sections');
    const tabs = [];
    const panels = sections.map((sec, i) => {
      const id = `vault-${i}`;
      const tab = Object.assign(document.createElement('button'), { type: 'button', id: `${id}-tab`, textContent: sec.dataset.tab });
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `${id}-panel`);
      tablist.append(tab);
      tabs.push(tab);
      sec.id = `${id}-panel`;
      sec.className = 'vault-panel prose-panel';
      sec.setAttribute('role', 'tabpanel');
      sec.setAttribute('aria-labelledby', tab.id);
      sec.tabIndex = 0;
      return sec;
    });
    const select = (i, focus = false) => {
      tabs.forEach((t, j) => {
        t.setAttribute('aria-selected', String(i === j));
        t.tabIndex = i === j ? 0 : -1;
        panels[j].hidden = i !== j;
      });
      if (focus) tabs[i].focus();
      try { sessionStorage.setItem('vault-tab', String(i)); } catch { /* storage blocked */ }
    };
    tabs.forEach((t, i) => t.addEventListener('click', () => select(i)));
    tablist.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select((to + tabs.length) % tabs.length, true);
    });

    // A copy button on every code block.
    panels.forEach((p) => p.querySelectorAll('pre').forEach((pre) => {
      const wrap = Object.assign(document.createElement('div'), { className: 'code-block' });
      pre.replaceWith(wrap);
      pre.tabIndex = 0;
      const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'copy-btn code-copy', textContent: 'Copy' });
      btn.setAttribute('aria-label', 'Copy code');
      btn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(pre.innerText); btn.textContent = 'Copied'; } catch { btn.textContent = 'Press Ctrl+C'; }
        setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
      });
      wrap.append(btn, pre);
    }));

    vault.replaceChildren(tablist, ...panels);
    let start = 0;
    try { start = Math.min(Number(sessionStorage.getItem('vault-tab')) || 0, tabs.length - 1); } catch { /* storage blocked */ }
    select(start);
  }

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
      render(await decrypt(input.value));
      form.hidden = true;
      vault.hidden = false;
      document.documentElement.classList.add('is-unlocked');
      $('#page-title').textContent = 'Private.';
      $('.page-head .lede').textContent = 'Unlocked for this visit. Reloading or leaving the page locks it again.';
      say('Unlocked.');
      $('[role=tab][aria-selected=true]', vault)?.focus();
    } catch {
      say('Wrong password.', true);
      input.select();
    } finally {
      input.value = form.hidden ? '' : input.value;
      btn.disabled = false;
    }
  });
})();
