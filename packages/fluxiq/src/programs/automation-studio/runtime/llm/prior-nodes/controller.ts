import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmRunNodesEffectSafe, automationStudioLlmRunNodesOriginal, runAutomationStudioLlmPriorNodes, type AutomationStudioLlmRunNodesAllowance, type AutomationStudioLlmRunNodesPriorCall } from "../node-reruns/index.ts";
import type { AutomationStudioLlmRerunProvenance, AutomationStudioLlmRerunRecord, AutomationStudioLlmRerunScope } from "../rerun-provenance/index.ts";
import type { AutomationStudioLlmPriorNodesAuthority } from "./authority.ts";
import { automationStudioLlmPriorNodesIdentity } from "./identity.ts";
import { automationStudioLlmPriorNodesEligibility } from "./eligibility.ts";

type Remembered = { kind: "remembered" }
  | Exclude<ReturnType<typeof automationStudioLlmPriorNodesEligibility>, { kind: "eligible" }>
  | { kind: "unproven"; reason: "authority_unavailable" | "unsafe_authority" | "authority_unreadable" | "observed_effect_unproven" | "unsafe_observed_effect" };

/** Loop-private bridge: none of C's originals, identities, receipts or exceptions are published. */
export function automationStudioLlmPriorNodesController(input: {
  provenance: AutomationStudioLlmRerunProvenance;
  authority: AutomationStudioLlmPriorNodesAuthority | undefined;
  currentScope(): AutomationStudioLlmRerunScope | undefined;
  world(): JsonObject;
  allowance(): AutomationStudioLlmRunNodesAllowance;
  admitted(record: AutomationStudioLlmRerunRecord): boolean;
  runMember(record: AutomationStudioLlmRerunRecord, index: number): Promise<{ callId: string; result: unknown }>;
  stopped(): boolean;
  mainCounts(): Readonly<{ executed: number; unproven: number }>;
}) {
  const identity = automationStudioLlmPriorNodesIdentity();
  const loopId = "live-loop";
  const originals = new Map<string, AutomationStudioLlmRunNodesPriorCall>();
  const lists = new Set<string>();
  let guardFailed = false;

  function recordOf(callId: string): AutomationStudioLlmRerunRecord | undefined {
    const found = input.provenance.lookup(callId);
    return found.kind === "available" ? found.record : undefined;
  }

  function lookup(callId: string): AutomationStudioLlmRunNodesPriorCall | undefined {
    const record = recordOf(callId), original = originals.get(callId);
    if (!record || !original || !input.authority) return undefined;
    const scope = input.currentScope();
    if (!scope || identity.original(record, scope) !== original.authorityKey) return undefined;
    return original;
  }

  function usable(callId: string): boolean {
    try {
      const record = recordOf(callId), prior = lookup(callId);
      if (!record || !prior || !input.admitted(record) || !automationStudioLlmRunNodesOriginal(prior, callId, loopId)) return false;
      const current = input.authority?.resolve(record.definitionId, record.parameters, record.effectiveInputs);
      return current?.definitionId === record.definitionId && current.definitionVersion === record.definitionVersion && automationStudioLlmRunNodesEffectSafe(current.effect);
    } catch { return false; }
  }

  return {
    get guardFailed() { return guardFailed; },
    remember(callId: string): Remembered {
      try {
        const record = recordOf(callId), scope = input.currentScope();
        if (!record || !scope || !input.authority) return { kind: "unproven", reason: "authority_unavailable" };
        const eligibility = automationStudioLlmPriorNodesEligibility(record);
        if (eligibility.kind === "unproven") return eligibility;
        if (!record.observedEffect) return { kind: "unproven", reason: "observed_effect_unproven" };
        if (!automationStudioLlmRunNodesEffectSafe(record.observedEffect)) return { kind: "unproven", reason: "unsafe_observed_effect" };
        const current = input.authority.resolve(record.definitionId, record.parameters, record.effectiveInputs);
        if (!current || current.definitionId !== record.definitionId || current.definitionVersion !== record.definitionVersion || !automationStudioLlmRunNodesEffectSafe(current.effect)) return { kind: "unproven", reason: "unsafe_authority" };
        originals.set(callId, {
          callId, loopId, toolId: "core.run_node", definitionId: record.definitionId, definitionVersion: record.definitionVersion,
          input: eligibility.input, effectiveInputs: record.effectiveInputs,
          execution: record.execution, authorityKey: identity.original(record, scope), actionEffect: current.effect, observedEffect: record.observedEffect
        });
        return { kind: "remembered" };
      } catch {
        return { kind: "unproven", reason: "authority_unreadable" };
      }
    },
    candidates(): string[] { return !guardFailed && input.allowance().allowed ? [...originals.keys()].filter(usable) : []; },
    async run(value: unknown, signal?: AbortSignal): Promise<JsonObject> {
      const before = input.mainCounts();
      const result = await runAutomationStudioLlmPriorNodes({
        loopId, value, world: input.world(), ...(signal ? { signal } : {}),
        ports: {
          lookupPriorCall: lookup,
          resolveAuthority(original) {
            const record = recordOf(original.callId), prior = lookup(original.callId);
            if (!record || !prior || !input.admitted(record)) return undefined;
            if (!record.observedEffect || !automationStudioLlmRunNodesEffectSafe(record.observedEffect)) return undefined;
            const current = input.authority?.resolve(record.definitionId, record.parameters, record.effectiveInputs);
            if (!current || !automationStudioLlmRunNodesEffectSafe(current.effect)) return undefined;
            return { definitionId: current.definitionId, definitionVersion: current.definitionVersion, authorityKey: prior.authorityKey, observedEffect: record.observedEffect };
          },
          resolveRerunEffect: (id, parameters) => input.authority?.resolve(id, parameters, {})?.effect,
          allowance: () => input.stopped() ? { allowed: false, reason: "unavailable" } : input.allowance(),
          async runMember(request) {
            const record = recordOf(request.original.callId);
            if (!record || !usable(record.callId)) throw new Error("Prior call no longer admitted.");
            return await input.runMember(record, request.index);
          },
          listGuard: {
            admit(key) { return !guardFailed && !lists.has(identity.hash(key.input)); },
            recorded(key) { lists.add(identity.hash(key.input)); }
          }
        }
      });
      if (result.listRecord === "failed") guardFailed = true;
      const stopped = input.stopped();
      const after = input.mainCounts();
      const executed = after.executed - before.executed, unproven = after.unproven - before.unproven;
      // Closed control facts only. In particular do not spread/stringify `result`:
      // its identity and receipts contain private effective inputs and raw errors.
      return {
        status: stopped ? "stopped" : result.kind,
        requested: result.requested.length,
        executed,
        skipped: Math.max(0, result.requested.length - executed - unproven),
        ...(unproven ? { unproven } : {}),
        ...(result.stop ? { stoppedAt: result.stop.index, reason: result.stop.reason } : stopped ? { reason: "unavailable" } : {})
      };
    }
  };
}
