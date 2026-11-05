// A graph a judged run ran, written as the next version of the saved part it came from,
// through the store's one transaction, with its card and `part_calls`. Nothing older changes.
//
// **Its own source.** A version's trust is read from the verdicts on the graph it was saved
// from, and a repaired version has no graph of a Flow behind it. So it is its own: an id made
// from its part and its shape, at revision 1. A judged run of it names that, and only that
// version's trust moves.
import { parseAutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import type { AutomationStudioPartPin } from "../../../../../engine/automation/frames/index.ts";
import { deriveAutomationStudioPartCard, type AutomationStudioPartCallee, type AutomationStudioPartGraph } from "../../../../../runtime/project-parts/index.ts";
import type { AutomationStudioProjectPartStore } from "../../../../persistence/automation/index.ts";
import { projectPartCallBound } from "../call-bounds.ts";
import { projectPartPinnedCalls } from "../call-order.ts";
import type { ProjectPartRunEntry } from "../run/index.ts";
import { projectPartLineOf } from "../part-interface.ts";

const UNPROVEN = { tier: "unproven", counts: { judgedYes: 0, zeroModelRuns: 0, failures: 0 } } as const;
const SOURCE_REVISION = 1;

/** Where a version made by a repair came from, kept beside its graph: which run, from which version. */
export const PROJECT_PART_REPAIR_METADATA_KEY = "projectPartRepair";

export type ProjectPartNextVersion = {
  pin: AutomationStudioPartPin;
  status: "created" | "new_version" | "existing";
  /** The graph a judged run of this version names. */
  source: { graphFlowId: string; revision: number };
};

/** Writes the next version, or throws with a stable code first in its message: a fix the library cannot keep is never kept quietly. */
export async function projectPartWriteNextVersion(input: {
  store: AutomationStudioProjectPartStore;
  base: ProjectPartRunEntry;
  graph: AutomationStudioPartGraph;
  flowId: string;
  runId: string;
  requestWords: string;
  controlParameterKeys?: ReadonlySet<string> | undefined;
  now: number;
}): Promise<ProjectPartNextVersion> {
  const { store, base } = input;
  const from = await store.getPart(base.card.partId);
  if (!from) throw new Error(`part.not_found: the part this fix came from is not in the library, so it was not kept.`);
  const partId = await projectPartLineOf(store, from.partId, input.graph.interface);
  const existing = await store.getPart(partId);
  const pins = projectPartPinnedCalls(input.graph).map((call) => call.pin);
  const bound = await projectPartCallBound(store, { partId }, pins);
  if (bound) throw new Error(`${bound}: this fix was not kept, because of what its steps call.`);
  const derived = deriveAutomationStudioPartCard({
    partId,
    version: (existing?.latestVersion ?? 0) + 1,
    graph: { ...input.graph, metadata: { ...(base.snapshot.graph.metadata ?? {}), [PROJECT_PART_REPAIR_METADATA_KEY]: { runId: input.runId, fromVersion: base.card.version } } },
    subflowName: base.card.name,
    words: { name: base.card.name, purpose: base.card.purpose },
    requestWords: input.requestWords,
    ...(base.card.sites[0] ? { startLocation: base.card.sites[0] } : {}),
    ...(input.controlParameterKeys ? { controlParameterKeys: [...input.controlParameterKeys] } : {}),
    callees: await calleesOf(store, pins)
  });
  if ("skipped" in derived) throw new Error(`${derived.skipped}: this fix was not kept in the library.`);
  const source = { graphFlowId: `${partId}.repair.${derived.card.shapeHash.slice(0, 24)}`, revision: SOURCE_REVISION };
  const written = await store.writeVersion({
    partId,
    sourceFlowId: from.sourceFlowId,
    sourceSubflowId: from.sourceSubflowId,
    card: derived.card,
    searchable: derived.searchable,
    shapeHash: derived.card.shapeHash,
    facets: derived.facets,
    snapshot: derived.snapshot,
    sourceGraphFlowId: source.graphFlowId,
    sourceGraphRevision: source.revision,
    calls: derived.callSites,
    now: input.now
  });
  // A shape hash leaves a typed value out, so a fix that changed only that finds the version it came from.
  if (written.status === "existing" && written.part.partId === from.partId && written.version.version === base.card.version) throw new Error("part.repair_same_shape: this fix changed nothing the library can tell apart from the version it came from, so it was not kept.");
  return { pin: { partId: written.part.partId, version: written.version.version }, status: written.status, source };
}

async function calleesOf(store: AutomationStudioProjectPartStore, pins: readonly AutomationStudioPartPin[]): Promise<Record<string, AutomationStudioPartCallee>> {
  const callees: Record<string, AutomationStudioPartCallee> = {};
  for (const pin of pins) {
    const version = await store.getVersion(pin.partId, pin.version);
    const parsed = version ? parseAutomationStudioSubflowCard({ ...(version.card as Record<string, unknown>), trust: UNPROVEN }) : undefined;
    if (parsed?.ok) callees[`${pin.partId}@${pin.version}`] = { partId: pin.partId, version: pin.version, shapeHash: parsed.card.shapeHash, lastingClasses: parsed.card.lastingClasses, sites: parsed.card.sites };
  }
  return callees;
}
