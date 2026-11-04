// The version a run names and every version it calls, read from the library. Each is
// immutable and pinned, so what runs is exactly what was saved. A call the library
// cannot answer, calls that go round in a circle and calls that go too deep are a part
// that cannot run, reported before anything is read of the page.
import type { AutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "../../../../../components/automation/control-flow/index.ts";
import { AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH } from "../../../../../engine/automation/frames/index.ts";
import type { AutomationStudioPartSnapshot } from "../../../../../runtime/project-parts/index.ts";
import type { AutomationStudioProjectPartStores } from "../stores.ts";

export type ProjectPartRunEntry = {
  card: AutomationStudioSubflowCard;
  snapshot: AutomationStudioPartSnapshot;
  /** The graph this version was first saved from, and the revision of it: what a judged run that ran this version is about. */
  source: { graphFlowId: string; revision: number | null };
  /** Each call step of this version, by its node id: the version it pins. */
  calls: ReadonlyMap<string, { partId: string; version: number }>;
};

export type ProjectPartRunClosure =
  | { kind: "not_found" }
  | { kind: "calls_not_available" }
  | { kind: "call_cycle" }
  | { kind: "call_too_deep" }
  | { kind: "found"; root: ProjectPartRunEntry; entries: ReadonlyMap<string, ProjectPartRunEntry> };

export const projectPartRunKey = (partId: string, version: number): string => `${partId}@${version}`;

export async function readProjectPartRunClosure(stores: AutomationStudioProjectPartStores, partId: string, version: number | undefined): Promise<ProjectPartRunClosure> {
  const part = await found(() => stores.parts.getPart(partId));
  const wanted = Number.isInteger(version) && (version ?? 0) >= 1 ? version! : part?.latestVersion;
  if (!part || wanted === undefined) return { kind: "not_found" };
  const root = await entryOf(stores, part.partId, wanted);
  if (!root) return { kind: "not_found" };
  const entries = new Map<string, ProjectPartRunEntry>([[projectPartRunKey(part.partId, wanted), root]]);
  const stopped = await walk(stores, root, entries, [projectPartRunKey(part.partId, wanted)]);
  return stopped ? { kind: stopped } : { kind: "found", root, entries };
}

/** Reads every version `entry` calls along this path of calls; what stopped it, or nothing when all of it can run. */
async function walk(stores: AutomationStudioProjectPartStores, entry: ProjectPartRunEntry, entries: Map<string, ProjectPartRunEntry>, path: readonly string[]): Promise<"calls_not_available" | "call_cycle" | "call_too_deep" | undefined> {
  const callSteps = entry.snapshot.graph.nodes.filter((node) => node.definitionId === AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID);
  if (callSteps.some((node) => !entry.calls.has(node.id))) return "calls_not_available";
  for (const call of entry.calls.values()) {
    const key = projectPartRunKey(call.partId, call.version);
    if (path.includes(key)) return "call_cycle";
    if (path.length >= AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH) return "call_too_deep";
    const callee = entries.get(key) ?? await entryOf(stores, call.partId, call.version);
    if (!callee) return "calls_not_available";
    entries.set(key, callee);
    const stopped = await walk(stores, callee, entries, [...path, key]);
    if (stopped) return stopped;
  }
  return undefined;
}

async function entryOf(stores: AutomationStudioProjectPartStores, partId: string, version: number): Promise<ProjectPartRunEntry | undefined> {
  const record = await stores.parts.getVersion(partId, version);
  const card = record ? await stores.cardOf(record) : undefined;
  const snapshot = card ? snapshotOf(await stores.parts.readSnapshot(partId, version)) : undefined;
  if (!card || !snapshot) return undefined;
  const calls = new Map((await stores.parts.listCallsFrom({ partId, version })).map((call) => [call.callerNodeId, { partId: call.partId, version: call.version }]));
  return { card, snapshot, calls, source: { graphFlowId: record!.sourceGraphFlowId, revision: record!.sourceGraphRevision } };
}

/** A snapshot this version of the runner reads, or nothing: a run never guesses at one it cannot. */
function snapshotOf(value: unknown): AutomationStudioPartSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const snapshot = value as Partial<AutomationStudioPartSnapshot>;
  const readable = snapshot.schemaVersion === "automation-studio.project-part.v1" && Array.isArray(snapshot.graph?.nodes) && Array.isArray(snapshot.graph?.edges) && Array.isArray(snapshot.start?.conditions);
  return readable ? snapshot as AutomationStudioPartSnapshot : undefined;
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
