// The one write of a Flow's parts into the project's library, made when a Flow is
// saved. A free function, as `flow-graph-judgements.ts` is, because the service
// is at its own method budget; the service calls it and nothing else here.
//
// For each non-primary part (a primary one only when the person asked for it to
// be kept): derive its card, and if its shape is already in the library, keep
// that and write nothing; if it is a new shape of a part already there, write the
// next version; else write version 1. A part that cannot enter the library is a
// `skipped` entry with a stable reason. A project database that cannot be
// written propagates: a save that quietly did nothing would leave the library
// with a hole nothing could tell from a part that never existed.
import { parseAutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import { deriveAutomationStudioPartCard, type AutomationStudioPartCallee } from "../../../../runtime/project-parts/index.ts";
import { AutomationStudioProjectPartStore, type AutomationStudioProjectPartVersionRecord } from "../../../persistence/automation/index.ts";
import { projectPartCallOrder, projectPartCallTargets } from "./call-order.ts";
import { projectPartIdOf, projectPartKeyOf } from "./part-id.ts";
import type { AutomationStudioAppliedFlowPart, AutomationStudioSaveProjectPartsInput, AutomationStudioSaveProjectPartsResult } from "./types.ts";

const UNPROVEN = { tier: "unproven", counts: { judgedYes: 0, zeroModelRuns: 0, failures: 0 } } as const;

export async function saveProjectPartsOfAppliedFlow(input: AutomationStudioSaveProjectPartsInput): Promise<AutomationStudioSaveProjectPartsResult> {
  const result: AutomationStudioSaveProjectPartsResult = { saved: [], skipped: [] };
  const { ordered, cyclic } = projectPartCallOrder(input.subflows);
  const store = await AutomationStudioProjectPartStore.open({ pool: input.pool, projectId: input.projectId });
  try {
    const kept = new Map<string, { partId: string; version: AutomationStudioProjectPartVersionRecord }>();
    for (const entry of ordered) {
      const subflowId = entry.subflow.subflowId;
      if (cyclic.has(subflowId)) {
        result.skipped.push({ subflowId, reason: "part.call_cycle" });
        continue;
      }
      if (entry.subflow.role === "primary" && entry.explicit !== true) {
        result.skipped.push({ subflowId, reason: "part.primary_not_explicit" });
        continue;
      }
      const partId = projectPartIdOf(input.flowId, projectPartKeyOf(entry));
      const callees: Record<string, AutomationStudioPartCallee> = {};
      for (const target of projectPartCallTargets(entry)) {
        const callee = kept.get(target.subflowId);
        const known = callee ? calleeOf(callee.partId, callee.version) : undefined;
        if (known) callees[target.subflowId] = known;
      }
      const existing = await store.getPart(partId);
      const derived = deriveAutomationStudioPartCard({
        partId,
        version: (existing?.latestVersion ?? 0) + 1,
        graph: entry.graphFlow,
        subflowName: entry.subflow.name,
        ...(entry.subflow.description !== undefined ? { subflowDescription: entry.subflow.description } : {}),
        ...(input.words?.[subflowId] ? { words: input.words[subflowId] } : {}),
        requestWords: input.requestWords,
        ...(input.startLocation !== undefined ? { startLocation: input.startLocation } : {}),
        callees
      });
      if ("skipped" in derived) {
        result.skipped.push({ subflowId, reason: derived.skipped, ...(derived.detail !== undefined ? { detail: derived.detail } : {}) });
        continue;
      }
      const written = await store.writeVersion({
        partId,
        sourceFlowId: input.flowId,
        sourceSubflowId: subflowId,
        card: derived.card,
        searchable: derived.searchable,
        shapeHash: derived.card.shapeHash,
        facets: derived.facets,
        snapshot: derived.snapshot,
        sourceGraphFlowId: entry.graphFlow.flowId,
        sourceGraphRevision: entry.sourceGraphRevision ?? null,
        calls: derived.callSites,
        ...(input.now !== undefined ? { now: input.now } : {})
      });
      kept.set(subflowId, { partId: written.part.partId, version: written.version });
      result.saved.push({ subflowId, partId: written.part.partId, version: written.version.version, status: written.status });
    }
    await recordFlowGraphCalls(store, input, kept, result);
  } finally {
    await store.close();
  }
  return result;
}

/** What a caller needs of a part it calls, read back from the version as stored: its shape, classes and sites. */
function calleeOf(partId: string, version: AutomationStudioProjectPartVersionRecord): AutomationStudioPartCallee | undefined {
  const parsed = parseAutomationStudioSubflowCard({ ...(version.card as Record<string, unknown>), trust: UNPROVEN });
  if (!parsed.ok) return undefined;
  return { partId, version: version.version, shapeHash: parsed.card.shapeHash, lastingClasses: parsed.card.lastingClasses, sites: parsed.card.sites };
}

/** The graphs that were not kept as parts (the primary's, usually) still call the ones that were: recorded as the Flow's own calls. */
async function recordFlowGraphCalls(
  store: AutomationStudioProjectPartStore,
  input: AutomationStudioSaveProjectPartsInput,
  kept: ReadonlyMap<string, { partId: string; version: AutomationStudioProjectPartVersionRecord }>,
  result: AutomationStudioSaveProjectPartsResult
): Promise<void> {
  const savedIds = new Set(result.saved.map((saved) => saved.subflowId));
  for (const entry of input.subflows as readonly AutomationStudioAppliedFlowPart[]) {
    if (savedIds.has(entry.subflow.subflowId)) continue;
    for (const target of projectPartCallTargets(entry)) {
      const callee = kept.get(target.subflowId);
      if (callee) await store.recordFlowGraphCall({ flowId: entry.graphFlow.flowId, nodeId: target.nodeId, partId: callee.partId, version: callee.version.version });
    }
  }
}
