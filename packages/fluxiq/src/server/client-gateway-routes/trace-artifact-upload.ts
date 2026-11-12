import type { FluxIQ } from "../../framework/index.ts";
import type { ProgramRouteResponse } from "../program-route/index.ts";
import { readUploadBody } from "./read-upload-body.ts";
import { uploadResponse } from "./upload-response.ts";

const MEDIA = new Set(["text/html", "text/css", "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/svg+xml", "image/bmp", "image/x-icon", "image/vnd.microsoft.icon", "font/woff", "font/woff2", "font/ttf", "font/otf", "font/sfnt", "font/collection"]);

/** Authenticated upload intake shared by the panel and headless transports. */
export async function uploadTraceArtifact(input: {
  fluxiq: FluxIQ;
  request: Pick<Request, "headers" | "arrayBuffer">;
  sha256: string;
  sessionId: string;
  stillAuthorized(): boolean | Promise<boolean>;
}): Promise<ProgramRouteResponse> {
  const sha256 = input.sha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(sha256)) return uploadResponse(400, { ok: false, error: "Invalid artifact digest" });
  const mediaType = (input.request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!MEDIA.has(mediaType)) return uploadResponse(415, { ok: false, error: "Trace artifacts must be HTML, CSS, an image or a font." });
  const body = await readUploadBody(input.request, "Trace artifact");
  if ("status" in body) return body;
  if (!await input.stillAuthorized()) return uploadResponse(403, { ok: false, error: "The upload's authorization is no longer current." });
  const intake = input.fluxiq.programs.clientGateway.receiveTraceArtifact(input.sessionId, { sha256, mediaType, bytes: body });
  if (intake.status === "refused") return uploadResponse(409, { ok: false, error: "Trace artifact digest does not match its bytes." });
  return uploadResponse(200, { ok: true, payload: { sha256, traces: intake.traces } });
}
