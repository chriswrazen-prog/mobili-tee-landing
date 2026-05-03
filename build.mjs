#!/usr/bin/env node
/**
 * Mobili-Tee build step.
 *
 * Copies static files from the repo root into ./dist, hashes long-lived
 * assets (styles.css, script.js) into their filenames, and rewrites the
 * references in index.html so the deployed HTML always points at the
 * fresh hashed filenames. The hashed assets get aggressive long-term
 * cache headers; the HTML stays uncached so new hashed references are
 * picked up immediately on the next request.
 *
 * Usage:
 *   node build.mjs
 *
 * Cloudflare Pages build settings:
 *   Build command:           npm run build
 *   Build output directory:  dist
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const OUT = path.join(ROOT, "dist");

// Files to copy verbatim into dist (no hashing). Keep this list explicit
// so we don't accidentally ship build/dev artifacts.
const STATIC_COPY = [
  "favicon.svg",
  "apple-touch-icon.png",
  "og-image.jpg",
  "founder-placeholder.svg",
  "site.webmanifest",
  "robots.txt",
  "sitemap.xml",
  "privacy.html",
  "terms.html"
];

// Files to hash. Shape: { src, hashedNamePattern, refReplacements: [{ in, find, replace }] }
const HASHED = [
  {
    src: "styles.css",
    pattern: (h) => `styles.${h}.css`
  },
  {
    src: "script.js",
    pattern: (h) => `script.${h}.js`
  }
];

const log = (msg) => console.log(`[build] ${msg}`);

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function copyIfExists(src, dest) {
  try {
    await fs.copyFile(src, dest);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

async function main() {
  log(`cleaning ${OUT}`);
  await rmrf(OUT);
  await fs.mkdir(OUT, { recursive: true });

  // 1. Hash long-lived assets and write them into dist with hashed names.
  const refMap = {}; // original filename -> hashed filename
  for (const item of HASHED) {
    const buf = await fs.readFile(path.join(ROOT, item.src));
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 8);
    const outName = item.pattern(hash);
    await fs.writeFile(path.join(OUT, outName), buf);
    refMap[item.src] = outName;
    log(`hashed ${item.src} -> ${outName} (${buf.length} bytes)`);
  }

  // 2. Copy verbatim static files.
  for (const f of STATIC_COPY) {
    const ok = await copyIfExists(path.join(ROOT, f), path.join(OUT, f));
    if (ok) log(`copied ${f}`);
    else log(`skipped ${f} (not present)`);
  }

  // 3. Copy _headers, but rewrite the cache rules for hashed assets and HTML.
  const headersSrc = await fs.readFile(path.join(ROOT, "_headers"), "utf8");
  // Strip the old generic /*.css and /*.js blocks; replace with hashed-specific rules.
  // Keep all other rules intact (security headers, image cache, etc.).
  let headers = headersSrc;
  // Remove the /*.css and /*.js blocks (header line + indented Cache-Control line + trailing blank).
  headers = headers.replace(/\n\/\*\.css\n[ \t]+Cache-Control:[^\n]*\n/g, "\n");
  headers = headers.replace(/\n\/\*\.js\n[ \t]+Cache-Control:[^\n]*\n/g, "\n");
  // Append the new, more precise cache rules.
  if (!headers.endsWith("\n")) headers += "\n";
  headers += `
# Hashed assets — content addressed, safe to cache forever.
/styles.*.css
  Cache-Control: public, max-age=31536000, immutable

/script.*.js
  Cache-Control: public, max-age=31536000, immutable

# HTML — never cached so new hashed references are picked up immediately.
/
  Cache-Control: public, max-age=0, must-revalidate

/index.html
  Cache-Control: public, max-age=0, must-revalidate
`;
  await fs.writeFile(path.join(OUT, "_headers"), headers);
  log("wrote _headers (with hashed-asset rules)");

  // 4. Rewrite index.html to reference hashed assets.
  let html = await fs.readFile(path.join(ROOT, "index.html"), "utf8");
  for (const [orig, hashed] of Object.entries(refMap)) {
    // Match /<orig> as href or src — be specific so we don't rewrite
    // similar substrings elsewhere.
    const re = new RegExp(
      `((?:href|src)\\s*=\\s*["'])\\/${orig.replace(/\./g, "\\.")}(["'])`,
      "g"
    );
    const before = html;
    html = html.replace(re, `$1/${hashed}$2`);
    if (html === before) {
      console.warn(`[build] WARNING: no reference to /${orig} found in index.html`);
    } else {
      log(`rewrote ${orig} reference -> /${hashed}`);
    }
  }
  await fs.writeFile(path.join(OUT, "index.html"), html);
  log("wrote index.html");

  log(`done — output in ${path.relative(ROOT, OUT)}/`);
}

main().catch((err) => {
  console.error("[build] FAILED");
  console.error(err);
  process.exit(1);
});
