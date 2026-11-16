// Generates the 1200x630 Open Graph cards in /og and the PNG/ICO app icons from favicon.svg.
// Dev-only (Playwright renders an SVG to PNG). Run: npm run og
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const fonts = pathToFileURL(join(root, 'fonts')).href;
const tmp = mkdtempSync(join(tmpdir(), 'og-'));
mkdirSync(join(root, 'og'), { recursive: true });

const cards = [
  { file: 'home', kicker: 'Cybersecurity · IT support · Systems & networking', title: ['Darshan Sanjel'], foot: 'Wazuh SIEM · Proxmox VE lab · Help desk · Fairfield, OH' },
  { file: 'blog', kicker: 'Blog', title: ['Notes from the lab.'], foot: 'Darshan Sanjel · dragonsmithers.com/blog', brand: 'Blog' },
  { file: 'wazuh-siem', kicker: 'Blog · Wazuh 4.14 · Ubuntu 24.04', title: ['A self-hosted SIEM that', 'drafts its own write-ups.'], foot: 'Darshan Sanjel · dragonsmithers.com/blog', brand: 'Blog' },
  { file: 'proxmox-lab', kicker: 'Blog · Proxmox VE 9 · LXC · Tailscale', title: ['A repurposed laptop', 'running my whole lab.'], foot: 'Darshan Sanjel · dragonsmithers.com/blog', brand: 'Blog' },
  { file: 'trail-window', kicker: 'Blog · JavaScript · Cloudflare Workers', title: ['A weather planner with a', 'locked-down AI briefing.'], foot: 'Darshan Sanjel · dragonsmithers.com/blog', brand: 'Blog' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const card = ({ kicker, title, foot, brand = 'dragonsmithers.com' }) => {
  const big = title.length === 1;
  const size = big ? 100 : 62;
  const lines = title.map((t, i) => `<text x="80" y="${big ? 350 : 300 + i * (size + 10)}" class="h" font-size="${size}">${esc(t)}</text>`).join('');
  return `<!doctype html><html><head><style>
@font-face { font-family: A; src: url("${fonts}/archivo-var.woff2"); font-weight: 400 800; }
@font-face { font-family: M; src: url("${fonts}/plex-mono-400.woff2"); }
@font-face { font-family: M; src: url("${fonts}/plex-mono-600.woff2"); font-weight: 600; }
html, body { margin: 0; } svg { display: block; }
.h { font-family: A; font-weight: 800; font-variation-settings: "wdth" 125; fill: #F1E9E6; letter-spacing: -1.5px; }
.m { font-family: M; fill: #B3A5A1; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; }
.b { font-family: A; font-weight: 800; font-variation-settings: "wdth" 125; fill: #F1E9E6; font-size: 34px; }
</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="sc" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.5" fill="#E5392C" fill-opacity=".14"/></pattern>
    <radialGradient id="glow" cx="85%" cy="45%" r="60%"><stop offset="0" stop-color="#B3201A" stop-opacity=".55"/><stop offset="1" stop-color="#B3201A" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0A0607"/><rect width="1200" height="630" fill="url(#sc)"/><rect width="1200" height="630" fill="url(#glow)"/>
  <g transform="translate(80 70)">
    <g transform="scale(.84375)"><rect width="64" height="64" rx="12" fill="#0A0607"/><path fill="#E5392C" d="M15.5 12.5 H30 C43.5 12.5 50.5 21.5 50.5 32 C50.5 42.5 43.5 51.5 30 51.5 H15.5 Z"/><path fill="#FF7A3D" d="M31 17 C42.5 25.7 42.5 38.3 31 47 C19.5 38.3 19.5 25.7 31 17 Z"/><path fill="#0A0607" d="M35.13 23.65 L34.99 23.32 L34.79 23.01 L34.56 22.72 L34.30 22.44 L34.02 22.19 L33.72 21.95 L33.40 21.74 L33.06 21.55 L32.71 21.38 L32.34 21.24 L31.96 21.13 L31.57 21.04 L31.18 20.98 L30.78 20.95 L30.37 20.94 L29.97 20.97 L29.56 21.02 L29.16 21.10 L28.76 21.21 L28.37 21.35 L27.99 21.51 L27.62 21.71 L27.26 21.92 L26.92 22.17 L26.59 22.44 L26.28 22.73 L25.99 23.04 L25.72 23.38 L25.48 23.73 L25.26 24.10 L25.06 24.49 L24.90 24.89 L24.76 25.30 L24.64 25.72 L24.56 26.15 L24.51 26.58 L24.48 27.02 L24.49 27.46 L24.53 27.90 L24.60 28.34 L24.70 28.77 L24.83 29.20 L24.98 29.61 L25.17 30.02 L25.38 30.41 L25.63 30.79 L25.89 31.15 L26.18 31.49 L26.50 31.81 L26.84 32.10 L27.19 32.38 L27.57 32.63 L27.96 32.85 L28.37 33.05 L28.78 33.21 L29.21 33.35 L29.65 33.46 L30.10 33.54 L30.55 33.58 L30.93 33.60 L31.18 33.61 L31.36 33.62 L31.54 33.65 L31.72 33.69 L31.90 33.74 L32.07 33.81 L32.24 33.88 L32.40 33.96 L32.56 34.06 L32.71 34.16 L32.85 34.28 L32.99 34.40 L33.12 34.54 L33.24 34.68 L33.36 34.83 L33.46 34.98 L33.55 35.15 L33.64 35.32 L33.71 35.50 L33.77 35.68 L33.82 35.86 L33.86 36.05 L33.88 36.25 L33.90 36.44 L33.90 36.64 L33.89 36.84 L33.86 37.03 L33.82 37.23 L33.77 37.43 L33.71 37.62 L33.63 37.81 L33.54 38.00 L33.44 38.18 L33.32 38.35 L33.20 38.52 L33.06 38.68 L32.91 38.84 L32.75 38.98 L32.58 39.12 L32.39 39.24 L32.20 39.36 L32.00 39.46 L31.79 39.55 L31.58 39.63 L31.36 39.69 L31.13 39.74 L30.89 39.78 L30.66 39.80 L30.42 39.80 L30.17 39.79 L29.93 39.76 L29.68 39.72 L29.44 39.66 L29.19 39.59 L28.95 39.50 L28.71 39.39 L28.47 39.27 L28.23 39.14 L27.99 38.99 L27.72 38.84 L26.87 39.55 L27.01 39.88 L27.21 40.19 L27.44 40.48 L27.70 40.76 L27.98 41.01 L28.28 41.25 L28.60 41.46 L28.94 41.65 L29.29 41.82 L29.66 41.96 L30.04 42.07 L30.43 42.16 L30.82 42.22 L31.22 42.25 L31.63 42.26 L32.03 42.23 L32.44 42.18 L32.84 42.10 L33.24 41.99 L33.63 41.85 L34.01 41.69 L34.38 41.49 L34.74 41.28 L35.08 41.03 L35.41 40.76 L35.72 40.47 L36.01 40.16 L36.28 39.82 L36.52 39.47 L36.74 39.10 L36.94 38.71 L37.10 38.31 L37.24 37.90 L37.36 37.48 L37.44 37.05 L37.49 36.62 L37.52 36.18 L37.51 35.74 L37.47 35.30 L37.40 34.86 L37.30 34.43 L37.17 34.00 L37.02 33.59 L36.83 33.18 L36.62 32.79 L36.37 32.41 L36.11 32.05 L35.82 31.71 L35.50 31.39 L35.16 31.10 L34.81 30.82 L34.43 30.57 L34.04 30.35 L33.63 30.15 L33.22 29.99 L32.79 29.85 L32.35 29.74 L31.90 29.66 L31.45 29.62 L31.07 29.60 L30.82 29.59 L30.64 29.58 L30.46 29.55 L30.28 29.51 L30.10 29.46 L29.93 29.39 L29.76 29.32 L29.60 29.24 L29.44 29.14 L29.29 29.04 L29.15 28.92 L29.01 28.80 L28.88 28.66 L28.76 28.52 L28.64 28.37 L28.54 28.22 L28.45 28.05 L28.36 27.88 L28.29 27.70 L28.23 27.52 L28.18 27.34 L28.14 27.15 L28.12 26.95 L28.10 26.76 L28.10 26.56 L28.11 26.36 L28.14 26.17 L28.18 25.97 L28.23 25.77 L28.29 25.58 L28.37 25.39 L28.46 25.20 L28.56 25.02 L28.68 24.85 L28.80 24.68 L28.94 24.52 L29.09 24.36 L29.25 24.22 L29.42 24.08 L29.61 23.96 L29.80 23.84 L30.00 23.74 L30.21 23.65 L30.42 23.57 L30.64 23.51 L30.87 23.46 L31.11 23.42 L31.34 23.40 L31.58 23.40 L31.83 23.41 L32.07 23.44 L32.32 23.48 L32.56 23.54 L32.81 23.61 L33.05 23.70 L33.29 23.81 L33.53 23.93 L33.77 24.06 L34.01 24.21 L34.28 24.36 Z"/></g>
    <text x="74" y="39" class="b">${esc(brand)}</text>
  </g>
  <text x="80" y="${big ? 240 : 220}" class="m">${esc(kicker)}</text>
  ${lines}
  <rect x="80" y="498" width="72" height="5" rx="2.5" fill="#E5392C"/>
  <text x="80" y="574" class="m" font-size="22" style="text-transform:none;letter-spacing:.5px">${esc(foot)}</text>
</svg></body></html>`;
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const c of cards) {
  const f = join(tmp, `${c.file}.html`);
  writeFileSync(f, card(c));
  await page.goto(pathToFileURL(f).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(root, 'og', `${c.file}.png`) });
  console.log(`og/${c.file}.png`);
}

// App icons from favicon.svg. The apple-touch icon gets a full-bleed square (iOS rounds it).
const svg = readFileSync(join(root, 'favicon.svg'), 'utf8');
const icons = [['apple-touch-icon.png', 180, true], ['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['favicon-32.png', 32, false]];
for (const [name, size, bleed] of icons) {
  const inner = bleed ? svg.replace('rx="12"', 'rx="0"') : svg;
  const pad = name.includes('maskable') ? size * 0.1 : 0;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${bleed ? '#0A0607' : 'transparent'}"><div style="width:${size}px;height:${size}px;padding:${pad}px;box-sizing:border-box">${inner.replace('<svg ', `<svg width="${size - 2 * pad}" height="${size - 2 * pad}" `)}</div></body></html>`);
  await page.screenshot({ path: join(root, name), omitBackground: !bleed });
  console.log(name);
}
await browser.close();

// favicon.ico: a single 32x32 PNG wrapped in an ICO container.
const png = readFileSync(join(root, 'favicon-32.png'));
const hdr = Buffer.alloc(22);
hdr.writeUInt16LE(0, 0); hdr.writeUInt16LE(1, 2); hdr.writeUInt16LE(1, 4);
hdr.writeUInt8(32, 6); hdr.writeUInt8(32, 7); hdr.writeUInt16LE(1, 10); hdr.writeUInt16LE(32, 12);
hdr.writeUInt32LE(png.length, 14); hdr.writeUInt32LE(22, 18);
writeFileSync(join(root, 'favicon.ico'), Buffer.concat([hdr, png]));
console.log('favicon.ico');
unlinkSync(join(root, 'favicon-32.png'));
