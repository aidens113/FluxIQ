// The bounded pass counter at the head of a do-while loop (read-list design,
// section 4).
//
// A draft says `repeat` on a span's first step `while` its last step succeeds:
// read the list, press Next, and again while Next found a page. The assembler
// (`runtime/flow-bootstrap/authoring/draft-routing.ts`) writes that as
//
//   prev -> loop (Merge) -> this node.body -> first ... last
//   last.success -> loop        last.ended -> exit (Merge)        this.done -> exit
//
// so each pass enters here once, and this node is what bounds the loop and
// numbers its passes. The span's last step ends the loop itself, on a route
// that is not a failure, and never comes back here; reaching `most` ends it
// here, on `done`, and the Flow carries on from the exit. Neither is a
// failure: a list that ran out of pages and a loop that reached its bound are
// both the loop ending.
//
// The place is kept through `context.iteration`, as For Each keeps its own, so
// a parked run carries it and the executor grants each pass its steps
// (`runtime/executor/graph-run.ts`). The kept state's `items` is always empty:
// `index` is the number of passes begun. A loop left by its last step's
// `ended` keeps that count, so a run that state routing sends back into the
// same loop goes on counting rather than starting over.
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationNodeExecutionContext, AutomationNodeExecutionResult } from "../contracts.ts";
import { defineBuiltinNode, numberValue } from "../shared/definition.ts";

/** How many passes one loop takes unless its author says otherwise: the read's old page ceiling. */
const DEFAULT_MOST = 50;

/** The most passes one loop may be set to take. */
const MOST_CEILING = 500;

export const repeatNode = defineBuiltinNode({
  id: "builtin.control.repeat",
  label: "Repeat",
  description: "Run a section, then run it again while its last step succeeds, up to a set number of passes.",
  class: "control-flow",
  scope: "routine",
  inputs: [],
  outputs: [
    { id: "body", label: "Each pass", valueType: "any" },
    { id: "done", label: "Most passes reached", valueType: "any" },
    { id: "pass", label: "Pass", valueType: "number" }
  ],
  parameters: [
    {
      id: "most",
      label: "Most passes",
      description: "The loop ends after this many passes, and the Flow carries on. At most 500.",
      valueType: "number",
      defaultValue: DEFAULT_MOST,
      constraints: { minimum: 1, maximum: MOST_CEILING, integer: true }
    },
    {
      id: "maxStepsPerIteration",
      label: "Steps per pass",
      description: "How many more steps the run may take for each pass. A whole run stops at 100,000 steps.",
      valueType: "number",
      defaultValue: 50,
      // The executor reads the authored value to grant the steps, before any binding could be resolved.
      allowStateBinding: false,
      constraints: { minimum: 1, integer: true }
    }
  ],
  icon: "repeat",
  execute: (context) => repeatPass(context)
});

// One arrival: a pass while fewer than `most` have begun, else the bound.
function repeatPass(context: AutomationNodeExecutionContext): AutomationNodeExecutionResult {
  const { iteration } = context;
  if (!iteration) return failedPass("repeat.iteration_unavailable", "blocked_by_capability_or_policy", "Repeat runs only inside a Flow run, which keeps its count of passes.");
  const begun = iteration.get()?.index ?? 0;
  const most = mostPasses(context);
  if (begun < most) {
    iteration.set({ items: [], index: begun + 1 });
    return { status: "success", route: "body", outputs: { pass: begun + 1 } };
  }
  iteration.set();
  return { status: "success", route: "done", outputs: { pass: begun }, message: `The loop reached its most passes (${most}) and ends here.` };
}

function mostPasses(context: AutomationNodeExecutionContext): number {
  const authored = Math.floor(numberValue(context.parameters.most, DEFAULT_MOST));
  return Math.min(MOST_CEILING, Math.max(1, authored));
}

function failedPass(code: string, category: AutomationStudioFailureRecord["category"], message: string): AutomationNodeExecutionResult {
  return { status: "failed", route: "failed", outputs: {}, message, failure: { category, code, retryable: false } };
}
