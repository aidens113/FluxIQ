import { FluxIQ } from "../../framework/index.ts";
import { applyHostInstanceRegistrations } from "../../platform/panel/index.ts";
import { explicitFluxIQDomainId, soleHostDomainId, type FluxIQHostModuleRegistration } from "../host-module/index.ts";

/** A domain host module, loaded: its path and its registration. */
export type LoadedHostModule = { path: string; register: FluxIQHostModuleRegistration };

/**
 * The instance a server serves, built as the web panel builds its primary:
 * with a host module and no domain named, an instance is first opened to read
 * the host's domains and closed, and when the host registers exactly one, the
 * instance is opened again with it active. An instance the host refused is
 * closed rather than left open.
 */
export async function openHostInstance(rootDir: string, host: LoadedHostModule | null): Promise<FluxIQ> {
  if (!host) return FluxIQ.create({ rootDir });
  const domainId = explicitFluxIQDomainId() ? null : await probeHostDomain(rootDir, host);
  return withHost(FluxIQ.create({ rootDir, ...(domainId ? { domainId } : {}) }), host);
}

async function probeHostDomain(rootDir: string, host: LoadedHostModule): Promise<string | null> {
  const probe = await withHost(FluxIQ.create({ rootDir }), host);
  try {
    return soleHostDomainId(probe);
  } finally {
    await probe.close({ mode: "evict" });
  }
}

async function withHost(fluxiq: FluxIQ, host: LoadedHostModule): Promise<FluxIQ> {
  try {
    return applyHostInstanceRegistrations(fluxiq, [host.register]);
  } catch (error) {
    await fluxiq.close({ mode: "evict" });
    throw error;
  }
}
