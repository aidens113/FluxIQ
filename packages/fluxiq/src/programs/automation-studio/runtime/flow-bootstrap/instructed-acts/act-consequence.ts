// The class of consequence an act's own verb names, and whether a step
// declares it.
//
// **The defect this closes (withdraw audit R2).** Run 3 (`run-munnyvbr-11c28a0f`)
// declared both of its Withdraw presses `modify_existing`. The gate asks a
// person only about the classes it holds to be serious (`delete`, `move_money`,
// `send_or_publish`, `../../action-permissions/destructive.ts`), so nobody was
// asked, the withdrawal went ahead, and the Lab refused the Flow as never asked.
// The declaration cross-check saw the gap and, by design, refused nothing.
//
// **A closed list on the person's verb, never on a control.** Only a verb the
// instruction reader already reads as an act (`./instruction-acts.ts`) can
// carry a class, and only these: withdraw, delete, remove -- `delete`; order,
// buy, purchase, pay -- `move_money`; send, post, publish, submit, apply --
// `send_or_publish`. A verb outside it implies nothing, which is where every
// act stood before.
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";

const IMPLIED: ReadonlyArray<readonly [RegExp, AutomationStudioActionConsequence]> = [
  [/^(?:withdraw|delete|remove)$/u, "delete"],
  [/^(?:order|buy|purchase|pay)$/u, "move_money"],
  [/^(?:send|post|publish|submit|apply)$/u, "send_or_publish"]
];

/** The class an act's verb, as the reader wrote it, names; nothing for any other verb. */
export function automationStudioInstructedActImpliedConsequence(verb: string): AutomationStudioActionConsequence | undefined {
  const folded = verb.trim().toLowerCase();
  return IMPLIED.find(([pattern]) => pattern.test(folded))?.[1];
}

/**
 * Whether a step declared this class. Read the way the dry run reads a
 * declaration (`../../flow-draft/verify-only.ts`): from what the Flow keeps
 * (`ranWith`) before what the model wrote (`input`), as a list or a comma
 * string.
 */
export function automationStudioDraftStepDeclaresConsequence(step: AutomationStudioFlowDraftStep, consequence: AutomationStudioActionConsequence): boolean {
  const declared = step.ranWith && "consequences" in step.ranWith ? step.ranWith.consequences : step.input.consequences;
  const words = Array.isArray(declared) ? declared : typeof declared === "string" ? declared.split(",") : [];
  return words.some((word) => typeof word === "string" && word.trim().toLowerCase() === consequence);
}
