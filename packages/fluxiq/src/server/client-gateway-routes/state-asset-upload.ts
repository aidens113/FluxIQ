import type { FluxIQ } from "../../framework/index.ts";
import type { ProgramRouteResponse } from "../program-route/index.ts";
import { readUploadBody } from "./read-upload-body.ts";
import { uploadResponse } from "./upload-response.ts";

const MEDIA = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Project-bound state-image intake, with the caller rechecked after its body arrives. */
export async function uploadStateAsset(input: {
  fluxiq: FluxIQ;
  request: Pick<Request, "headers" | "arrayBuffer">;
  projectId: string;
  sha256: string;
  recordingId?: string;
  clientSessionId?: string;
  stillAuthorized(): boolean | Promise<boolean>;
}): Promise<ProgramRouteResponse> {
  const sha256 = input.sha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(sha256)) return uploadResponse(400, { ok: false, error: "Invalid object digest" });
  const mediaType = (input.request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!MEDIA.has(mediaType)) return uploadResponse(415, { ok: false, error: "State asset uploads must use image/png, image/jpeg, image/webp, or image/gif." });
  const body = await readUploadBody(input.request, "State asset");
  if ("status" in body) return body;
  if (!await input.stillAuthorized()) return uploadResponse(403, { ok: false, error: "The upload's authorization is no longer current." });
  try {
    const asset = await input.fluxiq.programs.automationStudio.writeProjectObjectAsset({ projectId: input.projectId,
      ...(input.recordingId ? { recordingId: input.recordingId } : {}),
      ...(input.clientSessionId ? { traceIntake: { sessionId: input.clientSessionId, gateway: input.fluxiq.programs.clientGateway } } : {}),
      content: Buffer.from(body), mediaType, expectedSha256: sha256 });
    return uploadResponse(201, { ok: true, payload: asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "State asset could not be stored.";
    return uploadResponse(message.includes("digest does not match") ? 409 : message.includes("not enabled") ? 503 : 400, { ok: false, error: message });
  }
}
