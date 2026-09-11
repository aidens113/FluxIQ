// A TOTP code computed the way an authenticator app would, so the suites can
// satisfy a second factor without one.

import crypto from "node:crypto";

export function testTotpCode(secret: string, nowMs = Date.now()): string {
  const counter = Math.floor(nowMs / 30_000);
  const key = decodeBase32(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(counterBuffer).digest();
  const offset = (digest.at(-1) ?? 0) & 0xf;
  const binary = (((digest.at(offset) ?? 0) & 0x7f) << 24) | (((digest.at(offset + 1) ?? 0) & 0xff) << 16) | (((digest.at(offset + 2) ?? 0) & 0xff) << 8) | ((digest.at(offset + 3) ?? 0) & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const raw of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(raw);
    if (index >= 0) bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}
