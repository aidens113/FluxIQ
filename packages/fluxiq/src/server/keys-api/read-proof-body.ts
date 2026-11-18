import type { IncomingMessage } from "node:http";
import { KeySessionError } from "../../platform/keys/index.ts";

/** The fixed proof shape is small; never buffer arbitrary request bodies. */
export async function readProofBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += part.length;
    if (bytes > 8192) throw new KeySessionError("key.bad_proof");
    chunks.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new KeySessionError("key.bad_proof");
  }
}
