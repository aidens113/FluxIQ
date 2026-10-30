import { isFluxIQProfile, isPublicClientGatewayBind, type FluxIQProfile } from "@fluxiq/contracts/platform";
import type { FluxIQDeploymentSettings } from "../types.ts";
import { parseIntegerSetting } from "./parse-integer-setting.ts";
import { resolveGatewayLimits } from "./gateway-limits.ts";
import { resolveGatewayPublicUrl } from "./gateway-public-url.ts";
import { resolvePublicOrigin } from "./public-origin.ts";

type Env = Readonly<Record<string, string | undefined>>;

function resolveProfile(env: Env): FluxIQProfile {
  const raw = env.FLUXIQ_PROFILE?.trim() ?? "";
  if (raw === "") return "local";
  if (!isFluxIQProfile(raw)) throw new Error("FLUXIQ_PROFILE must be local, self-hosted or service.");
  return raw;
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

/** Resolves every lane-A deployment setting from the environment; `local` defaults equal today's behaviour. */
export function resolveFluxIQDeploymentSettings(env: Env): FluxIQDeploymentSettings {
  const profile = resolveProfile(env);
  const host = env.FLUXIQ_CLIENT_GATEWAY_HOST?.trim() || "127.0.0.1";
  const port = parseIntegerSetting("FLUXIQ_CLIENT_GATEWAY_PORT", env.FLUXIQ_CLIENT_GATEWAY_PORT, 4777, false) as number;
  if (port > 65535) throw new Error("FLUXIQ_CLIENT_GATEWAY_PORT must be at most 65535.");
  const rawPath = env.FLUXIQ_CLIENT_GATEWAY_PATH?.trim() || "/client";
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const loopbackBind = isLoopbackHost(host);
  const publicOrigin = resolvePublicOrigin(profile, env);
  const httpsOrigin = publicOrigin.startsWith("https:");
  const allowedOrigins = (env.FLUXIQ_CLIENT_GATEWAY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  return {
    profile,
    public: isPublicClientGatewayBind({ profile, loopbackBind }),
    publicOrigin,
    gateway: {
      enabled: env.FLUXIQ_CLIENT_GATEWAY_ENABLED !== "false",
      host,
      port,
      path,
      loopbackBind,
      publicUrl: resolveGatewayPublicUrl({ profile, override: env.FLUXIQ_PUBLIC_CLIENT_WS_URL, host, port, path, publicOrigin }),
      allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : undefined,
      limits: resolveGatewayLimits(profile, env)
    },
    trustProxy: env.FLUXIQ_TRUST_PROXY === "true",
    // "0" or "off" turns the drain off: SIGTERM closes at once, as today.
    drainSeconds: parseIntegerSetting("FLUXIQ_DRAIN_SECONDS", env.FLUXIQ_DRAIN_SECONDS, profile === "local" ? 0 : 30, true) ?? 0,
    session: httpsOrigin ? { name: "__Host-fluxiq_session", secure: true } : { name: "fluxiq_session", secure: env.NODE_ENV === "production" },
    setupCodeFile: env.FLUXIQ_SETUP_CODE_FILE?.trim() || null,
    logFormat: env.FLUXIQ_LOG_FORMAT === "json" || env.FLUXIQ_LOG_FORMAT === "text" ? env.FLUXIQ_LOG_FORMAT : profile === "local" ? "text" : "json"
  };
}
