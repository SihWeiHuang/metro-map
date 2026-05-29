import { getShare } from "../_lib/shareStore.js";

/**
 * GET /api/share/:id — fetch shared route JSON.
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=60");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const id = typeof req.query?.id === "string" ? req.query.id : "";
  const result = await getShare(id);
  if (!result.ok) {
    const status = result.code === "kv_not_configured" ? 503 : 404;
    res.status(status).json({ ok: false, error: result.code });
    return;
  }

  res.status(200).json({
    ok: true,
    payload: result.payload,
    expiresAt: result.expiresAt,
    createdAt: result.createdAt,
  });
}
