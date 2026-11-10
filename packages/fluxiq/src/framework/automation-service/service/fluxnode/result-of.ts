// A FluxNode run's result, read from the Answer First attempt that was the run (fluxnode-plan N3-N7),
// in the contracts' terms (`fluxNodeRunResultSchema`). Nothing here is the model's: the outputs are
// what the check bridge passed, else what the stored rows and acts make; the verdict is what the
// attempt says confirmed it.
//
// **Endings.** `achieved`, `budget_out` and `waiting_for_person` are the attempt's own. A result the
// caller took unchecked (judge `off` and no check: `confirmedBy: "none"`) is `achieved`, labelled
// `unverified`, whether the attempt stores it as today's `stopped_by_person` or as `achieved`, as a
// later lane will. Every other ending is the program's Stop: `stopped`.
//
// **What confirmed it** (`verdict.by`): the judge, where the attempt says so; where the attempt says
// its caller's check, whichever part of the bridge passed it, the developer's check or, with no check
// declared, the type. A run that ended before anything passed, after a "no" from the type or the
// check, is `refuted` with that reason; otherwise it is `unverified`.

import type { AutomationStudioTaskAttempt, AutomationStudioTaskAttemptWaitReason } from "@fluxiq/contracts/automation";
import { validateJsonValue, type DataLineage, type FluxNodeRunPathKind, type FluxNodeRunResult, type FluxNodeRunStatus, type FluxNodeSpec, type FluxNodeVerdict } from "@fluxiq/contracts/fluxnode";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationAnswered } from "../flow-bootstrap-commands/index.ts";
import { FLUXNODE_SUMMARY_ROWS, type FluxNodeCheckBridge } from "./events/index.ts";
import type { FluxNodeRun } from "./fluxnode-run.ts";
import { fluxNodeInferredType, fluxNodeShapedOutputs, fluxNodeStoredRows, type FluxNodeShapedOutputs } from "./outputs/index.ts";

const PATHS: Readonly<Record<AutomationStudioTaskAttempt["path"], FluxNodeRunPathKind>> = Object.freeze({ explore: "explored", run_flow: "replayed", run_flow_then_repair: "repaired", run_flow_then_explore: "explored" });
const WAITING: Readonly<Record<AutomationStudioTaskAttemptWaitReason, string>> = Object.freeze({
  permission: "A person needs to allow a lasting act before the run can go on.",
  person_only_check: "A person needs to clear a check on the page before the run can go on.",
  stuck_in_a_loop: "The run kept getting stuck, and a person needs to say whether it should keep going.",
  model_key_locked: "The model key cannot be opened here, and a person needs to unlock it.",
  interrupted: "Core restarted while the run was working, and a person needs to say whether it should go on."
});
const ID = /^[A-Za-z0-9._:-]{1,128}$/u;

export type FluxNodeResultInput = {
  run: FluxNodeRun;
  spec: Pick<FluxNodeSpec, "outputs">;
  inputs: JsonObject;
  /** The attempt's answer; absent where none came back (stopped before it started, or it threw). */
  answered: AutomationStudioGenerateFlowBootstrapAdaptationAnswered | undefined;
  bridge: FluxNodeCheckBridge | undefined;
  /** The service, whose run datasets hold the rows. */
  owner: object;
  resumeHandle: string;
  endedAt: number;
};

export async function fluxNodeResultOf(input: FluxNodeResultInput): Promise<FluxNodeRunResult> {
  const { run, answered } = input;
  const attempt = answered?.attempt;
  const status = statusOf(answered);
  const { outputs, lineage } = await outputsOf(input, status);
  const result: FluxNodeRunResult = {
    runId: run.runId, name: run.target.name, specHash: run.target.specHash, flowId: run.target.flowId, flowPath: run.target.flowPath, status,
    ...(outputs === undefined ? {} : { outputs }),
    ...(outputs !== undefined && input.spec.outputs === undefined ? { outputsType: fluxNodeInferredType(outputs) } : {}),
    verdict: verdictOf(status, answered, input.bridge),
    path: attempt ? PATHS[attempt.path] : "explored",
    cost: attempt ? { calls: attempt.spend.calls, tokens: attempt.spend.inputTokens + attempt.spend.outputTokens, usd: attempt.spend.usd } : { calls: 0, tokens: 0, usd: 0 },
    timings: { startedAt: run.startedAt, endedAt: Math.max(run.startedAt, input.endedAt), durationMs: Math.max(0, input.endedAt - run.startedAt) },
    ...(status === "budget_out" || status === "waiting_for_person" ? { resumeHandle: input.resumeHandle } : {}),
    ...(status === "waiting_for_person" ? { waitingFor: attempt?.status === "waiting_for_person" ? WAITING[attempt.waitingFor] : WAITING.person_only_check } : {}),
    ...(lineage.length ? { lineage } : {}),
    ...datasetsOf(answered),
    ...(run.carried.correlationId === undefined ? {} : { correlationId: run.carried.correlationId })
  };
  return result;
}

