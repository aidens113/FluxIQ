import type { JsonObject } from "../../../../../core/index.ts";

/**
 * The inputs a goal is filled with (`fillFluxNodeGoal`): each secret input's value replaced by words
 * that name the input, so the filled goal -- the Flow's instruction, which the model explores on and
 * the Flow keeps -- never holds the secret. They point the model at the binding it already writes for a
 * value the person gave (`{"$input": <name>, "test": ...}`, `runtime/flow-authoring/draft/binding-forms.ts`,
 * described on the run-node tool), which Core resolves to the secret where the step runs
 * (`runtime/run-secrets/`); its test value is a stand-in no saved step keeps.
 *
 * **No word that asks for an action.** The instruction is checked for words such as "enter", "type" or
 * "input" that only a node can do (`runtime/flow-authoring/bootstrap/plan/required-terms.ts`); the goal
 * says what the task needs, and these words must not add a need it does not have.
 */
export function fluxNodeSecretGoalInputs(inputs: JsonObject, secretNames: readonly string[]): JsonObject {
  if (!secretNames.length) return inputs;
  const named: JsonObject = { ...inputs };
  for (const name of secretNames) {
    named[name] = `the secret "${name}" (withheld from you: bind the written step that needs it to "${name}" by name, and Core puts it in when the step runs)`;
  }
  return named;
}
