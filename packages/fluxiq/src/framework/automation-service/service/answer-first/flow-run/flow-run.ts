// The Flow run stage of a later attempt (`docs/working/answer-first-plan/reports/second-attempt/design.md`):
// the saved steps assembled now and run live on the real engine, with no model, through the run
// gate and into the attempt's row sink, and told back step by step.
//
// **The engine, not the walker.** The judged run must be the Flow itself, routes and retries and all,
// so it is what a candidate trial runs (`runAutomationStudioDetachedCandidate`), which refuses any
// model, patch or adaptation. A run therefore costs no model call and repairs nothing: repair is the
// attempt's own loop, on its purse.
//
// **No reset, and no start of its own.** A trial's only start of its own is a deployment's hook that
// puts the site back (`../../candidate-trial/run.ts`, `automationStudioCandidateTrialStart`), and a
// trial with no hook runs on the target as it stands. This calls no hook: "reset as rarely as
// possible", and a person's earlier work is not undone. Going to the start location is the Flow's
// own first step: the domain made the build run it before anything else, and the assembly keeps it
// (`reachability/start-step.ts`). A Flow without one fails at its first step that needs the page,
// which reads as any other failing step.
//
// **A failed run is an answer.** Nothing here throws for one and nothing here ends the attempt: the
// engine's deadline, its step bound and a child Flow's deadline each read as a run that did not reach
// its end. It holds no clock of its own. Only a person's Stop reads as `stopped`, including any
// cancellation thrown on the way. What else is thrown is a run that could not start.
//
// **The page has moved only if a call went out.** So a run refused before its first step leaves the
// attempt going to the start location, as if it had not been tried.
//
// **A step on a control an earlier attempt saw flip checks before it presses** (`./stated-toggles.ts`),
// unless a person pressed Run again, which leaves `stated` off. What this run sees flip goes to the
// same record, for the draft this attempt saves.

import { createHash } from "node:crypto";
import { runWithAutomationStudioDomainReadings } from "../../../../../runtime/domain-readings/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { runAutomationStudioDetachedCandidate, type AutomationStudioCandidateStartReceipt, type AutomationStudioCandidateVerificationIdentity } from "../../../../../runtime/flow-authoring/bootstrap/verification/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import { automationStudioAnswerFirstRunActGate } from "../run-acts/index.ts";
import type { AutomationStudioAnswerFirstStatedToggle } from "../task-memory/index.ts";
import { automationStudioAnswerFirstFlowRunActClaims } from "./act-claims.ts";
import { automationStudioAnswerFirstFlowRunAssemble, type AutomationStudioAnswerFirstFlowRunAssembly } from "./assemble.ts";
import { automationStudioAnswerFirstFlowRunWatch, type AutomationStudioAnswerFirstFlowRunWatch } from "./dispatch-watch.ts";
import type { AutomationStudioAnswerFirstFlowRunOutcome } from "./outcome.ts";
import { automationStudioAnswerFirstStampedPlan } from "./stamped-plan.ts";
import { automationStudioAnswerFirstFlowRunPermission } from "./permission.ts";
import { automationStudioAnswerFirstFlowRunStepBound } from "./step-bound.ts";
import type { AutomationStudioAnswerFirstFlowRunEngine, AutomationStudioAnswerFirstFlowRunPorts } from "./ports.ts";
import { automationStudioAnswerFirstFlowRunStepsRan, type AutomationStudioAnswerFirstFlowRunEnded } from "./steps-ran.ts";

type Assembled = Extract<AutomationStudioAnswerFirstFlowRunAssembly, { ok: true }>;
type Saved = { steps: readonly AutomationStudioFlowDraftStep[]; stepsDigest: string; stated?: readonly AutomationStudioAnswerFirstStatedToggle[] | undefined };

/** What a thrown error reads as: its words may quote a value, so none is kept. */
const THREW = "answer_first.flow_run_threw";
/** A run's identity asks for a requirement digest only a parked requirement chain produces (`../../candidate-trial/run.ts`). */
const NO_REQUIREMENTS = "candidate.requirements.unbound";
const CANCELLED = "candidate.execution_cancelled";

export async function automationStudioAnswerFirstFlowRun(ports: AutomationStudioAnswerFirstFlowRunPorts, saved: Saved): Promise<AutomationStudioAnswerFirstFlowRunOutcome> {
  const signal = ports.input.cancellation.signal();
  const stopped = (): boolean => signal?.aborted === true;
  if (stopped()) return { kind: "stopped" };
  const assembly = await automationStudioAnswerFirstFlowRunAssemble(ports, saved.steps);
  if (stopped()) return { kind: "stopped" };
  if (!assembly.ok) return { kind: "not_assembled", codes: assembly.codes };
  const watch = automationStudioAnswerFirstFlowRunWatch(ports.stepped);
  try {
    const declined = await automationStudioAnswerFirstFlowRunPermission(ports, assembly, saved.steps);
    if (stopped()) return { kind: "stopped" };
    if (declined) return { kind: "permission_declined", consequences: declined };
    const ended = await run(ports, assembly, saved, watch, signal);
    if (ended.code === CANCELLED || stopped()) return { kind: "stopped" };
    return outcome(ports, assembly, saved, ended, watch);
  } catch (error) {
    if (stopped() || isCancellation(error)) return { kind: "stopped" };
    return outcome(ports, assembly, saved, { reachedEnd: false, code: THREW }, watch);
  }
}

