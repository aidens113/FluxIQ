import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { CLIENT_GATEWAY_PROTOCOL_VERSIONS, FLUXIQ_CONNECT_PATHS, fluxiqDiscoveryDocumentSchema } from "../../../lib/request-guard";

export type DiscoveryBuild = { ok: true; document: unknown } | { ok: false; fields: string[] };

/** Builds and validates the discovery document from the environment; a refusal names field paths only. */
export function buildDiscoveryDocument(env: Readonly<Record<string, string | undefined>>): DiscoveryBuild {
  let settings;
  try {
    settings = resolveFluxIQDeploymentSettings(env);
  } catch {
    return { ok: false, fields: ["deployment_settings"] };
  }
  const signUpUrl = env.FLUXIQ_SIGN_UP_URL?.trim();
  const candidate = {
    fluxiqDiscoveryVersion: 1,
    instance: { name: env.FLUXIQ_INSTANCE_NAME?.trim() || "FluxIQ", profile: settings.profile },
    origin: settings.publicOrigin,
    gatewayUrl: settings.gateway.publicUrl,
    connect: {
      authorizeUrl: FLUXIQ_CONNECT_PATHS.authorize,
      tokenUrl: FLUXIQ_CONNECT_PATHS.token,
      revokeUrl: FLUXIQ_CONNECT_PATHS.revoke,
      codeEntryUrl: FLUXIQ_CONNECT_PATHS.codeEntry,
      ...(signUpUrl ? { signUpUrl } : {})
    },
    protocols: { clientGateway: [...CLIENT_GATEWAY_PROTOCOL_VERSIONS] },
    minimumClient: { "browser-extension": "0.1.0" }
  };
  const parsed = fluxiqDiscoveryDocumentSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, document: parsed.data };
  return { ok: false, fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))] };
}
