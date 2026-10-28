# dragonsmithers.com

Darshan Sanjel's personal site: a résumé/portfolio homepage and a blog.

It's plain HTML, CSS and JavaScript served by GitHub Pages. **There is no build step.** Edit a file,
push to `main`, and it's live a minute later. Everything in `package.json` (tests, Lighthouse, image,
font and PDF tools) is for development only and never needed for the site to work.

```
index.html                  Homepage: intro, projects, latest posts, skills, experience, HTML résumé, contact
resume.pdf                  One-page résumé, generated from the homepage (npm run resume)
blog/index.html             Blog: every post
blog/<slug>/index.html      Posts (wazuh-siem, proxmox-lab, trail-window)
portfolio/, business/,      Redirects from old addresses, so existing links keep working.
privacy/                    Safe to delete once nothing links to them.
404.html                    "Page not found"
style.css                   The whole design system: palette tokens at the top, motion at the bottom
site.js                     Scroll reveals, copy button, résumé printing, post table of contents, analytics
fonts/                      Self-hosted, subset Archivo + IBM Plex Mono (OFL)
og/                         1200×630 social cards
CNAME                       dragonsmithers.com (don't touch)
```

## Fill in the TODOs

Every unconfirmed fact is marked with an HTML comment. List them all:

```sh
grep -rn "TODO(darshan)" --include=*.html --include=*.js .
```

Optional: paste a Cloudflare Web Analytics token into `CF_ANALYTICS_TOKEN` at the top of `site.js`.
Leave it empty and no analytics load at all.

## Common edits

### Update the résumé
`resume.pdf` is generated from the HTML résumé in `index.html` (the `#resume` section), so edit that, then
run `npm run resume` and commit both files. The script fails if the résumé no longer fits on one page;
the print-only sizing lives under `body.print-resume` in `style.css`.

### Write a blog post
1. Copy `blog/trail-window/` to `blog/<new-slug>/` and rewrite it. The existing posts use five sections
   (problem, setup, architecture, what broke, what's next), but a post can be any shape: keep the header,
   footer and `<head>`, and change the title, description, canonical URL and `og:` tags.
2. Diagrams are inline SVG. Use the classes `box`, `box hot`, `zone`, `wire`, `wire dash`, `t`, `s`
   and `z` so they pick up the site's colors. Give every marker id a unique prefix.
3. Add a card for it at the top of the list in `blog/index.html` (copy an `<article class="post-card">`),
   and in the "From the blog" section of `index.html` if it should show on the homepage.
4. Update the "Previous / Next" links at the bottom of the neighboring posts.
5. Add it to `sitemap.xml`, to `PAGES` in `tests/site.spec.mjs` (and the list in the blog test), and give
   it a social card in `tools/og-images.mjs`, then run `npm run og`.

### Header, footer or `<head>` changes
Each page carries its own copy (no build step), so change every page in `index.html`, `blog/` and
`404.html` the same way. If you add an inline `<script>`, the Content-Security-Policy meta tag will
block it: put code in `site.js`.

## Run the checks

```sh
npm install
npm test            # Playwright: every page at 390/768/1280, links, redirects, motion, axe
npm run lhci        # Lighthouse CI (start `npm run serve` in another terminal first)
node tools/audit.mjs http://localhost:8080 audit-out   # full audit with screenshots (start `npm run serve` first)
```

Other tools: `npm run og` regenerates social cards and icons; `npm run fonts` re-subsets the fonts
(needs `pip install fonttools brotli`).

Pull requests run the same tests and Lighthouse CI in GitHub Actions (`.github/workflows/checks.yml`).
Pushes to `main` are deployed by GitHub Pages and are never blocked by these checks.

## Security headers

GitHub Pages can't set custom HTTP headers, so each page sets what it can in `<meta>` tags:
a Content-Security-Policy (only this site and Cloudflare analytics are allowed) and a
`strict-origin-when-cross-origin` referrer policy. Headers that only work as real HTTP headers
(`frame-ancestors`/`X-Frame-Options`, `Strict-Transport-Security` preload, `Permissions-Policy`,
`X-Content-Type-Options`) need a proxy such as Cloudflare in front of Pages.
