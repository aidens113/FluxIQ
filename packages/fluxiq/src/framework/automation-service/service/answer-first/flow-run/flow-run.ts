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
// **A check only a person can clear is put to them where it stands** (`./person-check-port.ts`): the
// run waits in place with no clock and goes on from that step once they press Continue. Their Stop
// there halts the run through its own signal, so it reads as `stopped` and the step's failed route,
// whatever it presses, never runs. No other question reaches a person part way through a Flow.
//
// **The page has moved only if a call went out.** So a run refused before its first step leaves the
// attempt going to the start location, as if it had not been tried.
//
// **A caller's scope holds here too** (`../caller/replay-scope.ts`): a plan with a step outside it does
// not run, and a step that resolves to an address off its sites is refused unsent. Either way the
// attempt carries on and looks for another way, as after a person's no.
//
// **Its rows are its read steps' pages** (lane t905): each record batch goes to the row sink as it is captured, and
// to the attempt's one result as a page of the draft step its node stands for (`./batch-steps.ts`), however the run
// ends: as soon as the run has selected its graph, so a later step's press finds the read already on the attempt's
// row (`./live-pages.ts`, t984).
//
// **A step on a control an earlier attempt saw flip checks before it presses** (`./stated-toggles.ts`),
// a person's Run again included: that press empties the act record, not the states. What this run
// sees flip goes to the same record, for the draft this attempt saves.
//
// **What the run did is handed on to the attempt's trail (t963).** The judge of the attempt's result sees
// everything that produced it, and a saved Flow's run reaches the site through the engine, not the attempt's call
// chain: so every step the engine traced, a child Flow's included, goes to `trail` once the run returns, with what it
// ran with, what it answered and the page after it (`runtime/result-verification/run-trail/of/attempts.ts`). Live
// run `run-mwo3dp11-a47a032d`'s third attempt ran its saved Flow, date sort and all, and its judges, shown none of
// it, said no sort was recorded (0331-0510).
//
// **How human the run acts is resolved by precedence** (`resolveHumanness`): a caller's own level, then the
// task's stored level, then the run Flow's stored level, then the request's starting value. With none of them
// the options carry no level, which is today's path exactly. A stored 0 wins over a starting value.
//
// **Graph-entry input evidence only where it was asked for** (t905 unit B, `../../input-basis/execution/`): with an
// `inputUse` port the run opens one session over the layers it really assembles (the engine's, of no declared origin,
// then the caller's own request's), carries its port into the engine and reports the closed observation the session
// read from the real trace. It changes nothing the run does; without the port there is no session and no await.

import { createHash } from "node:crypto";
import { resolveHumanness } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioGraphInputUsePort, AutomationStudioGraphInputUseSession, AutomationStudioInputUseObservation } from "../../../../../engine/automation/input-use/index.ts";
import type { AutomationStudioParkingPort } from "../../../../../runtime/automation-parking/index.ts";
import { runWithAutomationStudioDomainReadings } from "../../../../../runtime/domain-readings/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { runAutomationStudioDetachedCandidate, type AutomationStudioCandidateStartReceipt, type AutomationStudioCandidateVerificationIdentity } from "../../../../../runtime/flow-authoring/bootstrap/verification/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../../executor/index.ts";
import { automationStudioResultTrailOfAttempts } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioFlowHumanness } from "../../flow-settings/index.ts";
import type { AutomationStudioInputUseEntry } from "../../input-basis/index.ts";
import { automationStudioAnswerFirstReplayScope, type AutomationStudioAnswerFirstReplayScope } from "../caller/index.ts";
import { automationStudioAnswerFirstRunActGate } from "../run-acts/index.ts";
import type { AutomationStudioAnswerFirstStatedToggle } from "../task-memory/index.ts";
import { automationStudioAnswerFirstFlowRunActClaims } from "./act-claims.ts";
import { automationStudioAnswerFirstFlowRunAssemble, type AutomationStudioAnswerFirstFlowRunAssembly } from "./assemble.ts";
import { automationStudioAnswerFirstFlowRunLivePages, type AutomationStudioAnswerFirstFlowRunLivePages } from "./live-pages.ts";
import { automationStudioAnswerFirstFlowRunWatch, type AutomationStudioAnswerFirstFlowRunWatch } from "./dispatch-watch.ts";
import { automationStudioAnswerFirstExecutionIdentity, type AutomationStudioAnswerFirstExecutableSource } from "./execution-identity.ts";
import type { AutomationStudioAnswerFirstFlowRunOutcome } from "./outcome.ts";
import { automationStudioAnswerFirstStampedPlan } from "./stamped-plan.ts";
import { automationStudioAnswerFirstFlowRunPermission } from "./permission.ts";
import { automationStudioAnswerFirstFlowRunPersonCheckPort } from "./person-check-port.ts";
import { automationStudioAnswerFirstFlowRunStepBound } from "./step-bound.ts";
import { automationStudioAnswerFirstFlowRunStoppedNote } from "./stopped-note.ts";
import type { AutomationStudioAnswerFirstFlowRunEngine, AutomationStudioAnswerFirstFlowRunPorts } from "./ports.ts";
import type { AutomationStudioAnswerFirstSourceRead } from "./source-authority.ts";
import { automationStudioAnswerFirstFlowRunStepsRan, type AutomationStudioAnswerFirstFlowRunEnded } from "./steps-ran.ts";

