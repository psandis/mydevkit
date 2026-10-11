import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { TokenEncoding } from "../config/types.js";

/** Each character is drawn independently and uniformly from the alphabet. */
export function password(length: number, alphabet: string): string {
  const chars = Array.from(alphabet);
  return Array.from({ length }, () => chars[randomInt(chars.length)]).join("");
}

export function token(bytes: number, encoding: TokenEncoding): string {
  return randomBytes(bytes).toString(encoding);
}

export function uuid(): string {
  return randomUUID();
}
