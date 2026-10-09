// The requirement gate (C10 of the state-aware recovery plan): a Flow, and each
// Subflow graph a run executes, may declare in `metadata.requires` the semantic
// and host capabilities it was authored against. A run whose executor or
// connected client lacks one of them is refused before any step, with a reason
// a person can act on, rather than running under semantics it was not written
// for. A Flow that declares nothing runs exactly as before.
//
// Two sides grant an id:
// - the executor grants `flow.*` ids: the ones this build of Core implements
//   (`AUTOMATION_STUDIO_EXECUTOR_GRANTED_REQUIREMENTS`, extended by the work
//   that implements each), plus any id the run's executor options carry in
//   `runtimeCapabilities`;
// - every other id is a host capability, granted when a ready client session
//   declared it in its hello or a later `client.capabilities` message.

import type { JsonObject } from "../../../../../core/index.ts";
import type { FluxIQRuntimeClient } from "../../../../../runtime/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../executor/index.ts";

/** The capability ids a Flow may name in `metadata.requires`. */
export const AUTOMATION_STUDIO_REQUIREMENT_IDS = {
  /** Situation handlers (`on before|retry|fail|start|next`) run by the executor. */
  flowHandlers: "flow.handlers@1",
  /** Callable parts invoked with `call:`, with declared inputs and outputs. */
  flowSubflowCalls: "flow.subflow-calls@1",
  /** The connected client reports page facts the runtime can test. */
  webFacts: "web.facts@1",
  /** The connected client can say what an uncertain action already did before it is retried. */
  webActionsReconcile: "web.actions.reconcile@1"
} as const;

/**
 * The executor-side ids this build of Core implements. Empty until the work
 * that implements a `flow.*` id lands and adds it here; until then a Flow that
 * requires it is refused rather than run without it.
 */
export const AUTOMATION_STUDIO_EXECUTOR_GRANTED_REQUIREMENTS: readonly string[] = [];

/** Which side grants a requirement, and the words a person is shown for it. */
export type AutomationStudioRequirement = { id: string; side: "executor" | "host"; plainName: string };

/** Why a run was refused: the first requirement nothing granted, and the sentence to show. */
export type AutomationStudioRequirementRefusal = { missing: AutomationStudioRequirement; reason: string };

const PLAIN_NAMES: Record<string, string> = {
  [AUTOMATION_STUDIO_REQUIREMENT_IDS.flowHandlers]: "handlers for interruptions",
  [AUTOMATION_STUDIO_REQUIREMENT_IDS.flowSubflowCalls]: "calls to reusable parts",
  [AUTOMATION_STUDIO_REQUIREMENT_IDS.webFacts]: "page facts",
  [AUTOMATION_STUDIO_REQUIREMENT_IDS.webActionsReconcile]: "checking what an action already did before retrying it"
};

/** The ids the given graphs declare in `metadata.requires`, deduplicated, in order of first declaration. */
export function automationStudioDeclaredRequirements(flows: ReadonlyArray<{ metadata?: JsonObject | undefined } | null | undefined>): string[] {
  const declared = new Set<string>();
  for (const flow of flows) {
    const requires = flow?.metadata?.requires;
    if (!Array.isArray(requires)) continue;
    for (const id of requires) if (typeof id === "string" && id.trim()) declared.add(id.trim());
  }
  return [...declared];
}

/**
 * The first requirement neither side grants, or `null` when all are granted.
 * `clients` are the ready sessions the run could dispatch to; a host id is
 * granted when any of them declares it.
 */
export function automationStudioRequirementRefusal(input: {
  required: readonly string[];
  executorIds: Iterable<string>;
  clients: ReadonlyArray<Pick<FluxIQRuntimeClient, "label" | "capabilities">>;
}): AutomationStudioRequirementRefusal | null {
  const executorIds = new Set(input.executorIds);
  const hostIds = new Set(input.clients.flatMap((client) => client.capabilities.map((capability) => capability.id)));
  for (const id of input.required) {
    const missing: AutomationStudioRequirement = { id, side: id.startsWith("flow.") ? "executor" : "host", plainName: PLAIN_NAMES[id] ?? id };
    if (missing.side === "executor" ? executorIds.has(id) : hostIds.has(id)) continue;
    return { missing, reason: refusalReason(missing, input.clients) };
  }
  return null;
}

/** A run refused before any step because a requirement is missing; `message` is the plain reason. */
export class AutomationStudioRunRequirementError extends Error {
  readonly code = "run.requirement_missing";
  readonly missing: AutomationStudioRequirement;

  constructor(refusal: AutomationStudioRequirementRefusal) {
    super(refusal.reason);
    this.name = "AutomationStudioRunRequirementError";
    this.missing = refusal.missing;
  }
}

/**
 * Refuses the run, by throwing `AutomationStudioRunRequirementError`, when the
 * graphs it is about to execute require something this executor or the
 * connected client does not offer. Called before the first step; a run whose
 * graphs declare nothing returns at once without reading any session.
 */
export function assertAutomationStudioRunRequirements(input: {
  flows: ReadonlyArray<{ metadata?: JsonObject | undefined } | null | undefined>;
  graphOptions: Pick<AutomationStudioGraphExecutionOptions, "runtimeCapabilities">;
  runtimeService?: { clients(): FluxIQRuntimeClient[] } | undefined;
  /** The domain the run is bound to; a client bound to another domain grants nothing. */
  domainId?: string | null | undefined;
  executorGranted?: readonly string[] | undefined;
}): void {
  const required = automationStudioDeclaredRequirements(input.flows);
  if (!required.length) return;
  const clients = (input.runtimeService?.clients() ?? []).filter((client) => client.status === "ready"
    && (!input.domainId || client.domainId === undefined || client.domainId === null || client.domainId === input.domainId));
  const refusal = automationStudioRequirementRefusal({
    required,
    executorIds: [...(input.executorGranted ?? AUTOMATION_STUDIO_EXECUTOR_GRANTED_REQUIREMENTS), ...(input.graphOptions.runtimeCapabilities ?? [])],
    clients
  });
  if (refusal) throw new AutomationStudioRunRequirementError(refusal);
}

function refusalReason(missing: AutomationStudioRequirement, clients: ReadonlyArray<Pick<FluxIQRuntimeClient, "label">>): string {
  if (missing.side === "executor") return `This automation needs ${missing.plainName}, which this version of FluxIQ doesn't offer yet. Update FluxIQ and run it again.`;
  if (!clients.length) return `This automation needs ${missing.plainName}, but no connected client offers it. Connect an up-to-date client and run it again.`;
  const label = clients.length === 1 && clients[0]?.label ? clients[0].label : "the connected client";
  return `This automation needs ${missing.plainName}, which ${label} doesn't offer yet. Update ${label} and run it again.`;
}
