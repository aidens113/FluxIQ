import type { AutomationStudioRuntimeBundles } from "../registry.ts";
import type { AutomationStudioRuntimeView } from "../view.ts";
import type { AutomationStudioRuntimeProjectDomainLookup } from "../project-domain-lookup.ts";

/** Guard primitive for later service wiring; never invents project authority for unscoped host methods. */
export class AutomationStudioRuntimeFallbackGuard {
  constructor(private readonly runtimes: AutomationStudioRuntimeBundles, private readonly lookup: AutomationStudioRuntimeProjectDomainLookup) {}

  run<T>(projectId: string | null | undefined, operation: (fallback: AutomationStudioRuntimeView) => T): T | Promise<Awaited<T>> {
    // Keep today's path synchronous, with the raw fallback objects and no authority lookup.
    if (!this.runtimes.multiple) return operation(this.runtimes.fallback);
    if (projectId === null) return operation(this.runtimes.forDomain(null));
    if (!projectId) throw new Error("runtime_bundle.project_authority_unknown");
    return this.#checked(projectId, operation);
  }
  async #checked<T>(projectId: string, operation: (fallback: AutomationStudioRuntimeView) => T): Promise<Awaited<T>> {
    const domainId = await this.lookup(projectId);
    if (domainId === undefined) throw new Error("runtime_bundle.project_authority_unknown");
    const selected = this.runtimes.forDomain(domainId);
    if (selected !== this.runtimes.fallback) throw new Error("runtime_bundle.cross_domain_use");
    return await operation(selected);
  }
}
