/**
 * @param {string} payloadText — export JSON string
 * @returns {Promise<
 *   | { ok: true, id: string, expiresAt: string, createdAt: string }
 *   | { ok: false, error: string }
 * >}
 */
export async function createShareLink(payloadText) {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: payloadText }),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "network_error" };
  }
  if (!res.ok || !data?.ok) {
    return { ok: false, error: data?.error || "create_failed" };
  }
  return {
    ok: true,
    id: data.id,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
  };
}

/**
 * @param {string} id
 * @returns {Promise<
 *   | { ok: true, payload: string, expiresAt: string | null, createdAt: string | null }
 *   | { ok: false, error: string }
 * >}
 */
export async function fetchShareById(id) {
  const res = await fetch(`/api/share/${encodeURIComponent(id)}`, { method: "GET" });
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: "network_error" };
  }
  if (!res.ok || !data?.ok || typeof data.payload !== "string") {
    return { ok: false, error: data?.error || "not_found" };
  }
  return {
    ok: true,
    payload: data.payload,
    expiresAt: data.expiresAt ?? null,
    createdAt: data.createdAt ?? null,
  };
}