type Assembled = Extract<AutomationStudioAnswerFirstFlowRunAssembly, { ok: true }>;
type Saved = { steps: readonly AutomationStudioFlowDraftStep[]; stepsDigest: string; candidateId?: string | undefined; stated?: readonly AutomationStudioAnswerFirstStatedToggle[] | undefined };
type Ended = AutomationStudioAnswerFirstFlowRunEnded & { executableSource?: AutomationStudioAnswerFirstExecutableSource };

/** What a thrown error reads as: its words may quote a value, so none is kept. */
const THREW = "answer_first.flow_run_threw";
/** A run's identity asks for a requirement digest only a parked requirement chain produces (`../../candidate-trial/run.ts`). */
const NO_REQUIREMENTS = "candidate.requirements.unbound";
const CANCELLED = "candidate.execution_cancelled";

export async function automationStudioAnswerFirstFlowRun(ports: AutomationStudioAnswerFirstFlowRunPorts, saved: Saved): Promise<AutomationStudioAnswerFirstFlowRunOutcome> {
  // The run's own signal: the attempt's Stop, or the person's Stop on a check, which halts the engine before the check step's failed route (`./person-check-port.ts`).
  const halt = new AbortController();
  const attempt = ports.input.cancellation.signal();
  const signal = attempt ? AbortSignal.any([attempt, halt.signal]) : halt.signal;
  const stopped = (): boolean => signal.aborted;
  if (stopped()) return { kind: "stopped" };
  const basis = await sourceOf(ports, saved);
  if (stopped()) return { kind: "stopped" };
  const assembly = await automationStudioAnswerFirstFlowRunAssemble(ports, saved.steps, basis.status === "bound" ? basis.record.candidate.summary : undefined);
  if (stopped()) return { kind: "stopped" };
  if (!assembly.ok) return { kind: "not_assembled", codes: assembly.codes };
  const scope = automationStudioAnswerFirstReplayScope(ports.input.caller?.scope);
  const outside = scope?.refusal(scopeStepsOf(assembly));
  if (outside !== undefined) return { kind: "outside_scope", said: outside };
  const watch = automationStudioAnswerFirstFlowRunWatch(ports.stepped);
  const pages = automationStudioAnswerFirstFlowRunLivePages(ports.result, { buildPlan: assembly.buildPlan, locator: assembly.locator, saved: saved.steps });
  try {
    const declined = await automationStudioAnswerFirstFlowRunPermission(ports, assembly, saved.steps);
    if (stopped()) return { kind: "stopped" };
    if (declined) return { kind: "permission_declined", consequences: declined };
    const ended = await run(ports, assembly, saved, basis, watch, signal, () => halt.abort(), scope, pages);
    pages.ended(ended.graph);
    if (ended.code === CANCELLED || stopped()) return { kind: "stopped" };
    return outcome(ports, assembly, saved, ended, watch);
  } catch (error) {
    pages.ended(undefined);
    if (stopped() || isCancellation(error)) return { kind: "stopped" };
    return outcome(ports, assembly, saved, { reachedEnd: false, code: THREW }, watch);
  }
}

function outcome(ports: AutomationStudioAnswerFirstFlowRunPorts, assembly: Assembled, saved: Saved, ended: Ended, watch: AutomationStudioAnswerFirstFlowRunWatch): AutomationStudioAnswerFirstFlowRunOutcome {
  if (watch.anySent()) ports.arrived();
  const ran = automationStudioAnswerFirstFlowRunStepsRan({ buildPlan: assembly.buildPlan, locator: assembly.locator, saved: saved.steps, ended, watch });
  automationStudioAnswerFirstFlowRunStoppedNote(ran, ended.trace);
  const executableSource = ended.executableSource ?? (ports.sourceAuthority || saved.candidateId ? { status: "unknown" as const, code: "unavailable" as const } : undefined);
  return executableSource ? { ...ran, executableSource } : ran;
}

