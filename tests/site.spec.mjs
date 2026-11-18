import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { webcrypto as wc } from 'node:crypto';

const STUDY = ['', 'hardware/', 'troubleshooting/', 'server-mgmt/', 'linux/', 'logs/', 'quiz/', 'flashcards/', 'cheatsheet/'].map((p) => `/private/study/${p}`);
const PAGES = ['/', '/blog/', '/blog/wazuh-siem/', '/blog/proxmox-lab/', '/blog/trail-window/', '/private/', ...STUDY];
const WIDTHS = [390, 768, 1280];
const SCHEMES = ['light', 'dark'];
// Links to files Darshan still has to add. Remove an entry once the file exists.
const KNOWN_PENDING = new Set();

/** Scroll through the page so every scroll-reveal has played, then let the last fades finish. */
async function settle(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 60));
    }
    scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForTimeout(900);
}

/** Fail on console errors and uncaught exceptions. External requests are stubbed so tests run offline. */
async function watch(page) {
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  return errors;
}

for (const scheme of SCHEMES) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    for (const path of PAGES) {
      for (const width of WIDTHS) {
        test(`${path} renders at ${width}px`, async ({ page }) => {
          const errors = await watch(page);
          await page.setViewportSize({ width, height: 900 });
          const res = await page.goto(path);
          expect(res.status()).toBe(200);
          await expect(page.locator('h1')).toHaveCount(1);
          await expect(page.locator('main#main')).toBeVisible();
          const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
          expect(sw, 'no horizontal scroll').toBeLessThanOrEqual(cw);
          expect(errors).toEqual([]);
        });
      }
      test(`${path} has no serious or critical axe issues`, async ({ page }) => {
        await watch(page);
        await page.goto(path);
        await settle(page);
        const { violations } = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact));
        expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      });
    }
  });
}

test('every internal link and in-page anchor resolves', async ({ page, request }) => {
  await watch(page);
  const checked = new Map();
  for (const path of [...PAGES, '/404.html']) {
    await page.goto(path);
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
    for (const href of hrefs) {
      if (/^(mailto:|https?:)/.test(href)) continue;
      const url = new URL(href, `http://localhost:8080${path}`);
      if (KNOWN_PENDING.has(url.pathname)) continue;
      if (!checked.has(url.pathname)) checked.set(url.pathname, (await request.get(url.pathname)).status());
      expect(checked.get(url.pathname), `${href} on ${path}`).toBe(200);
      if (url.hash.length > 1) {
        const html = await (await request.get(url.pathname)).text();
        expect(html, `#${url.hash.slice(1)} exists for ${href} on ${path}`).toContain(`id="${decodeURIComponent(url.hash.slice(1))}"`);
      }
    }
  }
});

test('unknown URLs get the custom 404 page', async ({ request }) => {
  const res = await request.get('/this-page-does-not-exist');
  expect(res.status()).toBe(404);
  expect(await res.text()).toContain('Page not found');
});

test('site is dark-only: no theme toggle, dark in a light-preferring browser, stale choice cleared', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'light' });
  const page = await ctx.newPage();
  await watch(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload();
  await expect(page.locator('.theme-toggle')).toHaveCount(0);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(10, 6, 7)');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
  await ctx.close();
});

test('copy button copies the email address', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await watch(page);
  await page.goto('/');
  await page.locator('#contact [data-copy]').click();
  await expect(page.locator('#contact [data-copy]')).toContainText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('darshan@dragonsmithers.com');
});

test('pages carry unique titles, descriptions, canonicals and OG images', async ({ page, request }) => {
  const seen = new Set();
  // Study pages are private and noindex: no share cards or canonicals, on purpose.
  for (const path of PAGES.filter((p) => !STUDY.includes(p))) {
    await page.goto(path);
    const title = await page.title();
    const desc = await page.locator('meta[name=description]').getAttribute('content');
    expect(seen.has(title), `duplicate title ${title}`).toBe(false);
    seen.add(title);
    expect(desc.length).toBeGreaterThan(50);
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', `https://dragonsmithers.com${path}`);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect((await request.get(new URL(og).pathname)).status()).toBe(200);
  }
  for (const f of ['/sitemap.xml', '/robots.txt', '/site.webmanifest', '/favicon.ico', '/apple-touch-icon.png', '/CNAME']) {
    expect((await request.get(f)).status(), f).toBe(200);
  }
});

