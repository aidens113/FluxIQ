// The shape of A8 wave 14 candidate towels `run-mv9ul5dy-e9a1b1c1` (t641) on
// another kind of site, for the whole-candidate and subflow replays: the park
// service's campsite search of
// `../../../result-verification/refuted-no/tests/campsite-fixture.ts`, written
// as one list read whose five conditions are the account's, judged by the
// build-test judge with a scripted provider. Trial 2's two nos: call 1 names a
// gap Core cannot settle and advises changing condition 1, every row of which,
// left out by itself, is another copy of a stored row; call 2 names only the
// gap. No task, site, item or answer of any realistic scenario.
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import { automationStudioBuildTestJudge, type AutomationStudioBuildTestVerdict, type AutomationStudioRunResultSummary } from "../../../result-verification/index.ts";
import { CAMP_READ, campsiteInstruction, campsiteRunSummary } from "../../../result-verification/refuted-no/tests/campsite-fixture.ts";
import { GAP_AND_CHANGE_NO as GAP_AND_CHANGE, GAP_NO as GAP } from "../../../result-verification/refuted-no/tests/campsite-readings-fixture.ts";

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

/** A read step: its list, conditions and paging as one object, as a domain's list read takes them. */
const READ_LIST: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.read_list", version: "1.0.0", label: "Read list", description: "Read a list", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "read_list" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "readList", label: "Read list", valueType: "object", required: true }]
};

/** What a submission controller is made with, over the read step's one-node domain. */
export const KEPT_CONDITION_SUBMISSION = {
  projectId: "project.test", flowId: "flow.test", baseDependencyDigest: "accepted.base",
  registry: new AutomationStudioNodeRegistry([READ_LIST]),
  resolution: { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] }
};

/** The read's five conditions, as the exact revision writes them, in the account's order. */
export const CAMP_WHERE = {
  promoted: { field: "promoted", is: "absent" },
  open: { field: "availability", contains: "Open this weekend" },
  rating: { field: "rating", atLeast: 4 },
  campground: { field: "name", contains: "Campground" },
  notCabin: { field: "name", not: true, contains: "Cabin" }
} as const;

/** A script of one list read with these conditions. */
export function campsiteReadScript(where: readonly JsonObject[], pages = 5): JsonObject {
  const readList = { fields: { name: "name", fee: "fee", rating: "rating", url: "url" }, where, paginate: { pages } };
  return { summary: "Campsites", flow: ["flow: Campsites open this weekend", "step: read the campsites", `  node: ${READ_LIST.id}`, `  readList: ${JSON.stringify(readList)}`].join("\n") };
}

/** Call 1 (0033's shape): a gap no condition answers, and advice to change condition 1, which Core's record clears. */
export const GAP_AND_CHANGE_NO = { answersRequest: "no", ...GAP_AND_CHANGE };

/** Call 2 (0034's shape): the gap alone. */
export const GAP_NO = { answersRequest: "no", ...GAP };

/** The exact rows' run, judged: each judge call answers the next diagnosis, its read named as a run of `subflows` names it. */
export function campsiteJudging(...diagnoses: Record<string, unknown>[]): (subflows: ReadonlyArray<{ key: string; nodes: ReadonlyArray<{ key: string; definitionId: string }> }>) => Promise<AutomationStudioBuildTestVerdict> {
  let calls = 0;
  let readId = CAMP_READ;
  const provider: AutomationStudioLlmProvider = { metadata: { provider: "mock", model: "debug-model" }, runTask: async () => ({ response: { kind: "diagnosis", summary: "Judged.", diagnosis: renamed(diagnoses[calls++] ?? {}, readId) }, usage: USAGE }) };
  const judge = automationStudioBuildTestJudge({ instructions: [campsiteInstruction()], deniedEvidenceKeys: [], projectId: "project-1", flowId: "flow-1", provider });
  return async (subflows) => {
    readId = readIdOf(subflows);
    return judge({ summary: renamed<AutomationStudioRunResultSummary>(campsiteRunSummary(), readId), budget: { maxCostUsd: 0.2 } });
  };
}

/** The read's node id in a run: its subflow's and its step's keys, as a bootstrap Flow names it. */
function readIdOf(subflows: ReadonlyArray<{ key: string; nodes: ReadonlyArray<{ key: string; definitionId: string }> }>): string {
  const subflow = subflows.find((one) => one.nodes.some((node) => node.definitionId === READ_LIST.id))!;
  const read = subflow.nodes.find((node) => node.definitionId === READ_LIST.id)!;
  return `node.bootstrap.0a1b2c3d.${subflow.key}.${read.key}`;
}

/** The fixture's words with its read named as the run names it. */
function renamed<T>(value: T, readId: string): T {
  return JSON.parse(JSON.stringify(value).replaceAll(CAMP_READ, readId)) as T;
}
