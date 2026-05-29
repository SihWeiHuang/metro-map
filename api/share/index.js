import { createShare, getClientIp } from "../_lib/shareStore.js";

/**
 * POST /api/share — create a short-lived share link.
 * Body: { "payload": "<export JSON string>" }
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ ok: false, error: "invalid_json" });
      return;
    }
  }
  const payloadText = body?.payload;
  if (typeof payloadText !== "string") {
    res.status(400).json({ ok: false, error: "invalid_json" });
    return;
  }

  const ip = getClientIp(req);
  const result = await createShare(ip, payloadText);
  if (!result.ok) {
    const status =
      result.code === "rate_limited"
        ? 429
        : result.code === "kv_not_configured"
          ? 503
          : result.code === "payload_too_large"
            ? 413
            : 400;
    res.status(status).json({ ok: false, error: result.code });
    return;
  }

  res.status(201).json({
    ok: true,
    id: result.id,
    createdAt: result.createdAt,
    expiresAt: result.expiresAt,
  });
}
