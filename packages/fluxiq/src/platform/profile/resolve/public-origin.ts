import type { FluxIQProfile } from "@fluxiq/contracts/platform";

/** The canonical public origin (`FLUXIQ_PUBLIC_ORIGIN`): required off `local`, https on `service`. */
export function resolvePublicOrigin(profile: FluxIQProfile, env: Readonly<Record<string, string | undefined>>): string {
  const raw = env.FLUXIQ_PUBLIC_ORIGIN?.trim() ?? "";
  if (raw === "") {
    if (profile !== "local") throw new Error(`FLUXIQ_PUBLIC_ORIGIN is required on the ${profile} profile.`);
    return `http://127.0.0.1:${env.PORT?.trim() || 3000}`;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("FLUXIQ_PUBLIC_ORIGIN must be an absolute http(s) origin.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("FLUXIQ_PUBLIC_ORIGIN must be an http(s) origin.");
  if (profile === "service" && url.protocol !== "https:") throw new Error("FLUXIQ_PUBLIC_ORIGIN must be https on the service profile.");
  return url.origin;
}
