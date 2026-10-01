import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { users } from "../db/schema/users";
import { identityFromEnv } from "./access";

export type SessionUser = {
  id: number;
  username: string;
  name: string;
};

// `email` is set for every request that gets past `requireAccess`. `user` is
// set under /api by `loadUser` -- null for a guest, a SessionUser for a member.
export type AppEnv = { Variables: { email: string; user: SessionUser | null } };

// Throws when the environment names no identity source, which stops the server
// from starting rather than letting it run unguarded.
const identify = identityFromEnv(process.env);

// The wall. Nothing is served to a request Cloudflare Access did not sign off:
// not the API, not a photo, not the frontend. Port 3000 is only published on
// loopback, but this is what holds if that ever changes.
export const requireAccess = createMiddleware<AppEnv>(async (c, next) => {
  const email = await identify(c.req.raw.headers);

  if (!email) {
    return c.text("Forbidden", 403);
  }

  c.set("email", email);
  await next();
});

// Getting past Access makes somebody a guest. Being in `users` under the same
// address is what makes them a member. Never rejects: a guest is an ordinary
// state here, not an error.
//
// Kept off the static files and the photos on purpose -- a page of thumbnails
// would otherwise be a query each.
export const loadUser = createMiddleware<AppEnv>(async (c, next) => {
  const user = await db
    .select({ id: users.id, username: users.username, name: users.name })
    .from(users)
    .where(eq(users.email, c.get("email")))
    .then((rows) => rows[0] ?? null);

  c.set("user", user);
  await next();
});

// Runs after `loadUser`, which is what guarantees `c.get("user")` is meaningful.
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("user")) {
    return c.json({ error: "Nur Mitglieder können etwas eintragen." }, 401);
  }
  await next();
});
