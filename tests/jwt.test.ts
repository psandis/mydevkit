import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodeJwt, duration, isExpired, JwtError, timeClaims } from "../src/commands/jwt.js";
import { cli, cliWithStdin, makeJwt, type Sandbox, sandbox } from "./helpers.js";

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const seconds = (ms: number) => Math.floor(ms / 1000);

let box: Sandbox;
beforeEach(() => {
  box = sandbox();
});
afterEach(() => box.cleanup());

describe("decodeJwt", () => {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { sub: "123", name: "Ada" };

  it("decodes header and payload, ignoring a Bearer prefix and whitespace", () => {
    const token = makeJwt(header, payload);
    expect(decodeJwt(token)).toEqual({ header, payload, signed: true });
    expect(decodeJwt(`  Bearer ${token}\n`).payload).toEqual(payload);
  });

  it("detects unsigned tokens", () => {
    expect(decodeJwt(makeJwt({ alg: "none" }, payload, "")).signed).toBe(false);
  });

  it("rejects malformed tokens with clear messages", () => {
    expect(() => decodeJwt("abc")).toThrow("expected 3 parts");
    expect(() => decodeJwt("a.b.c.d.e")).toThrow("encrypted JWT (JWE)");
    expect(() => decodeJwt("@@.e30.sig")).toThrow("Header is not base64url");
    expect(() => decodeJwt("bm90IGpzb24.e30.sig")).toThrow("Header is not valid JSON");
    expect(() => decodeJwt(makeJwt(header, [1, 2] as unknown as object))).toThrow(JwtError);
  });
});

describe("time claims", () => {
  it("formats durations with the two largest units", () => {
    expect(duration(0)).toBe("0s");
    expect(duration(65_000)).toBe("1m 5s");
    expect(duration(2 * 86_400_000 + 3 * 3_600_000 + 59_000)).toBe("2d 3h");
    expect(duration(400 * 86_400_000)).toBe("1y 35d");
  });

  it("describes iat, nbf, and exp relative to now", () => {
    const payload = {
      iat: seconds(NOW - 3_600_000),
      nbf: seconds(NOW + 60_000),
      exp: seconds(NOW - 86_400_000),
    };
    const claims = timeClaims(payload, NOW);
    expect(claims.map((c) => [c.claim, c.note])).toEqual([
      ["iat", "issued 1h ago"],
      ["nbf", "not valid for another 1m"],
      ["exp", "expired 1d ago"],
    ]);
    expect(claims[0].date).toBe("2026-01-15T11:00:00.000Z");
    expect(isExpired(payload, NOW)).toBe(true);
    expect(isExpired({ exp: seconds(NOW + 1000) }, NOW)).toBe(false);
    expect(isExpired({}, NOW)).toBeNull();
  });

  it("skips non-numeric and out-of-range values", () => {
    expect(timeClaims({ exp: "soon", iat: 1e20 }, NOW)).toEqual([]);
  });
});

describe("mydk jwt", () => {
  const future = seconds(Date.now() + 3_600_000);
  const token = makeJwt({ alg: "HS256", typ: "JWT" }, { sub: "123", exp: future });

  it("prints header, payload, times, and a signature warning", async () => {
    const { stdout, code } = await cli(box, "jwt", token);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^Header\n\{\n {2}"alg": "HS256"/);
    expect(stdout).toMatch(/Payload\n\{\n {2}"sub": "123"/);
    expect(stdout).toMatch(/exp {2}\d{4}-\d\d-\d\dT.*\(expires in (59m|1h)/);
    expect(stdout).toMatch(/Signature: present, NOT verified/);
  });

  it("reads the token from stdin", async () => {
    expect((await cliWithStdin(box, `${token}\n`, "jwt")).stdout).toMatch(/"sub": "123"/);
  });

  it("prints structured JSON with --json", async () => {
    const data = JSON.parse((await cli(box, "jwt", token, "--json")).stdout);
    expect(data.header.alg).toBe("HS256");
    expect(data.payload.sub).toBe("123");
    expect(data.times.exp.value).toBe(future);
    expect(data.expired).toBe(false);
    expect(data.signatureVerified).toBe(false);
  });

  it("fails with exit code 1 on a malformed token", async () => {
    const result = await cli(box, "jwt", "not-a-token");
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/^mydk: Not a JWT/);
  });
});
