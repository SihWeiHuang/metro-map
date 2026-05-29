import { randomBytes } from "node:crypto";
import {
  MAX_SHARE_CREATES_PER_IP_PER_DAY,
  SHARE_ID_PATTERN,
  SHARE_TTL_SECONDS,
  validateSharePayloadText,
} from "../../shared/shareLimits.js";
import { getKv, isKvConfigured } from "./kvClient.js";

const SHARE_KEY_PREFIX = "share:";
const RATE_KEY_PREFIX = "share-rate:";

/**
 * @param {import('http').IncomingMessage} req
 */
export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function utcDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function newShareId() {
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = randomBytes(6).toString("base64url").slice(0, 8);
    if (SHARE_ID_PATTERN.test(id)) return id;
  }
  return randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9_-]/g, "x").slice(0, 8);
}

/**
 * @param {string} ip
 */
async function checkAndIncrementRateLimit(ip) {
  const kv = getKv();
  const key = `${RATE_KEY_PREFIX}${utcDateKey()}:${ip}`;
  const count = await kv.incr(key);
  if (count === 1) {
    await kv.expire(key, 60 * 60 * 48);
  }
  if (count > MAX_SHARE_CREATES_PER_IP_PER_DAY) {
    return { ok: false, code: "rate_limited" };
  }
  return { ok: true };
}

/**
 * @param {string} ip
 * @param {string} payloadText
 */
export async function createShare(ip, payloadText) {
  if (!isKvConfigured()) {
    return { ok: false, code: "kv_not_configured" };
  }
  const validation = validateSharePayloadText(payloadText);
  if (!validation.ok) {
    return { ok: false, code: validation.code };
  }
  const rate = await checkAndIncrementRateLimit(ip);
  if (!rate.ok) {
    return { ok: false, code: rate.code };
  }

  const kv = getKv();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SHARE_TTL_SECONDS * 1000).toISOString();
  const record = { payload: payloadText, createdAt, expiresAt };

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = newShareId();
    const key = `${SHARE_KEY_PREFIX}${id}`;
    const inserted = await kv.set(key, record, { nx: true, ex: SHARE_TTL_SECONDS });
    if (inserted) {
      return { ok: true, id, createdAt, expiresAt };
    }
  }
  return { ok: false, code: "create_failed" };
}

/**
 * @param {string} id
 */
export async function getShare(id) {
  if (!SHARE_ID_PATTERN.test(id)) {
    return { ok: false, code: "not_found" };
  }
  if (!isKvConfigured()) {
    return { ok: false, code: "kv_not_configured" };
  }
  const kv = getKv();
  const record = await kv.get(`${SHARE_KEY_PREFIX}${id}`);
  if (!record || typeof record !== "object") {
    return { ok: false, code: "not_found" };
  }
  const payload = /** @type {{ payload?: string, expiresAt?: string, createdAt?: string }} */ (record);
  if (typeof payload.payload !== "string") {
    return { ok: false, code: "not_found" };
  }
  return {
    ok: true,
    payload: payload.payload,
    expiresAt: payload.expiresAt ?? null,
    createdAt: payload.createdAt ?? null,
  };
}