/** The assembled Flow, run as a trial runs it (`../../candidate-trial/run.ts`, `runIn`) under what is this attempt's. */
async function run(ports: AutomationStudioAnswerFirstFlowRunPorts, assembly: Assembled, saved: Saved, basis: AutomationStudioAnswerFirstSourceRead, watch: AutomationStudioAnswerFirstFlowRunWatch, signal: AbortSignal, halt: () => void, scope: AutomationStudioAnswerFirstReplayScope | undefined, pages: AutomationStudioAnswerFirstFlowRunLivePages): Promise<Ended> {
  const { input, runId } = ports;
  const digest = saved.stepsDigest;
  const engine = ports.engine();
  const buildPlan = automationStudioAnswerFirstStampedPlan(input, assembly.buildPlan, assembly.locator, saved.steps, saved.stated);
  const source = await automationStudioAnswerFirstExecutionIdentity({ projectId: input.projectId, flowId: input.flowId, candidateId: saved.candidateId, authority: ports.sourceAuthority, basis, buildPlan, currentBaseDigest: () => engine.currentBaseDigest() });
  const [parentFlow, baseDependencyDigest, snapshots, deprecatedPublicationIds] = await Promise.all([engine.parentFlow(), engine.currentBaseDigest(), engine.snapshots(), engine.deprecatedPublicationIds()]);
  const startedAt = Date.now();
  const identity: AutomationStudioCandidateVerificationIdentity = { projectId: input.projectId, flowId: input.flowId, revision: 1, digest, baseDependencyDigest, requirementsDigest: NO_REQUIREMENTS };
  const start: AutomationStudioCandidateStartReceipt = { receiptId: `${runId}.flow-run`, conditionsDigest: createHash("sha256").update(JSON.stringify({ startLocation: input.startLocation ?? null, start: "not_reset" })).digest("hex"), preparedAt: startedAt, pageGeneration: 0, subjectStates: [] };
  const claimedActs = automationStudioAnswerFirstFlowRunActClaims({ buildPlan, locator: assembly.locator, saved: saved.steps, instructionText: input.instructionText });
  let askedNobody = false;
  const parking = automationStudioAnswerFirstFlowRunPersonCheckPort(ports.personCheck, () => { askedNobody = true; }, halt);
  const use = ports.inputUse;
  const opened: { session?: AutomationStudioGraphInputUseSession } = {};
  const own = gatedOptions(ports, assembly, engine, watch, signal, startedAt, claimedActs, parking, pages, automationStudioFlowHumanness(parentFlow.metadata), use ? (entry) => (opened.session = use.open(entry)).port : undefined);
  // Outside the act gate, so a step the scope refuses is no act of the attempt's.
  const options = scope ? scope.gated(own) : own;
  let executed: Awaited<ReturnType<typeof runAutomationStudioDetachedCandidate>> | undefined;
  try {
    executed = await runWithAutomationStudioDomainReadings(engine.domainReadings ?? {}, () => runAutomationStudioDetachedCandidate({
      identity,
      candidate: { revision: 1, digest, baseDependencyDigest, buildPlan },
      parentFlow,
      currentIdentity: async () => ({ ...identity, baseDependencyDigest: await engine.currentBaseDigest() }),
      registry: input.registry, resolution: input.resolution, snapshots, deprecatedPublicationIds,
      sourceInstructionIds: [...input.instructionIds], runId, start, options, selected: pages.selected,
      ...(input.size ? { size: input.size } : {})
    }));
  } finally {
    // Only the session that saw the real trace answers for it; a run with no trace never reached its entry's use.
    const session = opened.session;
    if (use && session) {
      const observation: AutomationStudioInputUseObservation = executed?.trace ? session.read(executed.trace) : { status: "unknown", code: "unobserved" };
      session.close();
      use.observed(observation);
    }
  }
  // A press whose answer the engine then failed on its checks may not have taken: without this it reads as landed, and a repair's retry is told it already happened.
  for (const attempt of executed.trace?.attempts ?? []) if (attempt.failure?.stage === "verification") ports.record.doubted(`node:${attempt.nodeId}`);
  // Everything the run did, for the attempt's judge (header): evidence for a later check, never a reason to lose the run's own answer.
  try {
    if (ports.trail && executed.trace?.attempts.length) await ports.trail.add(automationStudioResultTrailOfAttempts(executed.trace.attempts, executed.graph?.nodes ?? [], ports.trail.viewKeys, ports.trail.semantic));
  } catch {
    /* best-effort: the trail is evidence for a later check, as the call chain's is (`../attempt/call-chain.ts`) */
  }
  ports.permissions.exploredToggles?.trial(executed.trace?.attempts ?? [], executed.graph);
  const executableSource = ports.sourceAuthority || saved.candidateId ? await source.finish(baseDependencyDigest) : undefined;
  return { reachedEnd: executed.receipt.status === "succeeded", code: executed.code, trace: executed.trace, graph: executed.graph, ...(askedNobody ? { askedNobody } : {}), ...(executableSource ? { executableSource } : {}) };
}

