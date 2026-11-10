import type { IncomingMessage } from "node:http";

export type FluxNodeBodyRead = { ok: true; value: unknown; empty: boolean } | { ok: false; reason: "too_large" | "not_json" };

/** Reads a JSON body, stopping at the size limit instead of buffering what a caller keeps sending. */
export async function readFluxNodeJsonBody(request: IncomingMessage, limit: number): Promise<FluxNodeBodyRead> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const piece = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += piece.length;
    if (size > limit) return { ok: false, reason: "too_large" };
    chunks.push(piece);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return { ok: true, value: undefined, empty: true };
  try {
    return { ok: true, value: JSON.parse(text) as unknown, empty: false };
  } catch (error) {
    if (error instanceof SyntaxError) return { ok: false, reason: "not_json" };
    throw error;
  }
}
