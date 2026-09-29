import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { users } from "../db/schema/users";
import {
  loginSchema,
  setPasswordSchema,
  setupTokenSchema,
} from "../sharedTypes";
import {
  clearFailures,
  clearSessionCookie,
  consumeSetupToken,
  createSession,
  getSessionToken,
  invalidateSession,
  readSetupToken,
  recordFailure,
  setSessionCookie,
  tooManyFailures,
  verifyPassword,
  type AppEnv,
} from "../lib/auth";

export const authRoutes = new Hono<AppEnv>()

  // 200 either way. A logged-out visitor is a normal state here, not an error,
  // so the browser can treat a null user as data rather than a failed request.
  .get("/me", (c) => {
    return c.json({ user: c.get("user") });
  })

  .post("/login", zValidator("json", loginSchema), async (c) => {
    const { username, password } = c.req.valid("json");
    const key = username.trim().toLowerCase();

    if (tooManyFailures(key)) {
      return c.json(
        { error: "Zu viele Versuche. Bitte später erneut probieren." },
        429,
      );
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.username, key))
      .then((rows) => rows[0]);

    // A user whose setup link is still unused has no hash and cannot log in.
    if (
      !user?.passwordHash ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      recordFailure(key);
      return c.json({ error: "Benutzername oder Passwort stimmt nicht." }, 401);
    }

    clearFailures(key);
    setSessionCookie(c, await createSession(user.id));

    return c.json({
      user: { id: user.id, username: user.username, name: user.name },
    });
  })

  .post("/logout", async (c) => {
    const token = getSessionToken(c);
    if (token) {
      await invalidateSession(token);
    }
    clearSessionCookie(c);

    return c.json({ ok: true });
  })

  // Lets the setup page greet the right person before they type anything.
  .post("/setup/check", zValidator("json", setupTokenSchema), async (c) => {
    const { token } = c.req.valid("json");
    const account = await readSetupToken(token);

    if (!account) {
      return c.json({ error: "Dieser Link ist ungültig oder abgelaufen." }, 404);
    }

    return c.json({ account });
  })

  .post("/setup", zValidator("json", setPasswordSchema), async (c) => {
    const { token, password } = c.req.valid("json");
    const user = await consumeSetupToken(token, password);

    if (!user) {
      return c.json({ error: "Dieser Link ist ungültig oder abgelaufen." }, 404);
    }

    // Straight into a session, so setting a password and logging in are one step.
    setSessionCookie(c, await createSession(user.id));

    return c.json({ user });
  });
