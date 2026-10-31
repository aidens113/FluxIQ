import { isFluxIQProfile, type FluxIQProfile } from "@fluxiq/contracts/platform";

/** The deployment profile `FLUXIQ_PROFILE` names: empty or unset is `local`; any other unknown value throws. */
export function resolveFluxIQProfile(env: Readonly<Record<string, string | undefined>>): FluxIQProfile {
  const raw = env.FLUXIQ_PROFILE?.trim() ?? "";
  if (raw === "") return "local";
  if (!isFluxIQProfile(raw)) throw new Error("FLUXIQ_PROFILE must be local, self-hosted or service.");
  return raw;
}
