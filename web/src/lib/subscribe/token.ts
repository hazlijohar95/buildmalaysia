// HMAC-SHA256 token: base64url(payload) + "." + base64url(sig)
// Payload: JSON { email, exp } where exp is Unix seconds.
// Uses Web Crypto so it runs on both Cloudflare Workers and Node >= 18.

function toBase64Url(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64Url(b64: string): Uint8Array {
  const std = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = std.padEnd(std.length + ((4 - (std.length % 4)) % 4), "=");
  const str = atob(padded);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function createToken(email: string, secret: string, nowMs = Date.now()): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + 7 * 24 * 3600;
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ email, exp })));
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

export type TokenResult = { ok: true; email: string } | { ok: false; reason: "expired" | "invalid" };

export async function verifyToken(token: string, secret: string, nowMs = Date.now()): Promise<TokenResult> {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return { ok: false, reason: "invalid" };

  const payload = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  let sigBytes: Uint8Array;
  try {
    sigBytes = fromBase64Url(sigPart);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const key = await importKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
  if (!valid) return { ok: false, reason: "invalid" };

  let parsed: { email?: unknown; exp?: unknown };
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (typeof parsed.email !== "string" || typeof parsed.exp !== "number") {
    return { ok: false, reason: "invalid" };
  }

  if (Math.floor(nowMs / 1000) > parsed.exp) return { ok: false, reason: "expired" };

  return { ok: true, email: parsed.email };
}
