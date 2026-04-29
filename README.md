# Mobili-Tee Landing

A premium "coming soon" marketing page for **Mobili-Tee** — a private-club assisted stretching amenity launching at Radley Run Country Club in 2026.

Plain HTML + CSS + a sliver of vanilla JS. No build step. Deploys to Cloudflare Pages by uploading the repo as-is.

---

## Repo layout

```
mobili-tee-landing/
├── index.html            ← the page
├── styles.css            ← all styling (design tokens at the top)
├── script.js             ← form handler + scroll reveals
├── favicon.svg
├── _headers              ← Cloudflare Pages security + cache headers
├── robots.txt
├── sitemap.xml
└── worker/               ← optional Cloudflare Worker for the email form
    ├── src/index.js
    └── wrangler.toml
```

---

## How to update content

All copy lives in [index.html](index.html). Open it in any text editor and edit between the tags. Common changes:

| What you want to change         | Where it lives                                                  |
| ------------------------------- | --------------------------------------------------------------- |
| Hero tagline                    | `<p class="hero__tagline">…</p>`                                |
| Hero intro line                 | `<p class="hero__intro">…</p>`                                  |
| "What is Mobili-Tee" paragraphs | `<div class="about__copy">…</div>`                              |
| Experience bullet list          | `<ul class="experience-card__list">…</ul>`                      |
| 3-up value props                | `<article class="why-card">` blocks                             |
| Final email-capture copy        | inside `<section class="section--capture">`                     |
| Footer copyright / legal        | `<footer class="footer">`                                       |

**Brand colors** (e.g. swap the gold) are defined as CSS variables at the top of [styles.css](styles.css) under `:root { … }`. Change the value once and it propagates everywhere.

**Example — change the hero tagline:**
1. Open `index.html`.
2. Find `A Premium On-Property Stretch &amp; Recovery Amenity`.
3. Replace it with your new copy.
4. `git add index.html && git commit -m "Update hero tagline" && git push`.
5. Cloudflare Pages auto-deploys in ~30 seconds.

---

## Email capture — how it works

`script.js` looks for one of two endpoints, in this order:

1. **`FORM_ENDPOINT`** — your Cloudflare Worker URL (preferred, see below).
2. **`FORMSPREE_ID`** — a [Formspree](https://formspree.io) form ID (3-minute setup, free tier).

Both are blank by default, so the form will currently show a success state without sending anything. **Pick one** and fill in the constant near the top of `script.js`.

### Option A — Formspree (fastest, no code)

1. Sign up at https://formspree.io (free).
2. Create a new form. Copy the form ID (the slug after `/f/` — e.g. `xpwrlbjk`).
3. In `script.js`, set:
   ```js
   var FORMSPREE_ID = "xpwrlbjk";
   ```
4. Commit and push.

To change the recipient address: log into Formspree → form settings → recipients.

### Option B — Cloudflare Worker (preferred, custom)

The `worker/` folder is a self-contained Worker that:
- validates the email,
- stores the submission in a KV namespace,
- sends a notification email via [Resend](https://resend.com) (free tier).

**One-time setup:**

```bash
# from the repo root
cd worker
npx wrangler login                        # opens browser to authenticate
npx wrangler kv:namespace create SUBSCRIBERS
# → copy the printed `id = "..."` into wrangler.toml

npx wrangler secret put RESEND_API_KEY    # paste your Resend API key
npx wrangler secret put NOTIFY_TO         # the inbox to alert (e.g. notifications@mobili-tee.com)
npx wrangler secret put NOTIFY_FROM       # verified sender, e.g. "Mobili-Tee <updates@mobili-tee.com>"

npx wrangler deploy
# → copy the printed worker URL
```

Then in `script.js`:
```js
var FORM_ENDPOINT = "https://mobili-tee-form.<your-account>.workers.dev";
```

**To change the recipient later:**
```bash
cd worker
npx wrangler secret put NOTIFY_TO
# paste the new address when prompted
```

**To export collected emails:**
```bash
npx wrangler kv:key list --binding SUBSCRIBERS
# or fetch a single record:
npx wrangler kv:key get "subscriber:someone@example.com" --binding SUBSCRIBERS
```

---

## Local preview

No build step required. Any of these works:

```bash
# Python
python -m http.server 8000

# Node
npx serve .

# or just open index.html in a browser
```

Then visit http://localhost:8000.

---

## Deploying to Cloudflare Pages

Done once. After that, every `git push` to `main` deploys automatically.

1. Push this repo to GitHub.
2. In the Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Pick the GitHub repo. Settings:
   - **Framework preset:** None
   - **Build command:** *(leave blank)*
   - **Build output directory:** `/`
4. Save and deploy. The first deploy takes ~30 seconds.
5. **Custom domain:** in the new Pages project → **Custom domains** → **Set up a domain** → enter `mobili-tee.com` and `www.mobili-tee.com`. Cloudflare configures DNS automatically if the zone is on the same account.
6. SSL provisions automatically.

---

## Brand reference

| Token       | Hex       | Usage                          |
| ----------- | --------- | ------------------------------ |
| `--primary` | `#2F4F3E` | Forest green — dominant        |
| `--secondary` | `#84B59F` | Sage green — accents           |
| `--accent`  | `#C9A961` | Warm gold — accents only       |
| `--cream`   | `#F5F1E8` | Warm off-white background      |
| `--charcoal` | `#2C2C2C` | Body text                      |
| `--muted`   | `#7A8B7F` | Secondary text                 |

Wordmark renders **MOBILI** in cream and **-TEE** in gold.

---

© 2026 Wrazen Holdings LLC d/b/a Mobili-Tee. Trademark pending.
