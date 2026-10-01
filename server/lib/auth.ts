import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";

import { db } from "../db";
import { sessions, setupTokens, users } from "../db/schema/users";

export type SessionUser = {
  id: number;
  username: string;
  name: string;
};

// Every route under /api runs behind `loadUser`, so `user` is always set --
// null for a visitor, a SessionUser for a member.
export type AppEnv = { Variables: { user: SessionUser | null } };

const COOKIE_NAME = "puent_session";
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 30;
const SETUP_TOKEN_DAYS = 7;

function daysFromNow(days: number) {
  return new Date(Date.now() + days * DAY_MS);
}

// 32 bytes of randomness. Long enough that guessing is not a threat model, so
// the tokens carry no structure and mean nothing outside the tables below.
function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

// The database stores this, never the token itself.
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// -- passwords ---------------------------------------------------------------

type PasswordApi = {
  hash(password: string): Promise<string>;
  verify(password: string, hash: string): Promise<boolean>;
};

// Bun ships argon2id, so there is no bcrypt dependency to keep up to date.
//
// Reached through globalThis rather than the `Bun` global on purpose: the
// frontend type-checks this file across the `@server` alias, and its tsconfig
// cannot take @types/bun -- those globals collide with the DOM lib and break
// the photo streaming in app.ts. This keeps both sides compiling.
const bunPassword = (globalThis as unknown as { Bun: { password: PasswordApi } })
  .Bun.password;

export function hashPassword(password: string) {
  return bunPassword.hash(password);
}

export function verifyPassword(password: string, hash: string) {
  return bunPassword.verify(password, hash);
}

// -- sessions ----------------------------------------------------------------

export async function createSession(userId: number) {
  const token = generateToken();

  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt: daysFromNow(SESSION_DAYS),
  });

  return token;
}

type ValidatedSession = { user: SessionUser; renewed: boolean };

// `renewed` tells the caller to write the cookie again, so a gardener who opens
// the app every few weeks is never logged out by the clock running down.
export async function validateSession(
  token: string,
): Promise<ValidatedSession | null> {
  const id = hashToken(token);

  const row = await db
    .select({
      userId: users.id,
      username: users.username,
      name: users.name,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .then((rows) => rows[0]);

  if (!row) {
    return null;
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  const user: SessionUser = {
    id: row.userId,
    username: row.username,
    name: row.name,
  };

  const halfwayGone =
    Date.now() > row.expiresAt.getTime() - (SESSION_DAYS * DAY_MS) / 2;
  if (!halfwayGone) {
    return { user, renewed: false };
  }

  await db
    .update(sessions)
    .set({ expiresAt: daysFromNow(SESSION_DAYS) })
    .where(eq(sessions.id, id));

  return { user, renewed: true };
}

export async function invalidateSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

// -- cookie ------------------------------------------------------------------

// Off by default, because local development is plain HTTP and a `Secure` cookie
// would simply never be sent. Production sets COOKIE_SECURE=true: there the
// browser only reaches the app over the HTTPS that Cloudflare terminates.
function cookieIsSecure() {
  return process.env.COOKIE_SECURE === "true";
}

export function getSessionToken(c: Context) {
  return getCookie(c, COOKIE_NAME);
}

export function setSessionCookie(c: Context, token: string) {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    secure: cookieIsSecure(),
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, { path: "/", secure: cookieIsSecure() });
}

// -- setup / reset links -----------------------------------------------------

export async function createSetupToken(userId: number) {
  const token = generateToken();

  await db.insert(setupTokens).values({
    id: hashToken(token),
    userId,
    expiresAt: daysFromNow(SETUP_TOKEN_DAYS),
  });

  return token;
}

function liveSetupToken(token: string) {
  return and(
    eq(setupTokens.id, hashToken(token)),
    isNull(setupTokens.usedAt),
    gt(setupTokens.expiresAt, new Date()),
  );
}

// Used to greet the right person on the setup page before they type anything.
export async function readSetupToken(token: string) {
  return db
    .select({ username: users.username, name: users.name })
    .from(setupTokens)
    .innerJoin(users, eq(setupTokens.userId, users.id))
    .where(liveSetupToken(token))
    .then((rows) => rows[0] ?? null);
}

// Single use, and it drops every existing session for that account: on the
// reset path the person who knew the old password should not stay logged in.
export async function consumeSetupToken(
  token: string,
  password: string,
): Promise<SessionUser | null> {
  const row = await db
    .select({
      tokenId: setupTokens.id,
      userId: users.id,
      username: users.username,
      name: users.name,
    })
    .from(setupTokens)
    .innerJoin(users, eq(setupTokens.userId, users.id))
    .where(liveSetupToken(token))
    .then((rows) => rows[0]);

  if (!row) {
    return null;
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, row.userId));

  await db
    .update(setupTokens)
    .set({ usedAt: new Date() })
    .where(eq(setupTokens.id, row.tokenId));

  await db.delete(sessions).where(eq(sessions.userId, row.userId));

  return { id: row.userId, username: row.username, name: row.name };
}

// -- login throttle ----------------------------------------------------------

// One Bun process serves the whole app, so a Map is the whole store. It resets
// on restart, which is fine: the point is to make guessing slow, not to keep
// books. This is the one thing an auth library would have handed over for free.
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const failures = new Map<string, { count: number; firstAt: number }>();

function currentFailures(key: string) {
  const entry = failures.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.firstAt > FAILURE_WINDOW_MS) {
    failures.delete(key);
    return null;
  }
  return entry;
}

export function tooManyFailures(key: string) {
  return (currentFailures(key)?.count ?? 0) >= MAX_FAILURES;
}

export function recordFailure(key: string) {
  const entry = currentFailures(key);
  if (entry) {
    entry.count += 1;
  } else {
    failures.set(key, { count: 1, firstAt: Date.now() });
  }
}

export function clearFailures(key: string) {
  failures.delete(key);
}

// -- middleware --------------------------------------------------------------

// Never rejects. Reading the app is open to anyone on the network, so "logged
// out" is an ordinary state rather than an error.
export const loadUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = getSessionToken(c);

  if (!token) {
    c.set("user", null);
    return next();
  }

  const result = await validateSession(token);

  if (!result) {
    c.set("user", null);
    clearSessionCookie(c);
    return next();
  }

  if (result.renewed) {
    setSessionCookie(c, token);
  }

  c.set("user", result.user);
  await next();
});

// Runs after `loadUser`, which is what guarantees `c.get("user")` is meaningful.
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) {
    return c.json({ error: "Nicht angemeldet" }, 401);
  }
  await next();
});
