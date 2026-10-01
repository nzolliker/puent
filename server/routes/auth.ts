import { Hono } from "hono";

import type { AppEnv } from "../lib/auth";

export const authRoutes = new Hono<AppEnv>()

  // 200 either way. A guest is a normal state here, not an error, so the
  // browser can treat a null user as data rather than a failed request. The
  // address goes along so a guest can see which one they came in with -- the
  // usual reason somebody cannot add anything is that they signed in with a
  // different address than the one on their account.
  .get("/me", (c) => {
    return c.json({ user: c.get("user"), email: c.get("email") });
  });
