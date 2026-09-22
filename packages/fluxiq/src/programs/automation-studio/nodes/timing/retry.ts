import { durationMs } from "./shared.ts";
import { defineBuiltinNode, emptyResult } from "../shared/definition.ts";

/**
 * Retry declares the retry policy for the branch its `success` port feeds. The
 * executor reads it there, in `automationStudioNodeRetryPolicy`
 * (`runtime/executor/retry-policy.ts`).
 *
 * It used to retry nothing. It returned its own four parameters as outputs and
 * passed its input straight through, so a Flow that put a Retry node in front
 * of a fragile step got a label and no behaviour. The parameters were the right
 * ones; nothing read them. `attempts` is now the branch's attempt allowance,
 * and `delayMs` with `backoff` are the waits between those attempts, applied to
 * the target of the `success` edge and to each node after it that only this
 * branch reaches. The outputs are unchanged, so a Flow that reads `attempts` or
 * `delayMs` off this node keeps working.
 */
export const retryNode = defineBuiltinNode({
  id: "builtin.timing.retry",
  label: "Retry",
  description: "Retry the branch that follows, with bounded attempts and a delay between them.",
  class: "timing",
  scope: "both",
  inputs: [{ id: "in", label: "In", valueType: "any" }],
  outputs: [
    { id: "success", label: "Success", valueType: "any" },
    { id: "failed", label: "Failed", valueType: "any" }
  ],
  parameters: [
    { id: "attempts", label: "Maximum tries", description: "How many times this branch may be attempted.", valueType: "number", defaultValue: 3 },
    { id: "delayMs", label: "Wait between tries", description: "Base delay in milliseconds before another attempt.", valueType: "number", defaultValue: 500 },
    {
      id: "backoff",
      label: "Delay pattern",
      description: "How the wait time changes after repeated failures.",
      valueType: "string",
      defaultValue: "fixed",
      options: [
        { label: "Same wait every time", value: "fixed" },
        { label: "Increase steadily", value: "linear" },
        { label: "Increase quickly", value: "exponential" }
      ]
    },
    { id: "jitterMs", label: "Random extra wait", description: "Maximum random milliseconds added or subtracted from each delay.", valueType: "number", defaultValue: 0 }
  ],
  icon: "refresh-cw",
  execute: (context) => emptyResult({ success: context.inputs.in ?? null, attempts: durationMs(context.parameters.attempts, 3), delayMs: durationMs(context.parameters.delayMs, 500), backoff: context.parameters.backoff ?? "fixed", jitterMs: durationMs(context.parameters.jitterMs, 0) })
});
