import { KeySessionError } from "../error.ts";

/** A canonical base64url value with exactly the protocol's number of decoded bytes. */
export function decodeKeyValue(value: unknown, bytes: number): Buffer {
  if (typeof value !== "string" || value.length !== Math.ceil(bytes * 4 / 3) || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new KeySessionError("key.bad_proof");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== bytes || decoded.toString("base64url") !== value) throw new KeySessionError("key.bad_proof");
  return decoded;
}
