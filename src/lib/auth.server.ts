import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { getCookie, setCookie } from "@tanstack/react-start/server";

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  associacao_uniao?: string | null;
  primeiro_acesso: boolean;
};

const SESSION_MAX_AGE = 60 * 60 * 8;
const SESSION_COOKIE = "pluraal_session";

const isProduction = process.env.NODE_ENV === "production";

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function getSessionSecret() {
  const secret =
    process.env.SESSION_SECRET ||
    process.env.CLOUD_PASSWORD ||
    process.env.LOCAL_PASSWORD ||
    "pluraal-dev-session-secret";

  if (isProduction && !process.env.SESSION_SECRET) {
    console.warn("[AUTH] Defina SESSION_SECRET no Railway para assinar as sessões com uma chave dedicada.");
  }

  return secret;
}

function sign(value: string) {
  return base64Url(createHmac("sha256", getSessionSecret()).update(value).digest());
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function createTemporaryPassword() {
  return randomBytes(9).toString("base64url");
}

export function isPasswordHash(value: string) {
  return value.startsWith("scrypt$");
}

export function verifyPassword(password: string, stored: string) {
  if (!isPasswordHash(stored)) {
    return password === stored;
  }

  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;

  const candidate = scryptSync(password, salt, 64);
  const storedHash = Buffer.from(hash, "hex");
  return candidate.length === storedHash.length && timingSafeEqual(candidate, storedHash);
}

export function issueSession(userId: string) {
  const payload = base64Url(
    JSON.stringify({
      uid: String(userId),
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    }),
  );

  setCookie(SESSION_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSession() {
  setCookie(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function readSessionUserId() {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(sign(payload), signature)) return null;

  try {
    const data = JSON.parse(fromBase64Url(payload)) as { uid?: string; exp?: number };
    if (!data.uid || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return String(data.uid);
  } catch {
    return null;
  }
}

export function isAdminRole(role: string | null | undefined) {
  const normalized = String(role || "").toLowerCase();
  return normalized === "admin" || normalized === "admin2";
}

export async function getCurrentSessionUser(pool: { query: Function }): Promise<SessionUser | null> {
  const userId = readSessionUserId();
  if (!userId) return null;

  const [rows]: any = await pool.query(
    `SELECT id_user, email_user, nome_user, associacao_uniao, nivel, primeiro_acesso
     FROM usuarios
     WHERE id_user = ?
     LIMIT 1`,
    [userId],
  );

  const user = rows?.[0];
  if (!user) return null;

  return {
    id: String(user.id_user),
    email: user.email_user,
    full_name: user.nome_user,
    role: user.nivel,
    associacao_uniao: user.associacao_uniao,
    primeiro_acesso: user.primeiro_acesso === 1 || user.primeiro_acesso === true,
  };
}

export async function requireSessionUser(pool: { query: Function }) {
  const user = await getCurrentSessionUser(pool);
  if (!user) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  return user;
}

export async function requireAdminUser(pool: { query: Function }) {
  const user = await requireSessionUser(pool);
  if (!isAdminRole(user.role)) {
    throw new Error("Ação permitida somente para administradores.");
  }
  return user;
}
