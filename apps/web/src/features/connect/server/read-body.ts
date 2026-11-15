const MAX_CONNECT_BODY_BYTES = 8 * 1024;
export type ConnectBodyReading = { ok: true; text: string } | { ok: false; status: 400 | 413 };

/** Enforce the limit while streaming, including undeclared and dishonestly declared request bodies. */
export async function readConnectBody(request: Request): Promise<ConnectBodyReading> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || !Number.isSafeInteger(Number(declared)))) return { ok: false, status: 400 };
  if (declared !== null && Number(declared) > MAX_CONNECT_BODY_BYTES) return { ok: false, status: 413 };
  if (!request.body) return { ok: false, status: 400 };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_CONNECT_BODY_BYTES) {
        await reader.cancel().catch(() => { /* best-effort: discard the rejected oversized request body */ });
        return { ok: false, status: 413 };
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}
