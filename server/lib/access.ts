import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

// Who is asking, as an e-mail address, or null when the request cannot say.
export type Identify = (headers: Headers) => Promise<string | null>;

// Compared against `users.email`, so both sides have to agree on the spelling.
function normaliseEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const email = value.trim().toLowerCase();
  return email === "" ? null : email;
}

type VerifierOptions = {
  issuer: string;
  audience: string;
  // Injected so the test can hand in a key it generated itself.
  getKey: JWTVerifyGetKey;
};

// Cloudflare Access signs one of these per application and attaches it to
// every request it lets through. The signature proves it came from our team,
// `aud` that it was issued for this application and not for another one behind
// the same team, and `exp` that the session behind it is still alive.
export function createAccessVerifier({ issuer, audience, getKey }: VerifierOptions) {
  return async (token: string) => {
    try {
      const { payload } = await jwtVerify(token, getKey, {
        issuer,
        audience,
        // Pinned to what Access uses, so a token cannot pick its own algorithm.
        algorithms: ["RS256"],
      });
      return normaliseEmail(payload.email);
    } catch {
      return null;
    }
  };
}

const ACCESS_HEADER = "cf-access-jwt-assertion";
const DEV_HEADER = "x-dev-email";

// Decides once, at startup, where identity comes from -- and refuses to start
// when the environment does not say. An app that fell back to "no check" on a
// missing variable would be wide open after one typo in .env.production.
//
// Not keyed on NODE_ENV on purpose: docker-compose.yml passes `${NODE_ENV}`
// through, so a line missing from the env file arrives here as an empty string
// and would read as "not production".
export function identityFromEnv(env: Record<string, string | undefined>): Identify {
  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.replace(/\/$/, "");
  const audience = env.CF_ACCESS_AUD;
  const bypass = env.AUTH_DEV_BYPASS === "true";

  if (teamDomain && audience) {
    if (bypass) {
      throw new Error(
        "AUTH_DEV_BYPASS is set together with CF_ACCESS_*. Remove one: the bypass trusts a plain header and must never run next to the real check.",
      );
    }

    const verify = createAccessVerifier({
      issuer: teamDomain,
      audience,
      // Fetched on first use and refreshed when a token names a key this does
      // not know yet, which is what carries the app across Cloudflare's key
      // rotation without a restart.
      getKey: createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`)),
    });

    return async (headers) => {
      const token = headers.get(ACCESS_HEADER);
      return token ? verify(token) : null;
    };
  }

  if (teamDomain || audience) {
    throw new Error(
      "CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD have to be set together.",
    );
  }

  if (bypass) {
    console.warn(
      "AUTH_DEV_BYPASS: identity is taken from the x-dev-email header or DEV_USER_EMAIL. Development only.",
    );
    const fallback = normaliseEmail(env.DEV_USER_EMAIL);

    // The header wins, so the e2e and screenshot scripts can be a member in
    // one browser context and a guest in the next against the same server.
    return async (headers) => normaliseEmail(headers.get(DEV_HEADER)) ?? fallback;
  }

  throw new Error(
    "No identity source configured. Set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD (production), or AUTH_DEV_BYPASS=true (local development).",
  );
}
