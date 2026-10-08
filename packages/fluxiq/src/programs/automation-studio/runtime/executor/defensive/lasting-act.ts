// Whether a node's act lasts, so that a retry of it would be a second act.
//
// **The user's rule (2026-10-07):** every node retries automatically, and a
// lasting act is checked, never blindly repeated (t359). t355 put the first
// attempt and three retries on every path, and the act-twice gates in
// `./assess.ts` already refused to repeat a node Core could see acts on the
// world. But a Flow's web node carries none of its domain definition's
// metadata, so to Core every press looked like a read: a press dispatched
// and then answered with a lost acknowledgement -- the target detached, the
// page changed under it, the verb threw after the gesture -- was pressed
// again, which adds a second item to a cart or sends a message twice.
//
// **What makes an act lasting, from the two places it is stated:**
//
//  - **The node.** It is marked as acting on the world
//    (`automationStudioNodeMutates`), or the step it was built from declared a
//    lasting consequence: `metadata.declaredConsequences` holds any class at
//    all, `move_money` to `create_new`. An empty declaration is the step
//    saying `none`, which is an answer and not a lasting act. The build stamps
//    the declaration on the node when it writes the Flow
//    (`../../flow-bootstrap/adaptation.ts`), so a saved Flow's playback and a
//    candidate trial read the same statement the person was asked about.
//  - **The producer.** A failure record that states `effect: "ambiguous"` is
//    the producer saying an act was made and only its answer is missing
//    (`AutomationStudioFailureEffect`). Which of its actions commit is the
//    domain's fact -- a press commits whatever the page decides; typing into
//    a field does not -- so the domain says it on the record and Core does not
//    learn a word of the medium. A record that states nothing says nothing.
//
// **What Core does with one** is decided once, in `./assess.ts`: a lasting
// act is repeated only when the failure shows it did not happen (the record
// states `unacted`, or the fault was found while resolving the target, before
// anything could act). Otherwise the act may have landed: the attempt is
// refused with `actUncertain`, a run stopping on it says the step's outcome is
// uncertain, and a Flow does not walk past it. An effect check that shows the
// act landed -- the graph's state the node was to produce already holding
// (`../recovery-ladder.ts`, `skip_satisfied_node`), or the caller's own check
// outside a graph (`../outside-graph/retries.ts`) -- settles it as done. A node
// that says repeating it is safe is never lasting.

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioNodeMutates, automationStudioNodeRepeatIsSafe } from "./node-side-effect.ts";

/**
 * Where a Flow node keeps its step's declared consequences: the plan's plain
 * strings, `[]` when the step declared `none`. Written by the build
 * (`../../flow-bootstrap/adaptation.ts`) and read here.
 */
export const AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY = "declaredConsequences";

/** Whether this node's act outlasts it, so dispatching it again could act a second time. */
export function automationStudioNodeActLasts(node: AutomationStudioFlowNode): boolean {
  if (automationStudioNodeRepeatIsSafe(node)) return false;
  if (automationStudioNodeMutates(node)) return true;
  const declared = node.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
  return Array.isArray(declared) && declared.some((consequence) => typeof consequence === "string" && consequence.length > 0);
}

/**
 * What a run that stops on an uncertain lasting act says: that the act may
 * already have happened and was not repeated, then what the node itself
 * reported. Any other stop keeps its own message.
 */
export function automationStudioStopMessage(fault: { actUncertain?: true; reason: string } | undefined, message: string | undefined): string | undefined {
  if (!fault?.actUncertain) return message;
  return message ? `Outcome uncertain: ${fault.reason} ${message}` : `Outcome uncertain: ${fault.reason}`;
}
