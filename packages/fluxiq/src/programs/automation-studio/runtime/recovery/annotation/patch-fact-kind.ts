// What a repair's condition about a control says it reads, in the words a
// build's condition says it (t787).
//
// A build's `when:` and `done when:` lines are read by one grammar
// (`../../flow-bootstrap/script-statements/fact-condition.ts`), and every
// condition it writes names its kind in `fact`: `{ fact: "visible", op:
// "visible" }` for a control that is shown, `absent` for one that is gone,
// `text` or `value` with `equals`, `contains` or `matches`, `count` with
// `count`. That is the form a host reads (Core never interprets `fact`, C9). A
// repair's condition is written in the runtime-patch schema instead, whose
// `fact` is free text, and a model reads it as a label: an in-run handler's
// `when` came back as `{ fact: "<a description of the layer>", op: "visible" }`
// on the layer's handle. The web host read no kind in it, answered `unknown`,
// and the handler never ran, while the run tried the step again as if it had
// (debug run-mvskptb1, fix 2).
//
// So a condition that names a control is held to the build's grammar here,
// before its target is resolved:
//
// - **A presence op** (`exists`, `absent`, `visible`, `enabled`) asks one
//   thing of the control, and the build writes it as its own kind, so `fact`
//   becomes the op whatever the model put there. Nothing is guessed: the op
//   alone says what is read, and `exists` with `absent` meant the same thing.
// - **`count`** likewise reads only one thing, and `fact` becomes `count`.
// - **A comparison** (`equals`, `contains`, `matches`) needs to know what it
//   compares, which the op does not say. `text` or `value` stands, and so do
//   `count` with `equals` and a presence kind with `equals` true or false;
//   anything else is refused, in words that say what to name, because a
//   condition no host can read is a handler that never runs.
//
// A condition that names no control is left as written: it is about the page
// (a dialog, the address), which this grammar does not cover.

import type { AutomationStudioFactCondition, AutomationStudioFactConditionOp } from "../../executor/lifecycle/index.ts";

const PRESENCE: ReadonlySet<AutomationStudioFactConditionOp> = new Set(["exists", "absent", "visible", "enabled"]);
const COMPARED: ReadonlySet<string> = new Set(["text", "value"]);

/**
 * The condition about a control as a host reads it (header), or `refused` when
 * it compares something it names only in its own words.
 */
export function automationStudioRecoveryPatchFactKind(condition: AutomationStudioFactCondition): { condition: AutomationStudioFactCondition } | { refused: true } {
  if (PRESENCE.has(condition.op) || condition.op === "count") {
    const kind = condition.op;
    return { condition: condition.fact === kind ? condition : { ...condition, fact: kind } };
  }
  if (COMPARED.has(condition.fact) || (condition.op === "equals" && equalsKind(condition))) return { condition };
  return { refused: true };
}

/** `equals` on a count, or on a presence asked as true or false: the kind is named, and so is what it is compared with. */
function equalsKind(condition: AutomationStudioFactCondition): boolean {
  if (condition.fact === "count") return true;
  const presence = PRESENCE.has(condition.fact as AutomationStudioFactConditionOp);
  return presence && (condition.value === undefined || typeof condition.value === "boolean");
}
