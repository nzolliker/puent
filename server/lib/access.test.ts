import { beforeAll, describe, expect, test } from "bun:test";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";

import { createAccessVerifier, identityFromEnv } from "./access";

const ISSUER = "https://garten.cloudflareaccess.com";
const AUDIENCE = "aud-of-this-application";

type Keys = Awaited<ReturnType<typeof generateKeyPair>>;

let ours: Keys;
let theirs: Keys;
let verify: ReturnType<typeof createAccessVerifier>;

// Stands in for Cloudflare: signs a token the way Access would, with every
// claim overridable so each test can break exactly one thing.
function sign(
  claims: Record<string, unknown>,
  {
    key = ours.privateKey,
    issuer = ISSUER,
    audience = AUDIENCE,
    expires = "1h",
  }: {
    key?: Keys["privateKey"];
    issuer?: string;
    audience?: string;
    expires?: string;
  } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(expires)
    .sign(key);
}

beforeAll(async () => {
  ours = await generateKeyPair("RS256");
  theirs = await generateKeyPair("RS256");

  const jwk = await exportJWK(ours.publicKey);
  verify = createAccessVerifier({
    issuer: ISSUER,
    audience: AUDIENCE,
    getKey: createLocalJWKSet({
      keys: [{ ...jwk, kid: "test-key", alg: "RS256" }],
    }),
  });
});

describe("createAccessVerifier", () => {
  test("returns the address from a valid token", async () => {
    expect(await verify(await sign({ email: "anna@example.com" }))).toBe(
      "anna@example.com",
    );
  });

  test("lowercases the address, which is how users.email is stored", async () => {
    expect(await verify(await sign({ email: " Anna@Example.com " }))).toBe(
      "anna@example.com",
    );
  });

  test("rejects a token issued for another application", async () => {
    const token = await sign(
      { email: "anna@example.com" },
      { audience: "some-other-application" },
    );
    expect(await verify(token)).toBeNull();
  });

  test("rejects a token from another team", async () => {
    const token = await sign(
      { email: "anna@example.com" },
      { issuer: "https://someone-else.cloudflareaccess.com" },
    );
    expect(await verify(token)).toBeNull();
  });

  test("rejects an expired token", async () => {
    const token = await sign({ email: "anna@example.com" }, { expires: "-1m" });
    expect(await verify(token)).toBeNull();
  });

  test("rejects a token signed with a key that is not Cloudflare's", async () => {
    const token = await sign(
      { email: "anna@example.com" },
      { key: theirs.privateKey },
    );
    expect(await verify(token)).toBeNull();
  });

  test("rejects a token whose payload was edited after signing", async () => {
    const [header, , signature] = (
      await sign({ email: "anna@example.com" })
    ).split(".");
    const payload = Buffer.from(
      JSON.stringify({
        email: "nicola@example.com",
        iss: ISSUER,
        aud: AUDIENCE,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");

    expect(await verify(`${header}.${payload}.${signature}`)).toBeNull();
  });

  test("rejects an unsigned token", async () => {
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${encode({ alg: "none" })}.${encode({
      email: "anna@example.com",
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.`;

    expect(await verify(token)).toBeNull();
  });

  test("rejects a valid token that names nobody", async () => {
    expect(await verify(await sign({}))).toBeNull();
    expect(await verify(await sign({ email: "" }))).toBeNull();
  });

  test("rejects something that is not a token", async () => {
    expect(await verify("not-a-token")).toBeNull();
  });
});

describe("identityFromEnv", () => {
  const access = {
    CF_ACCESS_TEAM_DOMAIN: ISSUER,
    CF_ACCESS_AUD: AUDIENCE,
  };

  test("refuses to start with nothing configured", () => {
    expect(() => identityFromEnv({})).toThrow(/No identity source/);
  });

  test("treats the empty strings Compose passes for missing lines as unset", () => {
    expect(() =>
      identityFromEnv({ CF_ACCESS_TEAM_DOMAIN: "", CF_ACCESS_AUD: "" }),
    ).toThrow(/No identity source/);
  });

  test("refuses half an Access configuration", () => {
    expect(() =>
      identityFromEnv({ CF_ACCESS_TEAM_DOMAIN: ISSUER }),
    ).toThrow(/set together/);
    expect(() => identityFromEnv({ CF_ACCESS_AUD: AUDIENCE })).toThrow(
      /set together/,
    );
  });

  test("refuses the bypass next to the real check", () => {
    expect(() =>
      identityFromEnv({ ...access, AUTH_DEV_BYPASS: "true" }),
    ).toThrow(/AUTH_DEV_BYPASS/);
  });

  test("only the literal 'true' switches the bypass on", () => {
    expect(() => identityFromEnv({ AUTH_DEV_BYPASS: "1" })).toThrow(
      /No identity source/,
    );
  });

  test("with Access configured, the dev header is worth nothing", async () => {
    const identify = identityFromEnv(access);

    expect(
      await identify(new Headers({ "x-dev-email": "anna@example.com" })),
    ).toBeNull();
    expect(await identify(new Headers())).toBeNull();
  });

  test("the bypass reads the header, then DEV_USER_EMAIL", async () => {
    const identify = identityFromEnv({
      AUTH_DEV_BYPASS: "true",
      DEV_USER_EMAIL: "Nicola@example.com",
    });

    expect(
      await identify(new Headers({ "x-dev-email": "anna@example.com" })),
    ).toBe("anna@example.com");
    expect(await identify(new Headers())).toBe("nicola@example.com");
  });

  test("the bypass without a fallback address identifies nobody", async () => {
    const identify = identityFromEnv({ AUTH_DEV_BYPASS: "true" });

    expect(await identify(new Headers())).toBeNull();
  });
});
