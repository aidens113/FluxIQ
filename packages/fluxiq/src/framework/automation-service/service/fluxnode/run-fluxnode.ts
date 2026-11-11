// One FluxNode run (fluxnode-plan, "FluxNode"): an Answer First attempt, through the service's own
// `generateFlowBootstrapAdaptation` with the run's caller options (`./caller-options.ts`). The attempt
// loop is the engine's and is never copied here: replaying, repairing and exploring, retries, the act
// record, loop detection and the purse are all the attempt's. This only sets the run up, carries what
// the attempt asks of the program over the event stream, and reads its answer as the run's result.
//
// **The ending is the attempt's.** It ends with its result, its budget gone, or a stop; the program's
// Stop cancels the attempt through the Flow's build cancellation, and the attempt then ends stopped,
// with what it has. A Stop that comes before the attempt has registered is tried again until it
// lands or the attempt is over. `timeoutMs` is a Stop on a clock.
//
// **The goal, filled with the inputs, is the Flow's instruction** (`./owner-flows.ts`): the words the
// attempt explores on. The inputs themselves go with the attempt, so a saved Flow replays on them.

import { fillFluxNodeGoal, resolveFluxNodeOptions, resolveFluxNodeOverrides, type FluxNodeRunResult, type FluxNodeSpec } from "@fluxiq/contracts/fluxnode";
import type { AutomationStudioLlmModelCaller } from "../../../../runtime/llm/index.ts";
import { runWithAutomationStudioRunOverrides } from "../../../../runtime/run-overrides/index.ts";
import type { AutomationStudioService } from "../../service.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationAnswered } from "../flow-bootstrap-commands/index.ts";
import { fluxNodeCallerOptions, fluxNodePermittedConsequences } from "./caller-options.ts";
import { fluxNodeCheckBridge, fluxNodePersonSink, fluxNodeStepEvents } from "./events/index.ts";
import type { FluxNodeRun } from "./fluxnode-run.ts";
import type { FluxNodeOwnerFlows, FluxNodeRegisteredSpec } from "./owner-flows.ts";
import { fluxNodeResultOf } from "./result-of.ts";
import { fluxNodeRunOverridesFrame } from "./overrides-frame.ts";

/** How often a Stop that found no attempt registered yet is tried again. */
const STOP_RETRY_MS = 25;

export type FluxNodeRunContext = {
  service: AutomationStudioService;
  flows: Pick<FluxNodeOwnerFlows, "instruct">;
  /** Who the attempt's model calls are made for; their key pays. */
  modelCaller: AutomationStudioLlmModelCaller;
  /** Where the attempt starts, in the bound domain's own spelling, or nothing to explore where the target stands. */
  startLocationOf: (spec: FluxNodeSpec) => string | undefined;
  /** How long a `person_needed` event waits for the program's answer before the run waits for a person instead. */
  personWaitMs: number;
  /** The judge-part digest of the latest run on this Flow that a judge confirmed, when one did. */
  judgedWith?: ((flowId: string) => string | undefined) | undefined;
  now: () => number;
};

export type FluxNodeRunOutcome = {
  result: FluxNodeRunResult;
  /** The learned Flow the attempt saved, when it saved one. */
  learned?: { candidateId: string; revision?: number | undefined; digest?: string | undefined } | undefined;
  /** This run's judge-part digest of its overrides, to record when a judge confirmed it. */
  judgeDigest?: string | undefined;
};

export async function runFluxNode(context: FluxNodeRunContext, run: FluxNodeRun, registered: FluxNodeRegisteredSpec, resumeHandle: string): Promise<FluxNodeRunOutcome> {
  const { spec } = registered;
  const inputs = run.carried.inputs;
  const options = resolveFluxNodeOptions(spec.options, run.carried.options);
  run.budgetUsd = options.budgetUsd;
  const resolved = await resolveFluxNodeOverrides(spec.overrides, run.carried.overrides);
  const hasOverrides = spec.overrides !== undefined || run.carried.overrides !== undefined;
  run.overridesDigest = hasOverrides ? resolved.digest : undefined;
  const frame = fluxNodeRunOverridesFrame(resolved.overrides, options.retries, run.overridesDigest);
  // A Flow last judged on other criteria is judged again, since an exact replay is otherwise taken without the judge.
  const judgeChanged = (context.judgedWith?.(registered.flowId) ?? (await resolveFluxNodeOverrides(undefined, undefined)).judgeDigest) !== resolved.judgeDigest;
  const bridge = spec.outputs !== undefined || spec.hasCheck ? fluxNodeCheckBridge(run, spec, inputs) : undefined;
  const personAsk = fluxNodePersonSink(run, resolved.overrides.deadlines.personWaitMs ?? context.personWaitMs, context.now);
  const callerOptions = fluxNodeCallerOptions({ spec, specHash: registered.specHash, runId: run.runId, options, inputs, bridge, personAsk, judgeChanged });
  const goal = fillFluxNodeGoal(spec.goal, inputs);
  if (!goal.ok) throw new Error(`fluxnode.goal_unfilled: ${goal.issues.map((issue) => issue.code).join(", ")}`);
  const attempt = { over: false };
  const stopListening = fluxNodeStepEvents(run);
  const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => run.stop("The run's time ran out."), options.timeoutMs);
  let answered: AutomationStudioGenerateFlowBootstrapAdaptationAnswered | undefined;
  try {
    if (!run.stopRequested) {
      await runWithAutomationStudioRunOverrides(frame, async () => {
        await context.flows.instruct(registered, goal.value);
        run.whenStopped(() => cancelUntilLanded(context.service, registered, attempt));
        const start = context.startLocationOf(spec);
        const generated = await context.service.generateFlowBootstrapAdaptation({
          projectId: registered.projectId, flowId: registered.flowId, caller: context.modelCaller, authoringMode: "answer-first",
          permittedConsequences: fluxNodePermittedConsequences(spec.scope.acts), ...(start === undefined ? {} : { startLocation: start })
        }, callerOptions);
        answered = generated.status === "answered" ? generated : undefined;
      });
    }
  } finally {
    attempt.over = true;
    stopListening();
    if (timer !== undefined) clearTimeout(timer);
  }
  const result = await fluxNodeResultOf({ run, spec, inputs, answered, bridge, owner: context.service, resumeHandle, endedAt: context.now() });
  const learned = answered?.candidateId === undefined ? undefined : { candidateId: answered.candidateId, revision: answered.revision, digest: answered.digest };
  return { result, ...(learned ? { learned } : {}), judgeDigest: resolved.judgeDigest };
}

/** Cancels the attempt on its Flow, again and again until one was registered to cancel or the attempt is over. */
function cancelUntilLanded(service: AutomationStudioService, registered: FluxNodeRegisteredSpec, attempt: { over: boolean }): void {
  if (attempt.over || service.buildCancellation.cancel(registered.projectId, registered.flowId)) return;
  setTimeout(() => cancelUntilLanded(service, registered, attempt), STOP_RETRY_MS);
}