function statusOf(answered: AutomationStudioGenerateFlowBootstrapAdaptationAnswered | undefined): FluxNodeRunStatus {
  const attempt = answered?.attempt;
  if (!attempt) return "stopped";
  if (attempt.status === "achieved" || answered.confirmedBy === "none") return "achieved";
  if (attempt.status === "budget_out" || attempt.status === "waiting_for_person") return attempt.status;
  return "stopped";
}

function verdictOf(status: FluxNodeRunStatus, answered: AutomationStudioGenerateFlowBootstrapAdaptationAnswered | undefined, bridge: FluxNodeCheckBridge | undefined): FluxNodeVerdict {
  if (status === "achieved") {
    if (answered?.confirmedBy === "judge") return { label: "confirmed", by: "judge" };
    if (answered?.confirmedBy === "check") return { label: "confirmed", by: bridge?.passed()?.by ?? "check" };
    return { label: "unverified" };
  }
  const refused = bridge?.refused();
  return refused ? { label: "refuted", by: refused.by, reason: refused.reason } : { label: "unverified" };
}

/** What passed the bridge, for a run it confirmed; else what the stored rows and acts make, and on a run that did not achieve, only when they fit the declared type. */
async function outputsOf(input: FluxNodeResultInput, status: FluxNodeRunStatus): Promise<FluxNodeShapedOutputs> {
  const { answered, run } = input;
  const storedId = answered?.result?.rows?.datasetId;
  const passed = status === "achieved" && answered?.confirmedBy === "check" ? input.bridge?.passed() : undefined;
  if (passed) return { ...(passed.outputs === undefined ? {} : { outputs: passed.outputs }), lineage: storedId ? passed.lineage.map((entry) => named(entry, storedId)) : passed.lineage };
  const shown = answered?.result?.rows;
  const rows = shown ? await fluxNodeStoredRows(input.owner, run.target.projectId, shown) : undefined;
  const shaped = fluxNodeShapedOutputs(input.spec.outputs, { runId: run.runId, flowId: run.target.flowId, rows, acts: answered?.result?.acts ?? [], inputs: input.inputs });
  const fits = input.spec.outputs === undefined || (shaped.outputs !== undefined && validateJsonValue(input.spec.outputs, shaped.outputs).length === 0);
  return fits ? shaped : { lineage: [] };
}

/** Lineage made from a summary's rows, naming the dataset the result says stores them. */
function named(entry: DataLineage, datasetId: string): DataLineage {
  if (entry.source.kind !== "read" || entry.stepId !== `read.${FLUXNODE_SUMMARY_ROWS}`) return entry;
  const index = entry.source.readId.slice(FLUXNODE_SUMMARY_ROWS.length + 1);
  const stepId = `read.${datasetId}`;
  const readId = `${datasetId}.${index}`;
  return ID.test(stepId) && ID.test(readId) ? { ...entry, stepId, source: { kind: "read", readId } } : entry;
}

function datasetsOf(answered: AutomationStudioGenerateFlowBootstrapAdaptationAnswered | undefined): Pick<FluxNodeRunResult, "datasets"> {
  const rows = answered?.result?.rows;
  if (!rows || !ID.test(rows.datasetId) || !ID.test(rows.runId)) return {};
  return { datasets: [{ datasetId: rows.datasetId, runId: rows.runId, rowCount: rows.totalRows }] };
}
