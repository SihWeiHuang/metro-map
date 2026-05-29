import { kv } from "@vercel/kv";

export function isKvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * @returns {import('@vercel/kv').VercelKV}
 */
export function getKv() {
  if (!isKvConfigured()) {
    throw new Error("kv_not_configured");
  }
  return kv;
}