test('no phone numbers or street addresses leak onto the site', async ({ request }) => {
  for (const path of [...PAGES, '/404.html']) {
    const html = await (await request.get(path)).text();
    const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    expect(text, path).not.toMatch(/\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/);
  }
});

test.describe('motion', () => {
  test('reduced-motion users get every section visible with no reveal states', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('html')).not.toHaveClass(/reveal-ready/);
      const hidden = await page.$$eval('.diagram .wire', (els) => els.filter((e) => getComputedStyle(e).opacity === '0').length);
      expect(hidden, path).toBe(0);
    }
    await ctx.close();
  });

  test('every section and card is visible on load, without scrolling', async ({ page }) => {
    await watch(page);
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForTimeout(300);
      const hidden = await page.$$eval('main section, main article, .proj, .post-card, .resume, .fault, .diagram',
        (els) => els.filter((e) => parseFloat(getComputedStyle(e).opacity) < 1).map((e) => e.className || e.tagName));
      expect(hidden, path).toEqual([]);
      expect(await page.$$eval('[data-reveal]', (els) => els.length), path).toBe(0);
    }
  });
});

test('old addresses redirect to their new homes', async ({ page }) => {
  const moved = {
    '/portfolio/': '/', '/business/': '/', '/privacy/': '/',
    '/portfolio/wazuh-siem/': '/blog/wazuh-siem/', '/portfolio/proxmox-lab/': '/blog/proxmox-lab/', '/portfolio/trail-window/': '/blog/trail-window/',
  };
  for (const [from, to] of Object.entries(moved)) {
    await page.goto(from);
    await page.waitForURL(`**${to}`);
    await expect(page.locator('h1')).not.toHaveText('This page moved.');
  }
});

