// A person's "save this": one Subflow of a Flow, kept in the project's library as
// the person asked, through the same write a Flow's own save makes. The Subflows it
// calls come with it (a part whose call cannot be resolved is not kept), and nothing
// else of the Flow does.
import { automationStudioFlowGraphVersion } from "../../../../runtime/flow-authoring/version/index.ts";
import { AutomationStudioProjectStoreUnavailableError, type AutomationStudioProjectDatabasePool } from "../../../persistence/automation/index.ts";
import type { SaveProjectPartRequest, SaveProjectPartResponse } from "../../../../api-contracts/automation.ts";
import { projectPartCallTargets } from "./call-order.ts";
import type { AutomationStudioProjectPartsPorts, AutomationStudioProjectPartsRefusal } from "./library-types.ts";
import { saveProjectPartsOfAppliedFlow } from "./save-applied-flow.ts";
import { projectPartSkipWords } from "./skip-words.ts";
import { firstLiteralAddress } from "./start-location.ts";
import { PARTS_UNAVAILABLE } from "./stores.ts";
import type { AutomationStudioAppliedFlowPart } from "./types.ts";

const PAGE = 100;

export async function keepProjectPart(deps: { pool: AutomationStudioProjectDatabasePool | undefined; ports: AutomationStudioProjectPartsPorts }, input: SaveProjectPartRequest): Promise<SaveProjectPartResponse | AutomationStudioProjectPartsRefusal> {
  if (!deps.pool) return PARTS_UNAVAILABLE;
  const all = await entriesOfFlow(deps.ports, input);
  if (!all.some((entry) => entry.subflow.subflowId === input.subflowId)) return { saved: false, code: "parts.subflow_not_found", message: "That part of the automation was not found." };
  const entries = closureOf(all, input.subflowId);
  const words = { ...(input.name ? { name: input.name } : {}), ...(input.purpose ? { purpose: input.purpose } : {}) };
  const start = firstLiteralAddress(entries.map((entry) => entry.graphFlow));
  try {
    const saved = await saveProjectPartsOfAppliedFlow({
      pool: deps.pool,
      projectId: input.projectId,
      flowId: input.flowId,
      subflows: entries.map((entry) => (entry.subflow.subflowId === input.subflowId ? { ...entry, explicit: true } : entry)),
      requestWords: (await deps.ports.instructionBodies(input.projectId, input.flowId)).join("\n"),
      ...(Object.keys(words).length ? { words: { [input.subflowId]: words } } : {}),
      ...(start ? { startLocation: start } : {})
    });
    const mine = saved.saved.find((entry) => entry.subflowId === input.subflowId);
    if (mine) return { saved: true, partId: mine.partId, version: mine.version, status: mine.status };
    const skipped = saved.skipped.find((entry) => entry.subflowId === input.subflowId);
    if (skipped) return { saved: false, code: skipped.reason, message: projectPartSkipWords(skipped.reason) };
    return { saved: false, code: "parts.save_failed", message: "FluxIQ could not save that part just now." };
  } catch (error) {
    if (AutomationStudioProjectStoreUnavailableError.is(error)) return PARTS_UNAVAILABLE;
    throw error;
  }
}

/** Every Subflow of the Flow with its graph and the revision the graph is at. */
async function entriesOfFlow(ports: AutomationStudioProjectPartsPorts, input: SaveProjectPartRequest): Promise<AutomationStudioAppliedFlowPart[]> {
  const entries: AutomationStudioAppliedFlowPart[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await ports.listFlowSubflowSummaries({ projectId: input.projectId, flowId: input.flowId, limit: PAGE, offset });
    for (const summary of page.subflows) {
      const entry = await entryOf(ports, input, summary.subflowId);
      if (entry) entries.push(entry);
    }
    if (page.subflows.length === 0 || offset + PAGE >= page.total) return entries;
  }
}

async function entryOf(ports: AutomationStudioProjectPartsPorts, input: SaveProjectPartRequest, subflowId: string): Promise<AutomationStudioAppliedFlowPart | undefined> {
  const subflow = await ports.getFlowSubflow(input.projectId, input.flowId, subflowId);
  if (!subflow?.graphFlowId) return undefined;
  const graphFlow = await ports.getFlow(input.projectId, subflow.graphFlowId);
  const revision = automationStudioFlowGraphVersion({ flow: graphFlow }).revision;
  return { subflow, graphFlow, ...(typeof revision === "number" ? { sourceGraphRevision: revision } : {}) };
}

/** The Subflow asked for and every one its graph calls, however deep, in the order the Flow lists them. */
function closureOf(entries: readonly AutomationStudioAppliedFlowPart[], subflowId: string): AutomationStudioAppliedFlowPart[] {
  const wanted = new Set([subflowId]);
  for (let grew = true; grew;) {
    grew = false;
    for (const entry of entries) {
      if (!wanted.has(entry.subflow.subflowId)) continue;
      for (const target of projectPartCallTargets(entry)) if (!wanted.has(target.subflowId)) grew = wanted.add(target.subflowId).has(target.subflowId);
    }
  }
  return entries.filter((entry) => wanted.has(entry.subflow.subflowId));
}