function outcome(ports: AutomationStudioAnswerFirstFlowRunPorts, assembly: Assembled, saved: Saved, ended: AutomationStudioAnswerFirstFlowRunEnded, watch: AutomationStudioAnswerFirstFlowRunWatch): AutomationStudioAnswerFirstFlowRunOutcome {
  if (watch.anySent()) ports.arrived();
  return automationStudioAnswerFirstFlowRunStepsRan({ buildPlan: assembly.buildPlan, locator: assembly.locator, saved: saved.steps, ended, watch });
}

/** The assembled Flow, run as a trial runs it (`../../candidate-trial/run.ts`, `runIn`) under what is this attempt's. */
async function run(ports: AutomationStudioAnswerFirstFlowRunPorts, assembly: Assembled, saved: Saved, watch: AutomationStudioAnswerFirstFlowRunWatch, signal: AbortSignal | undefined): Promise<AutomationStudioAnswerFirstFlowRunEnded> {
  const { input, runId } = ports;
  const digest = saved.stepsDigest;
  const engine = ports.engine();
  const [parentFlow, baseDependencyDigest, snapshots, deprecatedPublicationIds] = await Promise.all([engine.parentFlow(), engine.currentBaseDigest(), engine.snapshots(), engine.deprecatedPublicationIds()]);
  const startedAt = Date.now();
  const identity: AutomationStudioCandidateVerificationIdentity = { projectId: input.projectId, flowId: input.flowId, revision: 1, digest, baseDependencyDigest, requirementsDigest: NO_REQUIREMENTS };
  const start: AutomationStudioCandidateStartReceipt = { receiptId: `${runId}.flow-run`, conditionsDigest: createHash("sha256").update(JSON.stringify({ startLocation: input.startLocation ?? null, start: "not_reset" })).digest("hex"), preparedAt: startedAt, pageGeneration: 0, subjectStates: [] };
  const buildPlan = automationStudioAnswerFirstStampedPlan(input, assembly.buildPlan, assembly.locator, saved.steps, saved.stated);
  const claimedActs = automationStudioAnswerFirstFlowRunActClaims({ buildPlan, locator: assembly.locator, saved: saved.steps, instructionText: input.instructionText });
  const options = gatedOptions(ports, assembly, engine, watch, signal, startedAt, claimedActs);
  const executed = await runWithAutomationStudioDomainReadings(engine.domainReadings ?? {}, () => runAutomationStudioDetachedCandidate({
    identity,
    candidate: { revision: 1, digest, baseDependencyDigest, buildPlan },
    parentFlow,
    currentIdentity: async () => ({ ...identity, baseDependencyDigest: await engine.currentBaseDigest() }),
    registry: input.registry, resolution: input.resolution, snapshots, deprecatedPublicationIds,
    sourceInstructionIds: [...input.instructionIds], runId, start, options,
    ...(input.size ? { size: input.size } : {})
  }));
  // A press whose answer the engine then failed on its checks may not have taken: without this it reads as landed, and a repair's retry is told it already happened.
  for (const attempt of executed.trace?.attempts ?? []) if (attempt.failure?.stage === "verification") ports.record.doubted(`node:${attempt.nodeId}`);
  ports.permissions.exploredToggles?.trial(executed.trace?.attempts ?? [], executed.graph);
  return { reachedEnd: executed.receipt.status === "succeeded", code: executed.code, trace: executed.trace, graph: executed.graph };
}

/**
 * The options a real run gets, with what is this attempt's: its rows to its sink, its acts through
 * its record, and no parking port, so a step that asks stops the run and asks nobody (`./permission.ts`).
 */
function gatedOptions(ports: AutomationStudioAnswerFirstFlowRunPorts, assembly: Assembled, engine: AutomationStudioAnswerFirstFlowRunEngine, watch: AutomationStudioAnswerFirstFlowRunWatch, signal: AbortSignal | undefined, referenceNow: number, claimedActs: ReadonlySet<string>): AutomationStudioGraphExecutionOptions {
  const { parking: _nobodyIsAsked, ...given } = engine.graphOptions({ runId: ports.runId, signal: signal ?? new AbortController().signal });
  const own: AutomationStudioGraphExecutionOptions = { ...given, ...(given.maxSteps === undefined ? { maxSteps: automationStudioAnswerFirstFlowRunStepBound(assembly.buildPlan) } : {}), referenceNow, onRecordBatch: (batch) => ports.sink.recordBatch(batch) };
  return watch.asked(automationStudioAnswerFirstRunActGate(watch.sent(own), { record: ports.record, settle: true, claimedActs, ...(engine.definitions ? { definitions: engine.definitions } : {}) }));
}

function isCancellation(error: unknown): boolean {
  return (error instanceof Error || error instanceof DOMException) && error.name === "AbortError";
}
