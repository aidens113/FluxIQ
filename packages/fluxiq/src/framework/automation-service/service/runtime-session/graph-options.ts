// The executor options every run of a Flow gets, built in one place.
//
// A candidate trial must execute exactly as the saved Flow's run would
// (t339 design, U2), so the two cannot each assemble their own options: one
// that forgot the effect dispatcher, the authorized domains or the native
// executor's host context would run the candidate under a different gate than
// the person's later run. `runRuntimeSession` and the trial runner both build
// theirs here, and each then adds only what is its own (a run's recovery
// budget and run control; a trial's refusal of any model, patch or retry,
// which `../../flow-bootstrap/verification/detached-execution.ts` applies).
//
// Declared consequences are not an executor option. A normal run carries no
// `permittedConsequences` into the graph: a step's lasting consequence is
// gated when the Flow is authored (the build's permission gate, before a
// candidate submission is accepted) and when it is approved, never per action
// at execution. A trial therefore gates them exactly as a run does: by running
// with these same options (`../candidate-trial/tests/consequences.test.ts`).
//
// Its clock, waits and randomness come from the run's environment (traces and
// offline trials, P1, U7): absent, the live one, whose clock and wait are the
// executor's own fallbacks. The live `random` is left unset, a rule kept in
// `../../environment/executor-options.ts`: the Wait node reads a missing one as
// no jitter at all, so setting it would change every live run's pauses.
//
// **A real run's carried acts (t861, plan D6).** A run of a Flow an attempt just saved
// names `carryActs`, and only such a run: it is then asynchronous, since the record is
// read, and taken once, from beside the Flow. With nothing to carry its options are
// exactly these, by the same object. A trial never names it: a trial is judged on what
// it really does (`../answer-first/run-acts/`).

import type { IoRegistry } from "../../../../io/index.ts";
import type { RuntimeService } from "../../../../runtime/index.ts";
import { automationStudioEnvironmentExecutorOptions, automationStudioLiveRunEnvironment, type AutomationStudioRunEnvironment } from "../../environment/index.ts";
import { type AutomationStudioGraphExecutionOptions } from "../../executor/index.ts";
import { automationStudioReferenceNow } from "../../../../runtime/reference-time/index.ts";
import { createIoPolicyEffectDispatcher, createRuntimePolicyEffectDispatcher } from "../../io-policy.ts";
import type { AutomationStudioNativeNodeRuntime } from "../../../../runtime/native-nodes/index.ts";
import { AutomationStudioAttemptActRecord } from "../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstRunActGate, automationStudioAnswerFirstRunActStoreOf } from "../answer-first/run-acts/index.ts";

type RunGraphOptionsInput = {
  inputs?: Record<string, any> | undefined;
  /** The enclosing session's persisted start, separate from its live clock. */
  referenceNow?: number;
  signal: AbortSignal;
  io?: { io: IoRegistry; domainId: string | null } | undefined;
  runtimeService?: RuntimeService | undefined;
  /** The domains the run's caller authorized; only the bound domain's survives. */
  authorizedDomainIds: readonly string[];
  nativeNodeRuntime?: AutomationStudioNativeNodeRuntime | undefined;
  hostRuntime?: AutomationStudioGraphExecutionOptions["hostRuntime"];
  maxSteps?: number | undefined;
  onRecordBatch?: AutomationStudioGraphExecutionOptions["onRecordBatch"];
  parking?: AutomationStudioGraphExecutionOptions["parking"];
  /** Where the run's clock, waits and randomness come from; absent, the live environment. */
  environment?: AutomationStudioRunEnvironment | undefined;
  /** How human the person wants the run to act, 0-100, when the run's request set it; absent leaves the options as they were (level 0). */
  humanness?: number | undefined;
};

/** What a real run names to carry an attempt's acts: the service whose store holds them, and which Flow and run. */
type CarryActs = Parameters<typeof automationStudioAnswerFirstRunActStoreOf>[1] & { owner: object; projectId: string | null | undefined; flowId: string; runId: string; runStatus?: (runId: string) => Promise<string | undefined> };

/** A real run's executor options, gated by the acts an attempt left for it to carry (header). */
export function automationStudioRunGraphOptions(input: RunGraphOptionsInput & { carryActs: CarryActs }): Promise<AutomationStudioGraphExecutionOptions>;
/** One run's executor options: what reaches the world, and where its rows and questions go. */
export function automationStudioRunGraphOptions(input: RunGraphOptionsInput): AutomationStudioGraphExecutionOptions;
export function automationStudioRunGraphOptions(input: RunGraphOptionsInput & { carryActs?: CarryActs }): AutomationStudioGraphExecutionOptions | Promise<AutomationStudioGraphExecutionOptions> {
  const options = runGraphOptions(input);
  return input.carryActs ? carrying(options, input.carryActs, input.nativeNodeRuntime) : options;
}

async function carrying(options: AutomationStudioGraphExecutionOptions, carry: CarryActs, native: AutomationStudioNativeNodeRuntime | undefined): Promise<AutomationStudioGraphExecutionOptions> {
  if (!carry.projectId) return options;
  const seed = await automationStudioAnswerFirstRunActStoreOf(carry.owner, carry).forRun(carry.projectId, carry.flowId, carry.runId, carry.runStatus);
  if (!seed) return options;
  return automationStudioAnswerFirstRunActGate(options, { record: new AutomationStudioAttemptActRecord({ seed }), ...(native ? { definitions: () => native.listDefinitions() } : {}) });
}

function runGraphOptions(input: RunGraphOptionsInput): AutomationStudioGraphExecutionOptions {
  const options: AutomationStudioGraphExecutionOptions = { inputs: input.inputs ?? {}, signal: input.signal };
  const referenceNow = automationStudioReferenceNow(input.referenceNow);
  if (referenceNow !== undefined) options.referenceNow = referenceNow;
  const bound = input.io;
  if (bound) {
    options.effectDispatcher = input.runtimeService
      ? createRuntimePolicyEffectDispatcher(bound.io, bound.domainId, input.runtimeService, input.nativeNodeRuntime?.getTargetHooks(bound.domainId)?.outputTargetPreparer)
      : createIoPolicyEffectDispatcher(bound.io, bound.domainId, input.nativeNodeRuntime?.getTargetHooks(bound.domainId)?.outputTargetPreparer);
    options.runtimeCapabilities = ["policy-output", "io"];
    if (bound.domainId) options.authorizedDomainIds = input.authorizedDomainIds.filter((domainId) => domainId === bound.domainId);
  }
  const native = input.nativeNodeRuntime;
  if (native) {
    options.runtimeCapabilities = [...new Set([...(options.runtimeCapabilities ?? []), ...native.getRuntimeCapabilities()])];
    options.nativeNodeExecutor = ({ node, inputs, signal, hostContext }) => native.execute(node, inputs, signal, hostContext);
    options.resolveActionEffect = (node, parameterValues) => native.resolveActionEffect(node, parameterValues);
    options.resolveTargetRefresh = (node, parameterValues) => native.resolveTargetRefresh(node, parameterValues);
  }
  if (input.hostRuntime) options.hostRuntime = input.hostRuntime;
  if (input.maxSteps !== undefined) options.maxSteps = input.maxSteps;
  if (input.onRecordBatch) options.onRecordBatch = input.onRecordBatch;
  if (input.parking) options.parking = input.parking;
  if (input.humanness !== undefined) options.humanness = input.humanness;
  return automationStudioEnvironmentExecutorOptions(options, input.environment ?? automationStudioLiveRunEnvironment);
}
