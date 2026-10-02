// A tool the loop may offer a decision: what it does, what it takes, and what
// running it may change.
//
// Declared here rather than in `../evidence-loop.ts` because the coordinator
// beside it had grown to hold both the loop's whole contract and the loop
// itself, past the point where anybody could edit the second without reading
// the first. This directory is that contract, one noun per file, and the
// coordinator imports it.

import type { JsonObject } from "../../../../../core/index.ts";

export type AutomationStudioLlmEvidenceTool = {
  toolId: string;
  description: string;
  inputSchema: JsonObject;
  effect?: "observe" | "mutate";
  repeatPolicy?: "after_mutation";
  /**
   * Whether each call of this tool says for itself what it did, rather than the
   * tool saying once for all of them.
   *
   * One tool that runs whichever of a library's things the call names cannot
   * declare an effect up front: the same tool reads a page on one call and
   * changes it on the next, and which it was is known only once it has run. So
   * its result carries `draft` (`./tool-execution.ts`) and the loop reads the
   * effect, the name and whether the result should contain it from there.
   * `effect` still says what the *worst* such a call may do, which is what the
   * offering gate reads.
   *
   * Two consequences. Repeats are keyed on the looser of the two epochs, since
   * the loop cannot know before the call which one applies. And the tool may
   * carry an `initialObservation` although it is declared `mutate`, because the
   * caller -- not the model -- writes that one call's argument and is
   * responsible for it being a look. Only such a tool may declare an
   * `arrival`, because the one tool must be able both to look and to go.
   */
  perCallEffect?: boolean;
  /**
   * For a tool that runs whichever of many actions a call names: the key of
   * its input that names the action (`node` for `core.run_node`).
   *
   * Loop data, never sent: the loop strips it from every tool it offers,
   * because provider adapters refuse a tool carrying a key they do not know.
   * It is what lets the loop withdraw the looks among such a tool's actions
   * without withdrawing the tool (`../decision-handlers/look-withdrawal.ts`):
   * the input is offered with that key narrowed to exclude the actions this
   * build saw report `effect: "observe"` and `proposes: false`.
   */
  actionInputKey?: string;
  /** Optional domain-declared observation that is safe to run before the first
   * provider decision. The coordinator executes at most one such declaration.
   *
   * `arrival`, on a `perCallEffect` tool only, is an input of the same tool that
   * takes the target to where the Flow being built starts. Given, the opening
   * call runs it instead of `input` and records it exactly as a model's call
   * added to the Flow would be (`../evidence-loop.ts`), so a build told where
   * to start never opens on a look the domain refuses for not being there yet
   * (F31, `run-muqc07fh-eeffbc86`). `input` stays the domain's look, for every
   * caller that takes a fresh one (`../../parking/person-needed-tool-calls.ts`).
   * Loop data: no provider payload carries it (`../deepseek/request-body.ts`). */
  initialObservation?: { input: JsonObject; arrival?: JsonObject };
};
