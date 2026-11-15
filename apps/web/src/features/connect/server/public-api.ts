import { connectRevokeRequestSchema, connectTokenErrorSchema, connectTokenRequestSchema, connectTokenResponseSchema, resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { getConnectService, revokeConnectCredential } from "../../../server/connect";
import { readPublicConnectRequest } from "./public-request";
import { connectJson } from "./response";

export async function exchangeConnectToken(request: Request): Promise<Response> {
  try {
    const admitted = await readPublicConnectRequest(request, resolveFluxIQDeploymentSettings(process.env));
    if (!admitted.ok) return admitted.response;
    const parsed = connectTokenRequestSchema.safeParse(admitted.body);
    if (!parsed.success) return tokenRequestRefusal(admitted.body);
    const result = await (await getConnectService()).exchange(parsed.data);
    if (!result.ok) {
      const error = connectTokenErrorSchema.safeParse(result.error);
      if (!error.success) return connectJson({ error: "temporarily_unavailable" }, 503);
      const status = error.data.error === "invalid_client" ? 401 : error.data.error === "rate_limited" ? 429 : error.data.error === "temporarily_unavailable" ? 503 : 400;
      return connectJson({ error: error.data.error }, status);
    }
    const response = connectTokenResponseSchema.safeParse(result.response);
    return response.success ? connectJson(response.data) : connectJson({ error: "temporarily_unavailable" }, 503);
  } catch {
    return connectJson({ error: "temporarily_unavailable" }, 503);
  }
}

function tokenRequestRefusal(body: unknown): Response {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    if ("client_id" in body && !connectTokenRequestSchema.shape.client_id.safeParse(body.client_id).success) return connectJson({ error: "invalid_client" }, 401);
    if ("grant_type" in body && body.grant_type !== "authorization_code") return connectJson({ error: "unsupported_grant_type" }, 400);
  }
  return connectJson({ error: "invalid_request" }, 400);
}

export async function revokeConnectToken(request: Request): Promise<Response> {
  try {
    const admitted = await readPublicConnectRequest(request, resolveFluxIQDeploymentSettings(process.env));
    if (!admitted.ok) return admitted.response;
    const parsed = connectRevokeRequestSchema.safeParse(admitted.body);
    if (!parsed.success) return connectJson({ error: "invalid_request" }, 400);
    await revokeConnectCredential(parsed.data.token);
    return connectJson({});
  } catch {
    return connectJson({ error: "temporarily_unavailable" }, 503);
  }
}
