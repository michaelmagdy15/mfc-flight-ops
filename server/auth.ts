export interface AuthEnv {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  AUTH_SECRET?: string;
}

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "mfc0000";
const DEFAULT_SECRET = "mfc-flight-ops-assiut-hmac-v1-2026";

export const SESSION_COOKIE_NAME = "mfc_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

interface SessionPayload {
  u: string;
  role: "admin";
  iat: number;
  exp: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeBytes(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

async function signPayload(payloadB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return base64UrlEncodeBytes(new Uint8Array(sigBuf));
}

function getResolvedUsername(env: AuthEnv): string {
  return (env.ADMIN_USERNAME || DEFAULT_USERNAME).trim();
}

function getResolvedPassword(env: AuthEnv): string {
  return env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
}

function getResolvedSecret(env: AuthEnv): string {
  return env.AUTH_SECRET || DEFAULT_SECRET;
}

export function validateAdminCredentials(
  username: string,
  password: string,
  env: AuthEnv
): boolean {
  const expectedUser = getResolvedUsername(env).toLowerCase();
  const actualUser = (username || "").trim().toLowerCase();
  const expectedPass = getResolvedPassword(env);
  return safeEqual(actualUser, expectedUser) && safeEqual(password || "", expectedPass);
}

export async function createAdminToken(username: string, env: AuthEnv): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    u: username,
    role: "admin",
    iat,
    exp: iat + SESSION_TTL_SECONDS,
  };
  const payloadB64 = base64UrlEncodeBytes(encoder.encode(JSON.stringify(payload)));
  const sigB64 = await signPayload(payloadB64, getResolvedSecret(env));
  return `${payloadB64}.${sigB64}`;
}

export async function verifyAdminToken(
  token: string,
  env: AuthEnv
): Promise<{ username: string; role: "admin" } | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  try {
    const expectedSig = await signPayload(payloadB64, getResolvedSecret(env));
    if (!safeEqual(sigB64, expectedSig)) return null;

    const jsonStr = decoder.decode(base64UrlDecodeBytes(payloadB64));
    const parsed = JSON.parse(jsonStr) as Partial<SessionPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (
      parsed.role !== "admin" ||
      typeof parsed.u !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= now
    ) {
      return null;
    }
    return { username: parsed.u, role: "admin" };
  } catch {
    return null;
  }
}

export function extractTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (m && m[1]) return m[1].trim();
  }

  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === SESSION_COOKIE_NAME) {
      const rawVal = part.slice(eqIdx + 1).trim();
      try {
        return decodeURIComponent(rawVal);
      } catch {
        return rawVal;
      }
    }
  }
  return null;
}

export async function verifyAdminRequest(
  request: Request,
  env: AuthEnv
): Promise<{ username: string; role: "admin" } | null> {
  const token = extractTokenFromRequest(request);
  if (!token) return null;
  return verifyAdminToken(token, env);
}

export function buildSessionCookie(
  token: string,
  requestUrl: string,
  clear = false
): string {
  let isLocalHost = false;
  try {
    const host = new URL(requestUrl).hostname.toLowerCase();
    isLocalHost = host === "localhost" || host === "127.0.0.1";
  } catch {
    isLocalHost = false;
  }

  const attrs = [
    `${SESSION_COOKIE_NAME}=${clear ? "" : encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${clear ? 0 : SESSION_TTL_SECONDS}`,
  ];
  if (!isLocalHost) {
    attrs.push("Secure");
  }
  return attrs.join("; ");
}
