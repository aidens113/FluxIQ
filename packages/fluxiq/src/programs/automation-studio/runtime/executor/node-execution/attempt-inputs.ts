import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";

/**
 * Every run value the attempt at `index` saw when it executed, as its whole
 * `inputs` read before the trace was saved.
 *
 * A saved trace keeps each value once (`./shared-inputs.ts`): an attempt with
 * `inputsSince` holds only what changed since the attempt before it, and names
 * where an earlier attempt keeps the rest. This puts them back together from
 * the trace's own attempts, so `attempts` must be the whole list the attempt
 * was saved in -- a list that dropped an attempt it names cannot answer for the
 * values that attempt kept, and they are left out rather than guessed. An
 * attempt without `inputsSince` -- every attempt of an executed trace, and of a
 * trace saved before t377 -- already holds them all and is handed back as is.
 */
export function automationStudioAttemptInputs(attempts: readonly AutomationStudioNodeAttemptTrace[], index: number): Record<string, JsonValue> {
  const attempt = attempts[index];
  if (!attempt) return {};
  // The chain back to an attempt that holds its inputs whole, walked without
  // recursion: a run of thousands of steps must not need a stack that deep.
  const chain: number[] = [];
  for (let at: number | undefined = index; at !== undefined;) {
    chain.push(at);
    const since: AutomationStudioNodeAttemptTrace["inputsSince"] = attempts[at]?.inputsSince;
    at = since ? attemptIndexBefore(attempts, at, since.attemptId) : undefined;
  }
  let values: Record<string, JsonValue> = {};
  for (const at of chain.reverse()) {
    const current = attempts[at]!;
    const since = current.inputsSince;
    if (!since) {
      values = { ...current.inputs };
      continue;
    }
    for (const key of since.removed ?? []) delete values[key];
    for (const shared of since.shared ?? []) {
      const source = attempts[attemptIndexBefore(attempts, at, shared.attemptId) ?? -1];
      if (source && Object.hasOwn(source.outputs, shared.output)) values[shared.input] = source.outputs[shared.output]!;
      else delete values[shared.input];
    }
    Object.assign(values, current.inputs);
  }
  return values;
}

/** The nearest attempt before `index` with this id: ids repeat only where traces were joined, and the nearer one is the one that was meant. */
function attemptIndexBefore(attempts: readonly AutomationStudioNodeAttemptTrace[], index: number, attemptId: string): number | undefined {
  for (let at = index - 1; at >= 0; at -= 1) if (attempts[at]?.attemptId === attemptId) return at;
  return undefined;
}
