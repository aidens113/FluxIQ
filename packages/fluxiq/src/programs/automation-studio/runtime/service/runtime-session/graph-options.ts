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

import type { IoRegistry } from "../../../../../io/index.ts";
import type { RuntimeService } from "../../../../../runtime/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../executor/index.ts";
import { createIoPolicyEffectDispatcher, createRuntimePolicyEffectDispatcher } from "../../io-policy.ts";
import type { AutomationStudioNativeNodeRuntime } from "../../native-node-runtime.ts";

/** One run's executor options: what reaches the world, and where its rows and questions go. */
export function automationStudioRunGraphOptions(input: {
  inputs?: Record<string, any> | undefined;
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
}): AutomationStudioGraphExecutionOptions {
  const options: AutomationStudioGraphExecutionOptions = { inputs: input.inputs ?? {}, signal: input.signal };
  const bound = input.io;
  if (bound) {
    options.effectDispatcher = input.runtimeService
      ? createRuntimePolicyEffectDispatcher(bound.io, bound.domainId, input.runtimeService)
      : createIoPolicyEffectDispatcher(bound.io, bound.domainId);
    options.runtimeCapabilities = ["policy-output", "io"];
    if (bound.domainId) options.authorizedDomainIds = input.authorizedDomainIds.filter((domainId) => domainId === bound.domainId);
  }
  const native = input.nativeNodeRuntime;
  if (native) {
    options.runtimeCapabilities = [...new Set([...(options.runtimeCapabilities ?? []), ...native.getRuntimeCapabilities()])];
    options.nativeNodeExecutor = ({ node, inputs, signal, hostContext }) => native.execute(node, inputs, signal, hostContext);
  }
  if (input.hostRuntime) options.hostRuntime = input.hostRuntime;
  if (input.maxSteps !== undefined) options.maxSteps = input.maxSteps;
  if (input.onRecordBatch) options.onRecordBatch = input.onRecordBatch;
  if (input.parking) options.parking = input.parking;
  return options;
}
