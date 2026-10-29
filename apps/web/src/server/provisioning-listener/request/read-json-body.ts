import type { IncomingMessage } from "node:http";

/** The largest body the listener accepts. */
export const MAX_PROVISIONING_BODY_BYTES = 64 * 1024;

/**
 * How much of an oversized body is read and discarded so the caller still
 * receives its 413; past this the connection is cut once the answer is sent.
 */
const DISCARD_LIMIT_BYTES = 1024 * 1024;

/** A parsed JSON body, or why there is none: 413 for a body over the cap, 400 otherwise. `close` asks for the connection to be closed after the answer. */
export type JsonBodyReading =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; message: string; close: boolean };

const TOO_LARGE = `The body is larger than ${MAX_PROVISIONING_BODY_BYTES / 1024} KiB.`;

/**
 * Reads the request body up to 64 KiB and parses it as JSON. A declared or
 * streamed body over the cap is refused without being kept; the body is never
 * logged.
 */
export function readJsonBody(request: IncomingMessage): Promise<JsonBodyReading> {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > DISCARD_LIMIT_BYTES) {
    return Promise.resolve({ ok: false, status: 413, message: TOO_LARGE, close: true });
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let received = 0;
    const finish = (reading: JsonBodyReading) => {
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("close", onError);
      resolve(reading);
    };
    const onData = (chunk: Buffer) => {
      received += chunk.length;
      if (received > DISCARD_LIMIT_BYTES) {
        finish({ ok: false, status: 413, message: TOO_LARGE, close: true });
        return;
      }
      if (received <= MAX_PROVISIONING_BODY_BYTES) chunks.push(chunk);
    };
    const onEnd = () => {
      if (received > MAX_PROVISIONING_BODY_BYTES) {
        finish({ ok: false, status: 413, message: TOO_LARGE, close: false });
        return;
      }
      finish(parseJson(Buffer.concat(chunks).toString("utf8")));
    };
    // An error, or a close before the end: the caller went away mid-body.
    const onError = () => {
      finish({ ok: false, status: 400, message: "The body could not be read.", close: true });
    };
    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
    request.on("close", onError);
  });
}

function parseJson(text: string): JsonBodyReading {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, message: "The body is not valid JSON.", close: false };
  }
}
