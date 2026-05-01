/**
 * Mobili-Tee form handler Worker
 *
 * Handles two payload types:
 *   1. Email signup (default): { email, source, page, referrer }
 *   2. Club briefing request:  { type: "briefing", name, club, role, email, message, page }
 *
 * Stores submissions in KV (prefixes "subscriber:" and "briefing:") and notifies via Resend.
 *
 * Required secrets (set via `wrangler secret put`):
 *   RESEND_API_KEY
 *   NOTIFY_TO        e.g. chriswrazen@gmail.com
 *   NOTIFY_FROM      e.g. "Mobili-Tee <updates@mobili-tee.com>"
 *
 * KV binding: SUBSCRIBERS (configured in wrangler.toml)
 */

const ALLOWED_ORIGINS = [
  "https://mobili-tee.com",
  "https://www.mobili-tee.com",
  "https://mobili-tee.pages.dev",
  "http://localhost:8788",
  "http://127.0.0.1:8788"
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
}

function clip(s, n) {
  return String(s == null ? "" : s).slice(0, n);
}

async function sendEmailNotification(env, subject, body) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_TO || !env.NOTIFY_FROM) {
    return { ok: false, skipped: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.NOTIFY_FROM,
      to: env.NOTIFY_TO,
      subject,
      text: body
    })
  });
  return { ok: res.ok, status: res.status };
}

async function handleSignup(body, request, env) {
  const email = clip(body.email, 254).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { error: "Invalid email", status: 400 };
  }

  const record = {
    email,
    source: clip(body.source, 64),
    page: clip(body.page, 256),
    referrer: clip(body.referrer, 256),
    ip: request.headers.get("CF-Connecting-IP") || "",
    country: request.cf?.country || "",
    ua: request.headers.get("User-Agent") || "",
    timestamp: new Date().toISOString()
  };

  if (env.SUBSCRIBERS) {
    await env.SUBSCRIBERS.put(`subscriber:${email}`, JSON.stringify(record));
  }

  const notified = await sendEmailNotification(
    env,
    `New Mobili-Tee signup: ${email}`,
    [
      `New signup on mobili-tee.com`,
      ``,
      `Email:    ${record.email}`,
      `Source:   ${record.source || "unknown"}`,
      `Page:     ${record.page || ""}`,
      `Referrer: ${record.referrer || ""}`,
      `Country:  ${record.country || ""}`,
      `Time:     ${record.timestamp}`
    ].join("\n")
  ).catch((err) => {
    console.error("notify failed", err);
    return { ok: false };
  });

  return { ok: true, notified: notified.ok === true };
}

async function handleBriefing(body, request, env) {
  const name = clip(body.name, 120).trim();
  const club = clip(body.club, 160).trim();
  const role = clip(body.role, 120).trim();
  const email = clip(body.email, 254).trim().toLowerCase();
  const message = clip(body.message, 1500).trim();

  if (!name || !club || !role || !EMAIL_RE.test(email)) {
    return { error: "Missing required fields", status: 400 };
  }

  const record = {
    type: "briefing",
    name,
    club,
    role,
    email,
    message,
    page: clip(body.page, 256),
    ip: request.headers.get("CF-Connecting-IP") || "",
    country: request.cf?.country || "",
    ua: request.headers.get("User-Agent") || "",
    timestamp: new Date().toISOString()
  };

  if (env.SUBSCRIBERS) {
    const key = `briefing:${record.timestamp}:${email}`;
    await env.SUBSCRIBERS.put(key, JSON.stringify(record));
  }

  const notified = await sendEmailNotification(
    env,
    `Mobili-Tee club briefing request: ${club}`,
    [
      `New club briefing request from mobili-tee.com`,
      ``,
      `Name:    ${record.name}`,
      `Club:    ${record.club}`,
      `Role:    ${record.role}`,
      `Email:   ${record.email}`,
      `Country: ${record.country || ""}`,
      `Time:    ${record.timestamp}`,
      ``,
      `Message:`,
      record.message || "(none)"
    ].join("\n")
  ).catch((err) => {
    console.error("briefing notify failed", err);
    return { ok: false };
  });

  return { ok: true, notified: notified.ok === true };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400, headers: cors });
    }

    // Honeypot — silently succeed.
    if (body.company || body.website || body.phone_number) {
      return json({ ok: true }, { status: 200, headers: cors });
    }

    let result;
    try {
      if (body.type === "briefing") {
        result = await handleBriefing(body, request, env);
      } else {
        result = await handleSignup(body, request, env);
      }
    } catch (err) {
      console.error("handler error", err);
      return json({ error: "Server error" }, { status: 500, headers: cors });
    }

    if (result.error) {
      return json({ error: result.error }, { status: result.status || 400, headers: cors });
    }
    return json({ ok: true, notified: result.notified === true }, { status: 200, headers: cors });
  }
};
