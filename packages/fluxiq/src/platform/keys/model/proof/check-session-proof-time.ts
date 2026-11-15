import { KeySessionError } from "../error.ts";

export function checkSessionProofTime(time: string, nowMs: number): void {
  const parts = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(time);
  if (!parts) throw new KeySessionError("key.bad_proof");
  const iso = `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}.000Z`;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== iso) throw new KeySessionError("key.bad_proof");
  if (Math.abs(nowMs - timestamp) > 300_000) throw new KeySessionError("key.clock_skew", nowMs);
}
