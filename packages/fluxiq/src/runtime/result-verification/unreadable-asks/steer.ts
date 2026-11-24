// What a judge is told when it sends the same unreadable reply again (t1000): a loop for the judge role, steered as every
// role's loop is (`../../llm/repeat-guard/loop-detection/`, user 2026-11-03: loop detection covers every agent role, and
// 2026-11-19: the model is told what it repeated and decides).
//
// **What the judge's loop decision may choose.** A judge has one reply to give and no tools, so it decides inside that
// reply, and its reply is read as always:
//
//   change_approach   the same answer, with exactly what Core named as unreadable fixed
//   finish_with_best  the smallest answer the outputSchema takes: every required field, `unknown` where it cannot tell,
//                     which the check reads as unsure, never as a yes
//
// Not `continue`: nothing on the judge's side is waiting to change, so the same unreadable reply again can only be read
// the same way. Not `ask_person`: a judge is Core's check of a result, and the person is never asked to do it; the
// deciding model asks them, as a last resort, through its own loop. The judge stays on its model (user, 2026-11-20).
//
// Generic words only: no site, task or answer is named (model guidance never teaches to the test).

import type { AutomationStudioLlmLoopFinding } from "../../llm/repeat-guard/loop-detection/index.ts";

/** The steer a judge's next ask carries after `finding`, its repeated unreadable reply. */
export function automationStudioResultUnreadableSteer(finding: Pick<AutomationStudioLlmLoopFinding, "repeats">): string {
  return [
    `You have sent the same unreadable reply ${finding.repeats} times in a row, and each came back the same way, so sending it the same way again will be read the same way.`,
    "Decide how to go on in this reply: change_approach, by sending your answer again with exactly what is named above fixed;",
    "or finish_with_best, by sending the smallest answer the outputSchema takes, every required field present and answersRequest unknown where you cannot tell."
  ].join(" ");
}
