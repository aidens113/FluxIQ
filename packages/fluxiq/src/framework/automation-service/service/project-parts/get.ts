// Reading one part: its card, its steps in a person's words, what it calls, its
// versions and who calls it. Everything here is names, words a person wrote, hashes
// and counts; the snapshot's graph is read only for the order and kind of its steps.
import type { AutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import type { GetProjectPartRequest, GetProjectPartResponse, ProjectPartCaller, ProjectPartCallNode, ProjectPartVersionEntry } from "../../../../api-contracts/automation.ts";
import { automationStudioPartSteps, type AutomationStudioPartGraph } from "../../../../runtime/project-parts/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../persistence/automation/index.ts";
import type { AutomationStudioProjectPartsRefusal } from "./library-types.ts";
import { projectPartStepOf, type ProjectPartStepCallee } from "./step-words.ts";
import { withProjectPartStores, type AutomationStudioProjectPartStores } from "./stores.ts";

const MAX_CALL_DEPTH = 8;
const NOT_FOUND: AutomationStudioProjectPartsRefusal = { ok: false, code: "parts.not_found", message: "That saved part is not in this project's library." };

export async function getProjectPart(pool: AutomationStudioProjectDatabasePool | undefined, input: GetProjectPartRequest): Promise<GetProjectPartResponse | AutomationStudioProjectPartsRefusal> {
  return withProjectPartStores(pool, input.projectId, async (stores) => {
    const part = await found(() => stores.parts.getPart(input.partId));
    const wanted = Number.isInteger(input.version) && (input.version ?? 0) >= 1 ? input.version! : part?.latestVersion;
    const record = part && wanted !== undefined ? await stores.parts.getVersion(part.partId, wanted) : undefined;
    const card = record ? await stores.cardOf(record) : undefined;
    if (!part || !record || !card) return NOT_FOUND;
    return {
      card,
      steps: await stepsOf(stores, card),
      calls: await callTreeOf(stores, card, [`${card.partId}@${card.version}`]),
      versions: await versionsOf(stores, part.partId),
      callers: await callersOf(stores, part.partId)
    };
  });
}

/** A part id the store refuses is a part that is not there. */
async function found<T>(read: () => Promise<T | undefined>): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof Error && /^Invalid part ID/u.test(error.message)) return undefined;
    throw error;
  }
}

async function stepsOf(stores: AutomationStudioProjectPartStores, card: AutomationStudioSubflowCard): Promise<GetProjectPartResponse["steps"]> {
  const graph = graphOf(await stores.parts.readSnapshot(card.partId, card.version));
  if (!graph) return [];
  const calls = new Map((await stores.parts.listCallsFrom({ partId: card.partId, version: card.version })).map((call) => [call.callerNodeId, call]));
  const steps = [];
  for (const step of automationStudioPartSteps(graph)) {
    const call = calls.get(step.node.id);
    steps.push(projectPartStepOf(step, call ? await calleeOf(stores, call.partId, call.version) : undefined));
  }
  return steps;
}

function graphOf(snapshot: unknown): Pick<AutomationStudioPartGraph, "nodes" | "edges"> | undefined {
  const graph = snapshot && typeof snapshot === "object" ? (snapshot as { graph?: Partial<AutomationStudioPartGraph> }).graph : undefined;
  return graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges) ? { nodes: graph.nodes, edges: graph.edges } : undefined;
}

async function cardAt(stores: AutomationStudioProjectPartStores, partId: string, version: number): Promise<AutomationStudioSubflowCard | undefined> {
  const record = await stores.parts.getVersion(partId, version);
  return record ? stores.cardOf(record) : undefined;
}

async function calleeOf(stores: AutomationStudioProjectPartStores, partId: string, version: number): Promise<ProjectPartStepCallee | undefined> {
  const card = await cardAt(stores, partId, version);
  return card ? { name: card.name, lastingClasses: card.lastingClasses } : undefined;
}

async function callTreeOf(stores: AutomationStudioProjectPartStores, card: AutomationStudioSubflowCard, path: readonly string[]): Promise<ProjectPartCallNode[]> {
  const nodes: ProjectPartCallNode[] = [];
  for (const call of card.calls) {
    const key = `${call.partId}@${call.version}`;
    const callee = await cardAt(stores, call.partId, call.version);
    const deeper = callee && path.length < MAX_CALL_DEPTH && !path.includes(key) ? await callTreeOf(stores, callee, [...path, key]) : [];
    nodes.push({ partId: call.partId, version: call.version, name: callee?.name ?? "A saved part that is no longer in the library", calls: deeper });
  }
  return nodes;
}

async function versionsOf(stores: AutomationStudioProjectPartStores, partId: string): Promise<ProjectPartVersionEntry[]> {
  const entries: ProjectPartVersionEntry[] = [];
  for (const record of await stores.parts.listVersions(partId)) {
    const card = await stores.cardOf(record);
    if (card) entries.push({ version: record.version, createdAtMs: record.createdAtMs, trust: card.trust });
  }
  return entries;
}

async function callersOf(stores: AutomationStudioProjectPartStores, partId: string): Promise<ProjectPartCaller[]> {
  return (await stores.parts.listCallsTo({ partId })).map((call): ProjectPartCaller =>
    call.callerKind === "flow_graph"
      ? { kind: "flow", flowId: call.callerId, nodeId: call.callerNodeId, version: call.version }
      : { kind: "part", partId: call.callerId, callerVersion: call.callerVersion, nodeId: call.callerNodeId, version: call.version }
  );
}
