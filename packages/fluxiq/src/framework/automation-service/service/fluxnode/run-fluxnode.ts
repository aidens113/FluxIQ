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
//
// **A secret input is never among them** (`format: "secret"`, `./secrets/`). The goal names it instead of
// holding it, the attempt is given the other inputs, and the secrets travel beside the run
// (`runtime/run-secrets/`): a step bound to one resolves it where it runs, in exploration and replay
// alike, and every model request, step file, saved command and trace withholds it.
//
// **A pinned FluxNode's attempt works in a Flow beside the pinned one** (`./pin/`): it replays exactly the
// pinned version, still repairs and explores to the result, and what it changes is held as a proposal on
// the result (`pinned`), never saved over the pinned Flow.

import { fillFluxNodeGoal, fluxNodeSecretInputs, resolveFluxNodeOptions, resolveFluxNodeOverrides, type FluxNodeRunResult, type FluxNodeSpec } from "@fluxiq/contracts/fluxnode";
import type { AutomationStudioLlmModelCaller } from "../../../../runtime/llm/index.ts";
import { runWithAutomationStudioRunOverrides } from "../../../../runtime/run-overrides/index.ts";
import { runWithAutomationStudioRunSecrets } from "../../../../runtime/run-secrets/index.ts";
import type { AutomationStudioService } from "../../service.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationAnswered } from "../flow-bootstrap-commands/index.ts";
import { fluxNodeCallerOptions, fluxNodePermittedConsequences } from "./caller-options.ts";
import { fluxNodeCheckBridge, fluxNodePersonSink, fluxNodeStepEvents } from "./events/index.ts";
import type { FluxNodeRun } from "./fluxnode-run.ts";
import type { FluxNodeOwnerFlows, FluxNodeRegisteredSpec } from "./owner-flows.ts";
import { fluxNodeRunPin, type FluxNodePins } from "./pin/index.ts";
import { fluxNodeResultOf } from "./result-of.ts";
import { fluxNodeRunOverridesFrame } from "./overrides-frame.ts";
import { fluxNodeInputsWithoutSecrets, fluxNodeSecretGoalInputs } from "./secrets/index.ts";

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
  /** The FluxNodes' pins (`./pin/`). Absent, no run is pinned. */
  pins?: Pick<FluxNodePins, "begin" | "settleUnpinned"> | undefined;
  now: () => number;
};

export type FluxNodeRunOutcome = {
  result: FluxNodeRunResult;
  /** The learned Flow the attempt saved, when it saved one. A pinned run's is a proposal's, so none. */
  learned?: { candidateId: string; revision?: number | undefined; digest?: string | undefined } | undefined;
  /** This run's judge-part digest of its overrides, to record when a judge confirmed it. */
  judgeDigest?: string | undefined;
};

export async function runFluxNode(context: FluxNodeRunContext, run: FluxNodeRun, registered: FluxNodeRegisteredSpec, resumeHandle: string): Promise<FluxNodeRunOutcome> {
  const { spec } = registered;
  const inputs = run.carried.inputs;
  const secrets = fluxNodeSecretInputs(spec.inputs, inputs);
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
  const pinned = await context.pins?.begin(registered, options.mode, run.runId);
  // The Flow the attempt works in: the FluxNode's own, or beside it while it is pinned.
  const on: FluxNodeRegisteredSpec = pinned ? { ...registered, flowId: pinned.flowId } : registered;
  const callerOptions = fluxNodeCallerOptions({ spec, specHash: registered.specHash, runId: run.runId, options, inputs: fluxNodeInputsWithoutSecrets(inputs, secrets.names), bridge, personAsk, judgeChanged, pinned: pinned?.replaysPin });
  const goal = fillFluxNodeGoal(spec.goal, fluxNodeSecretGoalInputs(inputs, secrets.names));
  if (!goal.ok) throw new Error(`fluxnode.goal_unfilled: ${goal.issues.map((issue) => issue.code).join(", ")}`);
  const attempt = { over: false };
  const stopListening = fluxNodeStepEvents(run);
  const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => run.stop("The run's time ran out."), options.timeoutMs);
  let answered: AutomationStudioGenerateFlowBootstrapAdaptationAnswered | undefined;
  try {
    if (!run.stopRequested) {
      await runWithAutomationStudioRunSecrets(secrets.values, async () => await runWithAutomationStudioRunOverrides(frame, async () => {
        await context.flows.instruct(on, goal.value);
        run.whenStopped(() => cancelUntilLanded(context.service, on, attempt));
        const start = context.startLocationOf(spec);
        const generated = await context.service.generateFlowBootstrapAdaptation({
          projectId: on.projectId, flowId: on.flowId, caller: context.modelCaller, authoringMode: "answer-first",
          permittedConsequences: fluxNodePermittedConsequences(spec.scope.acts), ...(start === undefined ? {} : { startLocation: start })
        }, callerOptions);
        answered = generated.status === "answered" ? generated : undefined;
      }));
    }
  } finally {
    attempt.over = true;
    stopListening();
    if (timer !== undefined) clearTimeout(timer);
  }
  const result = await fluxNodeResultOf({ run, spec, inputs, answered, bridge, owner: context.service, resumeHandle, endedAt: context.now() });
  const pin = await fluxNodeRunPin({ run, registered, pins: context.pins, pinned, path: result.path, mode: options.mode });
  const learned = answered?.candidateId === undefined || pinned ? undefined : { candidateId: answered.candidateId, revision: answered.revision, digest: answered.digest };
  return { result: pin ? { ...result, pinned: pin } : result, ...(learned ? { learned } : {}), judgeDigest: resolved.judgeDigest };
}

/** Cancels the attempt on its Flow, again and again until one was registered to cancel or the attempt is over. */
function cancelUntilLanded(service: AutomationStudioService, registered: FluxNodeRegisteredSpec, attempt: { over: boolean }): void {
  if (attempt.over || service.buildCancellation.cancel(registered.projectId, registered.flowId)) return;
  setTimeout(() => cancelUntilLanded(service, registered, attempt), STOP_RETRY_MS);
}
