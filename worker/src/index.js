/**
 * Mobili-Tee email capture Worker
 *
 * Stores submissions in a KV namespace and sends a notification via Resend.
 * Set the following bindings/secrets via `wrangler secret put`:
 *
 *   wrangler secret put RESEND_API_KEY
 *   wrangler secret put NOTIFY_TO        # e.g. notifications@mobili-tee.com
 *   wrangler secret put NOTIFY_FROM      # e.g. "Mobili-Tee <updates@mobili-tee.com>"
 *
 * KV namespace binding: SUBSCRIBERS  (configured in wrangler.toml)
 *
 * To change the recipient later, run:
 *   wrangler secret put NOTIFY_TO
 */

const ALLOWED_ORIGINS = [
  "https://mobili-tee.com",
  "https://www.mobili-tee.com",
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

async function sendEmailNotification(env, payload) {
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
      subject: `New Mobili-Tee signup: ${payload.email}`,
      text:
        `New signup on mobili-tee.com\n\n` +
        `Email:    ${payload.email}\n` +
        `Source:   ${payload.source || "unknown"}\n` +
        `Page:     ${payload.page || ""}\n` +
        `Referrer: ${payload.referrer || ""}\n` +
        `Time:     ${payload.timestamp}\n`
    })
  });
  return { ok: res.ok, status: res.status };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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

    const email = (body.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return json({ error: "Invalid email" }, { status: 400, headers: cors });
    }

    // Honeypot — if a hidden field is filled, drop silently with 200.
    if (body.website || body.phone_number) {
      return json({ ok: true }, { status: 200, headers: cors });
    }

    const record = {
      email,
      source: String(body.source || "").slice(0, 64),
      page: String(body.page || "").slice(0, 256),
      referrer: String(body.referrer || "").slice(0, 256),
      ip: request.headers.get("CF-Connecting-IP") || "",
      country: request.cf?.country || "",
      ua: request.headers.get("User-Agent") || "",
      timestamp: new Date().toISOString()
    };

    if (env.SUBSCRIBERS) {
      const key = `subscriber:${email}`;
      await env.SUBSCRIBERS.put(key, JSON.stringify(record));
    }

    const notified = await sendEmailNotification(env, record).catch((err) => {
      console.error("notify failed", err);
      return { ok: false };
    });

    return json({ ok: true, notified: notified.ok === true }, { status: 200, headers: cors });
  }
};
