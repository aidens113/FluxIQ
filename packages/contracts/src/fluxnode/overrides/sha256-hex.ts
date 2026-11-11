// SHA-256 of a text as lowercase hex, through `globalThis.crypto.subtle` as the spec hash does.

export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) throw new Error("An overrides digest needs globalThis.crypto.subtle (a secure browser context or Node 20+).");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