test('the repair business and the dragon are gone for good', async ({ request }) => {
  for (const path of [...PAGES, '/404.html']) {
    const html = await (await request.get(path)).text();
    expect(html, path).not.toMatch(/Repair|DragonSmiths|web3forms|class="dragon|ember-|pet\.js/);
  }
  for (const gone of ['/pet.js', '/img/dragon-800.webp']) expect((await request.get(gone)).status(), gone).toBe(404);
});

test('the blog lists every post and each post links back', async ({ page }) => {
  await watch(page);
  await page.goto('/blog/');
  const links = await page.$$eval('.post-card h3 a', (as) => as.map((a) => a.getAttribute('href')));
  expect(links).toEqual(['/blog/wazuh-siem/', '/blog/proxmox-lab/', '/blog/trail-window/']);
  await page.locator('.post-card').first().click();
  await expect(page).toHaveURL(/\/blog\/wazuh-siem\/$/);
  await expect(page.locator('.crumbs a[href="/blog/"]')).toHaveCount(1);
});

test.describe('private page', () => {
  // Encrypt test content exactly the way tools/lock.html does (fewer PBKDF2 rounds to keep tests fast).
  const PASSWORD = 'correct horse battery staple';
  const CONTENT = `<section data-tab="Overview"><h2>First tab</h2><pre><code>const a = 1;</code></pre></section>
    <section data-tab="Configuration"><h2>Second tab</h2></section><section data-tab="SDK"><h2>Third tab</h2></section>`;
  let payload;
  test.beforeAll(async () => {
    const enc = new TextEncoder();
    const b64 = (u8) => Buffer.from(u8).toString('base64');
    const salt = wc.getRandomValues(new Uint8Array(16));
    const iv = wc.getRandomValues(new Uint8Array(12));
    const base = await wc.subtle.importKey('raw', enc.encode(PASSWORD), 'PBKDF2', false, ['deriveKey']);
    const key = await wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 1000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(CONTENT)));
    payload = { v: 1, kdf: 'PBKDF2-SHA256', iter: 1000, cipher: 'AES-256-GCM', salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  });

  test('wrong password is refused; the right one unlocks keyboard-navigable tabs', async ({ page }) => {
    const errors = await watch(page);
    await page.route('**/private/data.json', (r) => r.fulfill({ json: payload }));
    await page.goto('/private/');
    await expect(page.locator('#vault')).toBeHidden();
    await page.fill('#vault-password', 'not the password');
    await page.click('#unlock button');
    await expect(page.locator('#unlock-status')).toHaveText('Wrong password.');
    await expect(page.locator('#vault')).toBeHidden();

    await page.fill('#vault-password', PASSWORD);
    await page.click('#unlock button');
    await expect(page.locator('#vault')).toBeVisible();
    await expect(page.locator('#unlock')).toBeHidden();
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveText(['Overview', 'Configuration', 'SDK', 'Watch']);
    await expect(page.getByRole('tabpanel')).toContainText('First tab');
    await expect(tabs.first()).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText('Second tab');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
    await tabs.first().click();
    await expect(page.locator('.code-copy')).toHaveCount(1);

    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Watch stays locked, builds movie and episode URLs, and closes playback', async ({ page }) => {
    await page.route('**/private/data.json', r => r.fulfill({ json: payload }));
    await page.route('https://framextv.xyz/**', r => r.fulfill({ body: '<html><body>Player fixture</body></html>', contentType: 'text/html' }));
    await page.goto('/watch/');
    await expect(page).toHaveURL(/private\/#watch/);
    await expect(page.locator('.watch-player')).toHaveCount(0);
    await page.fill('#vault-password', PASSWORD);
    await page.click('#unlock button');
    await expect(page.getByRole('tab', { name: 'Watch', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.fill('#watch-id', '550');
    await page.getByRole('button', { name: 'Load player' }).click();
    await expect(page.locator('.watch-player')).toHaveAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    await expect(page.locator('.watch-player')).toHaveAttribute('src', 'https://framextv.xyz/embed/550?autoplay=0&muted=0&start=0&speed=1&controls=1');
    const embeddedBody = page.frameLocator('.watch-player').locator('body');
    await expect(embeddedBody).toHaveText('Player fixture');
    expect(await embeddedBody.evaluate(() => window.open('about:blank') === null)).toBe(true);
    await page.selectOption('#watch-type', 'tv');
    await page.fill('#watch-id', '1399');
    await page.fill('#watch-season', '2');
    await page.fill('#watch-episode', '3');
    await page.getByRole('button', { name: 'Load player' }).click();
    await expect(page.locator('.watch-player')).toHaveAttribute('src', /embed\/1399\/2\/3\?/);
    await page.getByRole('button', { name: 'Close player' }).click();
    await expect(page.locator('.watch-player')).toBeHidden();
    await expect(page.locator('.watch-player')).not.toHaveAttribute('src');
    await page.reload();
    await expect(page.locator('.watch-player')).toHaveCount(0);
  });

  test('says so when no content has been locked yet', async ({ page }) => {
    await page.route('**/private/data.json', (r) => r.fulfill({ json: { v: 0 } }));
    await page.goto('/private/');
    await expect(page.locator('#unlock-status')).toHaveText("This section isn't set up yet.");
    await expect(page.locator('#unlock button')).toBeDisabled();
  });

  test('only ciphertext is on the site, and search engines are told to skip it', async ({ page }) => {
    const data = JSON.parse(readFileSync(new URL('../private/data.json', import.meta.url), 'utf8'));
    if (data.v === 1) {
      expect(Object.keys(data).sort()).toEqual(['cipher', 'ct', 'iter', 'iv', 'kdf', 'salt', 'v']);
      expect(data.iter).toBeGreaterThanOrEqual(600000);
    }
    expect(JSON.stringify(data)).not.toMatch(/<section|data-tab/);
    await page.goto('/private/');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('study site', () => {
  // Same lock format as /private/ (tools/lock.html), with a small non-secret fixture instead of the real notes.
  const PASSWORD = 'correct horse battery staple';
  let payload;
  test.beforeAll(async () => {
    const enc = new TextEncoder();
    const b64 = (u8) => Buffer.from(u8).toString('base64');
    const text = readFileSync(new URL('./fixtures/study-sample.json', import.meta.url), 'utf8');
    const salt = wc.getRandomValues(new Uint8Array(16));
    const iv = wc.getRandomValues(new Uint8Array(12));
    const base = await wc.subtle.importKey('raw', enc.encode(PASSWORD), 'PBKDF2', false, ['deriveKey']);
    const key = await wc.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 1000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const ct = new Uint8Array(await wc.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text)));
    payload = { v: 1, kdf: 'PBKDF2-SHA256', iter: 1000, cipher: 'AES-256-GCM', salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  });

  test('wrong password is refused; one unlock opens every study page; Lock forgets it', async ({ page }) => {
    const errors = await watch(page);
    const outside = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://localhost')) outside.push(r.url()); });
    await page.route('**/private/study/data.json', (r) => r.fulfill({ json: payload }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/private/study/');
    await expect(page.locator('#study')).toBeHidden();
    await page.fill('#vault-password', 'not the password');
    await page.click('#unlock button');
    await expect(page.locator('#unlock-status')).toHaveText('Wrong password.');
    await page.fill('#vault-password', PASSWORD);
    await page.click('#unlock button');
    await expect(page.locator('.prog-card')).toHaveCount(7);
    for (const path of STUDY.slice(1)) {
      await page.goto(path);
      await expect(page.locator('#study')).toBeVisible();
      await expect(page.locator('#study')).not.toContainText(/\bnull\b|undefined/);
      const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      expect(sw, `no horizontal scroll on ${path}`).toBeLessThanOrEqual(cw);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${path} ${v.id}`)).toEqual([]);
    }
    await page.locator('.study-foot button').click();
    await expect(page.locator('#unlock')).toBeVisible();
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('terminal exercise, scenario, flashcards and quiz work and save progress', async ({ page }) => {
    await page.route('**/private/study/data.json', (r) => r.fulfill({ json: payload }));
    await page.goto('/private/study/linux/');
    await page.fill('#vault-password', PASSWORD);
    await page.click('#unlock button');
    const run = async (c) => { await page.fill('.term-input', c); await page.press('.term-input', 'Enter'); };
    for (const c of ['mkdir lab', 'cd lab', 'touch notes.txt', 'cp notes.txt notes-copy.txt', 'mv notes-copy.txt notes-old.txt', 'rm notes-old.txt']) await run(c);
    await expect(page.locator('.ex-steps li.is-done')).toHaveCount(5);
    await run('ls');
    await expect(page.locator('.term-out')).toContainText('notes.txt');
    await run('rm -rf /');
    await expect(page.locator('.term-out')).toContainText("dangerous to operate recursively on '/'");

    await page.goto('/private/study/troubleshooting/');
    await page.getByRole('button', { name: 'Replace the board' }).click();
    await expect(page.locator('#sc-a .feedback')).toContainText('Too expensive.');
    await page.getByRole('button', { name: 'Check the outlet' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.locator('#sc-a')).toContainText('Outlet inward.');

    await page.goto('/private/study/flashcards/');
    await page.locator('.card-face').click();
    await expect(page.locator('.card-face')).toHaveClass(/is-back/);
    await page.locator('.card-btns .btn.solid').click();

    await page.goto('/private/study/quiz/');
    await page.getByRole('button', { name: 'Start the quiz' }).click();
    for (let i = 0; i < 2; i++) {
      const legend = await page.locator('legend').textContent();
      await page.getByRole('button', { name: legend.endsWith('B') ? 'B' : 'A', exact: true }).click();
      await page.locator('.quiz .btn.solid').click();
    }
    await page.getByRole('button', { name: 'Show the model answer' }).click();
    await page.getByRole('button', { name: 'I covered the key points' }).click();
    await expect(page.locator('.result')).toHaveText('2/2 · 100%');

    await page.goto('/private/study/');
    await expect(page.locator('.prog-card .num')).toHaveText(['0/1', '1/2', '0/1', '1/2', '0/2', '1/2', '100%']);
  });

  test('only ciphertext (or the not-set-up placeholder) is committed', async ({ page }) => {
    const data = JSON.parse(readFileSync(new URL('../private/study/data.json', import.meta.url), 'utf8'));
    if (data.v === 1) {
      expect(Object.keys(data).sort()).toEqual(['cipher', 'ct', 'iter', 'iv', 'kdf', 'salt', 'v']);
      expect(data.iter).toBeGreaterThanOrEqual(600000);
    } else {
      expect(data.v).toBe(0);
      await page.goto('/private/study/');
      await expect(page.locator('#unlock-status')).toHaveText("The study site isn't set up yet.");
    }
    expect(JSON.stringify(data)).not.toMatch(/"sections"|"flashcards"/);
    await page.goto('/private/study/');
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  });
});
