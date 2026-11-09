import type { FluxIQ } from "../../framework/index.ts";

/** The domain the environment names (`FLUXIQ_DOMAIN_ID`, else `FLUXIQ_HOST_DOMAIN`), or null. */
export function explicitFluxIQDomainId(): string | null {
  return (process.env.FLUXIQ_DOMAIN_ID || process.env.FLUXIQ_HOST_DOMAIN || "").trim() || null;
}

/** The host's one registered domain, when the instance has none active and none is named in the environment. */
export function soleHostDomainId(fluxiq: FluxIQ): string | null {
  if (fluxiq.activeDomainId) return null;
  if (explicitFluxIQDomainId()) return null;
  const domains = fluxiq.domains.summaries();
  return domains.length === 1 ? domains[0]!.id : null;
}
