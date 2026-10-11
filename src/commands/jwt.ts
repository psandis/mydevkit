export class JwtError extends Error {}

type JsonObject = Record<string, unknown>;

export interface DecodedJwt {
  header: JsonObject;
  payload: JsonObject;
  signed: boolean;
}

export interface TimeClaim {
  claim: "iat" | "nbf" | "exp";
  value: number;
  date: string;
  note: string;
}

function decodePart(part: string, name: string): JsonObject {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new JwtError(`${name} is not base64url.`);
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    throw new JwtError(`${name} is not valid JSON.`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new JwtError(`${name} must be a JSON object.`);
  }
  return value as JsonObject;
}

/** Decodes header and payload. The signature is NOT verified. */
export function decodeJwt(input: string): DecodedJwt {
  const parts = input
    .trim()
    .replace(/^Bearer\s+/i, "")
    .split(".");
  if (parts.length === 5) {
    throw new JwtError("This is an encrypted JWT (JWE). It cannot be decoded without the key.");
  }
  if (parts.length !== 3) throw new JwtError("Not a JWT: expected 3 parts separated by dots.");
  return {
    header: decodePart(parts[0], "Header"),
    payload: decodePart(parts[1], "Payload"),
    signed: parts[2] !== "",
  };
}

const UNITS: [string, number][] = [
  ["y", 365 * 86_400_000],
  ["d", 86_400_000],
  ["h", 3_600_000],
  ["m", 60_000],
  ["s", 1000],
];

/** Two largest units, e.g. "2d 3h" or "5m 10s". */
export function duration(ms: number): string {
  const parts: string[] = [];
  let rest = Math.abs(ms);
  for (const [unit, size] of UNITS) {
    const count = Math.floor(rest / size);
    if (count > 0 || parts.length > 0) {
      if (count > 0) parts.push(`${count}${unit}`);
      rest -= count * size;
    }
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(" ") : "0s";
}

/** Readable dates for the registered time claims (seconds since epoch). */
export function timeClaims(payload: JsonObject, now = Date.now()): TimeClaim[] {
  const claims: TimeClaim[] = [];
  for (const claim of ["iat", "nbf", "exp"] as const) {
    const value = payload[claim];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const ms = value * 1000;
    if (Math.abs(ms) > 8.64e15) continue;
    const diff = ms - now;
    const span = duration(diff);
    const note = {
      iat: diff > 0 ? `issued in the future, in ${span}` : `issued ${span} ago`,
      nbf: diff > 0 ? `not valid for another ${span}` : `valid since ${span} ago`,
      exp: diff > 0 ? `expires in ${span}` : `expired ${span} ago`,
    }[claim];
    claims.push({ claim, value, date: new Date(ms).toISOString(), note });
  }
  return claims;
}

export function isExpired(payload: JsonObject, now = Date.now()): boolean | null {
  return typeof payload.exp === "number" ? payload.exp * 1000 <= now : null;
}