/**
 * The options a real run gets, with what is this attempt's: its rows to its sink, its acts through
 * its record, and not the engine's parking port but the attempt's own, which puts only a check only a
 * person can clear to the person, so a step that asks anything else stops the run and asks nobody
 * (`./person-check-port.ts`, `./permission.ts`). A caller's input values are the run's inputs, so a
 * step bound to one runs with this attempt's value (`./input-bound-steps.ts`). `flowHumanness` is the run Flow's
 * own stored level (header). `inputUse`, where the run opted in, opens its session over exactly the layers assembled here.
 * The gate gets the run's host scope, so a press an earlier attempt held only to a look gets that look (`../run-acts/run-gate.ts`).
 */
function gatedOptions(ports: AutomationStudioAnswerFirstFlowRunPorts, assembly: Assembled, engine: AutomationStudioAnswerFirstFlowRunEngine, watch: AutomationStudioAnswerFirstFlowRunWatch, signal: AbortSignal, referenceNow: number, claimedActs: ReadonlySet<string>, parking: AutomationStudioParkingPort | undefined, pages: AutomationStudioAnswerFirstFlowRunLivePages, flowHumanness: number | undefined, inputUse: ((entry: AutomationStudioInputUseEntry) => AutomationStudioGraphInputUsePort) | undefined): AutomationStudioGraphExecutionOptions {
  const { parking: _theEnginesThread, ...given } = engine.graphOptions({ runId: ports.runId, signal });
  const inputs = ports.input.caller?.inputs;
  const caller = inputs ? structuredClone(inputs) : undefined;
  const port = inputUse?.(entryOf(given.inputs, caller));
  const humanness = resolveHumanness({ runOption: ports.input.caller?.humanness, task: ports.storedHumanness?.task, flow: flowHumanness, startingValue: ports.input.humanness });
  const own: AutomationStudioGraphExecutionOptions = { ...given, ...(given.maxSteps === undefined ? { maxSteps: automationStudioAnswerFirstFlowRunStepBound(assembly.buildPlan) } : {}), referenceNow, onRecordBatch: async (batch) => {
    const stored = await ports.sink.recordBatch(batch);
    pages.captured(batch);
    return stored;
  }, ...(parking ? { parking } : {}), ...(caller ? { inputs: { ...given.inputs, ...caller } } : {}), ...(humanness !== undefined ? { humanness } : {}), ...(port ? { inputUse: port } : {}) };
  return watch.asked(automationStudioAnswerFirstRunActGate(watch.sent(own), { record: ports.record, settle: true, claimedActs, scope: { projectId: ports.input.projectId, flowId: ports.input.flowId }, ...(engine.definitions ? { definitions: engine.definitions } : {}) }));
}

/**
 * The layers `gatedOptions` really assembles into the run's root inputs, in overlay order. The engine's options name no
 * origin for theirs, so that layer stays unknown provenance; a caller's are its own request's (`../caller/options.ts`).
 * An empty engine layer contributes nothing and is not listed.
 */
function entryOf(given: AutomationStudioGraphExecutionOptions["inputs"], caller: JsonObject | undefined): AutomationStudioInputUseEntry {
  return { layers: [
    ...(given && Object.keys(given).length > 0 ? [{ role: "inherited" as const, values: given }] : []),
    ...(caller ? [{ role: "caller" as const, values: caller, origin: { kind: "request" as const } }] : [])
  ] };
}

/** Each plan step as the scope reads it: what the domain declared for it, the classes on its node, and its parameters. */
function scopeStepsOf(assembly: Assembled): { consequences: readonly unknown[]; parameters?: JsonObject | undefined }[] {
  return assembly.buildPlan.plan.subflows.flatMap((subflow) => subflow.nodes.map((node) => ({
    consequences: [...(node.consequences ?? []), ...(assembly.declared.get(`${subflow.key}.${node.key}`) ?? []).flatMap((declaration) => declaration.consequences)],
    parameters: node.parameters
  })));
}

function isCancellation(error: unknown): boolean {
  return (error instanceof Error || error instanceof DOMException) && error.name === "AbortError";
}

/** The one source A selected before assembly. Errors/malformed ports leave ordinary legacy execution available. */
async function sourceOf(ports: AutomationStudioAnswerFirstFlowRunPorts, saved: Saved): Promise<AutomationStudioAnswerFirstSourceRead> {
  if (!saved.candidateId) return { status: "unknown", code: "candidate_missing" };
  if (!ports.sourceAuthority) return { status: "unknown", code: "authority_missing" };
  try {
    const source = structuredClone(await ports.sourceAuthority.read(saved.candidateId));
    if (source?.status === "unknown" || source?.status === "bound" && typeof source.record?.candidate?.summary === "string") return source;
  } catch { return { status: "unknown", code: "unavailable" }; }
  return { status: "unknown", code: "unavailable" };
}
