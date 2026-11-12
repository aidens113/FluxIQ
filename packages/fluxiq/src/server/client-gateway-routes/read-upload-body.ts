import type { ProgramRouteResponse } from "../program-route/index.ts";
import { uploadResponse } from "./upload-response.ts";

/** Reads the existing upload contract, checking both declared and actual size. */
export async function readUploadBody(request: Pick<Request, "headers" | "arrayBuffer">, label: string): Promise<Uint8Array | ProgramRouteResponse> {
  const maximum = 20 * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximum) return uploadResponse(413, { ok: false, error: `${label} upload is too large.` });
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) return uploadResponse(400, { ok: false, error: `${label} upload body is required.` });
  if (bytes.byteLength > maximum) return uploadResponse(413, { ok: false, error: `${label} upload is too large.` });
  return bytes;
}
