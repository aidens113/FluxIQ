import { fluxNodeRuntimeSchema } from "@fluxiq/contracts/fluxnode";
import type { AutomationStudioRuntimeFallbackState } from "./fallback/index.ts";
import type { AutomationStudioRuntimeView } from "./view.ts";

/** Validate the entire candidate set before publication, including mutable implementation claims. */
export function validateAutomationStudioRuntimeBundles(fallback: AutomationStudioRuntimeFallbackState, bundles: readonly AutomationStudioRuntimeView[]): void {
  const domains = new Set<string>();
  const runtimes = new Set<string>();
  const objects = new Set<object>();
  const fallbackDomain = fallback.domainId ?? fallback.evidence?.domainId ?? fallback.io?.domainId ?? null;
  for (const value of [fallback.domainId, fallback.evidence?.domainId, fallback.io?.domainId]) if (value != null) domains.add(value);
  validateMember({ ...fallback, domainId: fallbackDomain });
  claimRuntime(fallback.runtime);
  claimObjects(fallback);
  for (const bundle of bundles) {
    validateMember(bundle);
    if (!bundle.domainId || domains.has(bundle.domainId)) throw new Error("runtime_bundle.duplicate_domain");
    if (bundle.runtime === undefined) throw new Error("runtime_bundle.invalid_runtime");
    domains.add(bundle.domainId);
    claimRuntime(bundle.runtime);
    claimObjects(bundle);
  }

  function claimRuntime(runtime: string | undefined): void {
    if (runtime === undefined) return;
    if (!fluxNodeRuntimeSchema.safeParse(runtime).success) throw new Error("runtime_bundle.invalid_runtime");
    if (runtimes.has(runtime)) throw new Error("runtime_bundle.duplicate_runtime");
    runtimes.add(runtime);
  }
  function claimObjects(bundle: AutomationStudioRuntimeFallbackState): void {
    for (const value of new Set([bundle.host, bundle.nodes])) {
      if (!value) continue;
      if (objects.has(value)) throw new Error("runtime_bundle.shared_object");
      objects.add(value);
    }
  }
}

function validateMember(bundle: AutomationStudioRuntimeView): void {
  if (bundle.domainId !== null && (typeof bundle.domainId !== "string" || !bundle.domainId.trim())) throw new Error("runtime_bundle.invalid_domain");
  if (bundle.evidence && bundle.evidence.domainId !== bundle.domainId) throw new Error("runtime_bundle.evidence_domain_mismatch");
  if (bundle.io?.domainId != null && bundle.io.domainId !== bundle.domainId) throw new Error("runtime_bundle.io_domain_mismatch");
  if (bundle.nodes?.sdk.list().some((manifest) => manifest.domainId !== bundle.domainId)) throw new Error("runtime_bundle.node_domain_mismatch");
}
