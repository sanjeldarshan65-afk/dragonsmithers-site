import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = ['/', '/blog/', '/blog/wazuh-siem/', '/blog/proxmox-lab/', '/blog/trail-window/'];
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
  for (const path of PAGES) {
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
      const hidden = await page.$$eval('[data-reveal]', (els) => els.filter((e) => getComputedStyle(e).opacity !== '1').length);
      expect(hidden, path).toBe(0);
    }
    await ctx.close();
  });

  test('every reveal target is fully visible after scrolling through', async ({ page }) => {
    await watch(page);
    for (const path of PAGES) {
      await page.goto(path);
      await settle(page);
      const stuck = await page.$$eval('[data-reveal]', (els) => els.filter((e) => !e.classList.contains('in') || getComputedStyle(e).opacity !== '1').map((e) => e.className || e.tagName));
      expect(stuck, path).toEqual([]);
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
