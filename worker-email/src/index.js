/**
 * Mobili-Tee catch-all email forwarder
 *
 * Cloudflare Email Routing's native catch-all can only forward to ONE verified
 * destination address. This Worker sits in that slot instead and fans every
 * message sent to *@mobili-tee.com out to each address in FORWARD_TO.
 *
 * Config (wrangler.toml [vars]):
 *   FORWARD_TO  comma-separated destination addresses. Every one of them must
 *               already be a VERIFIED destination address under
 *               Email Routing -> Destination addresses, or the forward fails.
 *
 * To add or remove someone: verify their address in the dashboard, edit
 * FORWARD_TO, then `npx wrangler deploy`. No code change needed.
 */

const DEFAULT_FORWARD_TO = "chriswrazen@gmail.com";

export default {
  async email(message, env) {
    const recipients = (env.FORWARD_TO || DEFAULT_FORWARD_TO)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const results = await Promise.allSettled(
      recipients.map((address) => message.forward(address))
    );

    const failed = recipients.filter((_, i) => results[i].status === "rejected");

    if (failed.length === recipients.length) {
      // Nobody got it. Throw so Cloudflare records the failure and the sender
      // gets a bounce, rather than the mail disappearing silently.
      throw new Error(`Forward failed for all recipients: ${failed.join(", ")}`);
    }

    if (failed.length) {
      // Partial delivery: at least one inbox has it, so don't reject the
      // message — just surface the miss in `wrangler tail`.
      console.error(`Forward failed for: ${failed.join(", ")}`);
    }
  }
};
