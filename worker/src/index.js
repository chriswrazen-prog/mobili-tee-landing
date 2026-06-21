/**
 * Mobili-Tee form handler Worker
 *
 * Handles three payload types:
 *   1. Email/member signup (default):
 *        { email, name?, phone?, club?, what_brought_you?, source, page, referrer }
 *   2. Club briefing request:
 *        { type: "briefing", name, club, role, email, message, page }
 *   3. Mobility-Specialist application:
 *        { type: "application", name, email, phone, current_role,
 *          years_experience?, certifications?, why_interested?,
 *          linkedin_url?, source, page }
 *
 * KV storage uses the prefixes:
 *   subscriber:<email>
 *   briefing:<timestamp>:<email>
 *   application:<timestamp>:<email>
 *
 * Required Cloudflare Worker secrets:
 *   RESEND_API_KEY, NOTIFY_TO, NOTIFY_FROM
 *
 * Optional Cloudflare Worker secrets (auto-reply feature):
 *   AUTO_REPLY_ENABLED  set to "true" to send personalized auto-replies to submitters
 *   ANTHROPIC_API_KEY   required for AI-personalized signup auto-replies (Claude Haiku)
 *   AUTO_REPLY_BCC      optional, BCC address for every auto-reply (recommended during shakedown)
 *   AUTO_REPLY_REPLY_TO optional, Reply-To address (defaults to NOTIFY_TO)
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
    headers: { "Content-Type": "application/json", ...(init.headers || {}) }
  });
}

function clip(s, n) {
  return String(s == null ? "" : s).slice(0, n);
}

function orNone(s) {
  const t = (s || "").trim();
  return t || "(not provided)";
}

async function sendEmailNotification(env, subject, body) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_TO || !env.NOTIFY_FROM) {
    return { ok: false, skipped: true };
  }
  const payload = {
    from: env.NOTIFY_FROM,
    to: env.NOTIFY_TO,
    subject,
    text: body
  };
  // NOTIFY_CC (comma-separated) gets copied on every notification.
  if (env.NOTIFY_CC) {
    const cc = env.NOTIFY_CC.split(",").map((s) => s.trim()).filter(Boolean);
    if (cc.length) payload.cc = cc;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return { ok: res.ok, status: res.status };
}

// ---------------------------------------------------------------------------
// Auto-reply
//
// Sends a personalized "got your note" reply to the form submitter. Runs in
// the background via ctx.waitUntil so it never delays the response to the
// browser. Failures are swallowed - the auto-reply is best-effort.
// ---------------------------------------------------------------------------

function firstNameOf(full) {
  return (full || "").trim().split(/\s+/)[0] || "there";
}

function clubCloser(club) {
  if (club === "Radley Run") {
    return "If you're at Radley Run before then, find me. I'll likely be the one stretching too long after a round.";
  }
  return "Reach out anytime if questions come up.";
}

async function generateSignupMiddle(record, env) {
  if (!env.ANTHROPIC_API_KEY) return "";

  const first = firstNameOf(record.name);
  const club = record.club || "(unspecified)";
  const note = (record.what_brought_you || "").trim() || "(left blank)";

  const prompt = [
    "You are writing a short auto-reply email FROM Chris Wrazen, founder of Mobili-Tee, TO a person who just signed up on the site.",
    "",
    "Mobili-Tee context:",
    "- Premium assisted-stretching service that operates inside private country clubs",
    "- Independent: members book and pay through Mobili-Tee directly, not the club",
    "- HSA/FSA reimbursement available via Truemed",
    "- Launching at Radley Run Country Club on June 22, 2026",
    "- Chris is a fixed-income guy, longtime golfer, longtime country club member",
    "- Brand voice: confident, premium, country-club-appropriate, understated",
    "",
    "Person who signed up:",
    `- First name: ${first}`,
    `- Their country club selection: ${club}`,
    `- What they wrote when asked \"what brought you here?\": ${note}`,
    "",
    "Your job: Write 2-3 sentences (about 30-50 words total) that go in the MIDDLE of the email. There is a \"Hey " + first + ",\" before and a sign-off after - do not write those.",
    "",
    "Specifically respond to what they wrote, if anything. If they left the box blank, write a warm one-liner about the launch or their club. Use second person.",
    "",
    "Hard rules:",
    "- No em dashes. Use hyphens.",
    "- No exclamation points.",
    "- Never write \"thank you for your interest\", \"I am thrilled\", \"we are excited\", \"amazing\", \"fantastic\", \"looking forward\", \"reach out\" as a verb phrase.",
    "- Do not sound like marketing copy. Sound like Chris dashed off a reply from his phone between holes.",
    "- No bullet lists, no headers, no formatting.",
    "- Output ONLY the 2-3 sentences. No greeting, no signoff, no quotes, no explanations."
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data.content?.[0]?.text || "").trim();
  // Defensive scrub - strip em dashes if Claude slipped any in.
  return text.replace(/—/g, "-").replace(/–/g, "-");
}

async function buildSignupReply(record, env) {
  const first = firstNameOf(record.name);
  let middle = "";
  try {
    middle = await generateSignupMiddle(record, env);
  } catch (err) {
    console.error("AI middle generation failed:", err);
  }
  if (!middle) {
    // Fallback if AI key missing or call failed.
    middle = record.what_brought_you
      ? "Appreciate you taking a moment to say what brought you here. The kind of recovery work we're building belongs in the spaces you already care about, and I'm glad you found us early."
      : "Glad you're on the early list. The kind of recovery work we're building belongs in the spaces you already care about, and I'm glad you found us before launch.";
  }
  const subject = `Quick note from Mobili-Tee, ${first}`;
  const body = [
    `Hey ${first},`,
    ``,
    middle,
    ``,
    `I'll be in touch as we get closer to launch. ${clubCloser(record.club)}`,
    ``,
    `- Chris`,
    `Mobili-Tee`
  ].join("\n");
  return { subject, body };
}

function buildApplicationReply(record) {
  const first = firstNameOf(record.name);
  const subject = `Got your Mobili-Tee application, ${first}`;
  const body = [
    `Hi ${first},`,
    ``,
    `Got your application for the Mobility Specialist role. We read every one carefully. Expect to hear back within a week, sooner if there's a clear fit on both sides.`,
    ``,
    `If you have additional materials or questions in the meantime, just reply to this email.`,
    ``,
    `- Chris Wrazen`,
    `Mobili-Tee`
  ].join("\n");
  return { subject, body };
}

function buildBriefingReply(record) {
  const first = firstNameOf(record.name);
  const subject = `Got your briefing request, ${first}`;
  const club = (record.club || "").trim() || "your club";
  const body = [
    `Hi ${first},`,
    ``,
    `Got your note about ${club}. I'll follow up personally within 24 hours to set up a time that works on your end.`,
    ``,
    `- Chris`,
    `Mobili-Tee`
  ].join("\n");
  return { subject, body };
}

async function sendAutoReply(record, type, env) {
  if (env.AUTO_REPLY_ENABLED !== "true") return;
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM) return;
  if (!record.email) return;

  let reply;
  if (type === "application") {
    reply = buildApplicationReply(record);
  } else if (type === "briefing") {
    reply = buildBriefingReply(record);
  } else {
    reply = await buildSignupReply(record, env);
  }

  const payload = {
    from: env.NOTIFY_FROM,
    to: record.email,
    reply_to: env.AUTO_REPLY_REPLY_TO || env.NOTIFY_TO,
    subject: reply.subject,
    text: reply.body
  };
  if (env.AUTO_REPLY_BCC) payload.bcc = [env.AUTO_REPLY_BCC];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`Auto-reply send failed (${type}):`, res.status, t.slice(0, 200));
  }
}

async function handleSignup(body, request, env) {
  const email = clip(body.email, 254).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { error: "Invalid email", status: 400 };
  }

  const record = {
    email,
    name: clip(body.name, 120).trim(),
    phone: clip(body.phone, 40).trim(),
    club: clip(body.club, 60).trim(),
    what_brought_you: clip(body.what_brought_you, 250).trim(),
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

  const subjectName = record.name || record.email;
  const lines = [
    `New signup on mobili-tee.com`,
    ``,
    `Name:  ${orNone(record.name)}`,
    `Email: ${record.email}`,
    `Phone: ${orNone(record.phone)}`,
    `Club:  ${orNone(record.club)}`,
    ``,
    `What brought them:`,
    record.what_brought_you ? record.what_brought_you : "(not provided)",
    ``,
    `--`,
    `Source:   ${record.source || "unknown"}`,
    `Page:     ${record.page || ""}`,
    `Referrer: ${record.referrer || ""}`,
    `Country:  ${record.country || ""}`,
    `Time:     ${record.timestamp}`
  ];

  const notified = await sendEmailNotification(
    env,
    `New Mobili-Tee signup: ${subjectName}`,
    lines.join("\n")
  ).catch((err) => {
    console.error("notify failed", err);
    return { ok: false };
  });

  return { ok: true, notified: notified.ok === true, record, replyType: "signup" };
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
    name, club, role, email, message,
    page: clip(body.page, 256),
    ip: request.headers.get("CF-Connecting-IP") || "",
    country: request.cf?.country || "",
    ua: request.headers.get("User-Agent") || "",
    timestamp: new Date().toISOString()
  };

  if (env.SUBSCRIBERS) {
    await env.SUBSCRIBERS.put(
      `briefing:${record.timestamp}:${email}`,
      JSON.stringify(record)
    );
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

  return { ok: true, notified: notified.ok === true, record, replyType: "briefing" };
}

async function handleApplication(body, request, env) {
  const name = clip(body.name, 120).trim();
  const email = clip(body.email, 254).trim().toLowerCase();
  const phone = clip(body.phone, 40).trim();
  const current_role = clip(body.current_role, 160).trim();
  const years_experience = clip(body.years_experience, 32).trim();
  const certifications = clip(body.certifications, 600).trim();
  const why_interested = clip(body.why_interested, 1500).trim();
  const linkedin_url = clip(body.linkedin_url, 256).trim();

  if (!name || !EMAIL_RE.test(email) || !phone || !current_role) {
    return { error: "Missing required fields", status: 400 };
  }

  const record = {
    type: "application",
    name, email, phone, current_role,
    years_experience, certifications, why_interested, linkedin_url,
    page: clip(body.page, 256),
    ip: request.headers.get("CF-Connecting-IP") || "",
    country: request.cf?.country || "",
    ua: request.headers.get("User-Agent") || "",
    timestamp: new Date().toISOString()
  };

  if (env.SUBSCRIBERS) {
    await env.SUBSCRIBERS.put(
      `application:${record.timestamp}:${email}`,
      JSON.stringify(record)
    );
  }

  const lines = [
    `New Mobility-Specialist application from mobili-tee.com/careers`,
    ``,
    `Name:                ${record.name}`,
    `Email:               ${record.email}`,
    `Phone:               ${record.phone}`,
    `Current/Recent Role: ${record.current_role}`,
    `Years Experience:    ${orNone(record.years_experience)}`,
    `LinkedIn / portfolio: ${orNone(record.linkedin_url)}`,
    ``,
    `Certifications:`,
    record.certifications || "(not provided)",
    ``,
    `Why interested:`,
    record.why_interested || "(not provided)",
    ``,
    `--`,
    `Page:    ${record.page || ""}`,
    `Country: ${record.country || ""}`,
    `Time:    ${record.timestamp}`
  ];

  const notified = await sendEmailNotification(
    env,
    `New Mobili-Tee application: ${record.name}`,
    lines.join("\n")
  ).catch((err) => {
    console.error("application notify failed", err);
    return { ok: false };
  });

  return { ok: true, notified: notified.ok === true, record, replyType: "application" };
}

export default {
  async fetch(request, env, ctx) {
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

    if (body.company || body.website || body.phone_number) {
      return json({ ok: true }, { status: 200, headers: cors });
    }

    let result;
    try {
      if (body.type === "briefing") {
        result = await handleBriefing(body, request, env);
      } else if (body.type === "application") {
        result = await handleApplication(body, request, env);
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

    // Fire-and-forget auto-reply. Runs after the response is sent so the
    // browser sees an instant 200; failures are swallowed and never affect
    // the form submission outcome.
    if (result.record && ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(
        sendAutoReply(result.record, result.replyType, env).catch((err) => {
          console.error("auto-reply outer failure:", err);
        })
      );
    }

    return json({ ok: true, notified: result.notified === true }, { status: 200, headers: cors });
  }
};
