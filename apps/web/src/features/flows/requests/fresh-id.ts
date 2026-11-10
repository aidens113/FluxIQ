/**
 * A fresh random UUID (version 4), the only form Core accepts for a run named ahead of time
 * (`run-session/requested-run-id.ts`). Built from `crypto.getRandomValues` because
 * `crypto.randomUUID` exists only on secure pages, and the panel is also opened over plain http
 * on a home network.
 */
export function freshId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
