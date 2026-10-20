import { AUTOMATION_STUDIO_DOMAIN_BUILD_STATE_LIMITS as LIMITS } from "./limits.ts";
import { AutomationStudioDomainBuildStateRefusal as Refusal } from "./refusal.ts";
import type { AutomationStudioDomainBuildStateStore } from "./store.ts";
import type { AutomationStudioDomainBuildState } from "./types.ts";

/**
 * What the accessor reads off its owner: a FluxIQ instance, named by shape so
 * this program does not import the framework that hosts it.
 */
type AutomationStudioDomainBuildStateOwner = {
  readonly domains: { maybeGet(domainId: string): unknown };
  readonly programs: { readonly automationStudio: { readonly domainBuildState: AutomationStudioDomainBuildStateStore } };
};

/**
 * The durable build state of `domainId` on `owner` (a FluxIQ instance), for a
 * domain registered there (t728). A domain asks for it once, at registration,
 * and keys its memory by the evidence build scope Core gives each call
 * (`../llm/harness-options/evidence-build-scope.ts`): `buildId` for what lasts
 * one build, none for what outlives it into the Flow's later builds and runs.
 * An unregistered domain is refused: only a domain the host bound may keep
 * state under the host's projects.
 */
export function automationStudioDomainBuildState(owner: AutomationStudioDomainBuildStateOwner, domainId: string): AutomationStudioDomainBuildState {
  if (typeof domainId !== "string" || !LIMITS.id.test(domainId) || !owner.domains.maybeGet(domainId)) throw new Refusal("domain_build_state.domain_unregistered", "domainId");
  const store = owner.programs.automationStudio.domainBuildState;
  return Object.freeze({
    domainId,
    get: (scope, key) => store.get(domainId, scope, key),
    put: (scope, key, value) => store.put(domainId, scope, key, value),
    drop: (scope, key) => store.drop(domainId, scope, key)
  });
}
