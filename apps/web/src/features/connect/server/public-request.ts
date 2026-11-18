import { admitClientGatewayOrigin, parseClientGatewayOriginAllowlist, type FluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { readConnectBody } from "./read-body";
import { connectJson } from "./response";

/** Public proof routes use no cookie authority. The explicit header is admission, never proof of trust. */
export async function readPublicConnectRequest(request: Request, settings: FluxIQDeploymentSettings): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  if (settings.profile !== "service") return { ok: false, response: connectJson({ error: "temporarily_unavailable" }, 404) };
  if (request.headers.get("fluxiq-client") !== "browser-extension") return { ok: false, response: connectJson({ error: "invalid_request" }, 400) };
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== settings.publicOrigin) {
    const extension = origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://");
    const { rules } = parseClientGatewayOriginAllowlist(settings.gateway.allowedOrigins ?? []);
    if (!extension || !admitClientGatewayOrigin(origin, { profile: settings.profile, loopbackBind: settings.gateway.loopbackBind, rules }).admitted) return { ok: false, response: connectJson({ error: "invalid_request" }, 403) };
  }
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return { ok: false, response: connectJson({ error: "invalid_request" }, 415) };
  const reading = await readConnectBody(request);
  if (!reading.ok) return { ok: false, response: connectJson({ error: "invalid_request" }, reading.status) };
  try {
    return { ok: true, body: JSON.parse(reading.text) as unknown };
  } catch {
    return { ok: false, response: connectJson({ error: "invalid_request" }, 400) };
  }
}
