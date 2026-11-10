import { ASSISTANT_CONSEQUENCES, type AssistantConsequence } from "@fluxiq/contracts/program-api-inputs";
import type { AutomationStudioActionConsequence } from "../../../runtime/action-permission-requests/index.ts";

/** What a run's target Flow says it may do: its declared lasting classes and the consequences it is permitted. */
export type AssistantRunTarget = {
  lastingClasses: readonly AutomationStudioActionConsequence[];
  permittedConsequences: readonly AutomationStudioActionConsequence[];
};

const RUN_CLASS: Readonly<Record<AutomationStudioActionConsequence, AssistantConsequence>> = Object.freeze({
  send_or_publish: "send",
  move_money: "money",
  delete: "delete",
  modify_existing: "change",
  create_new: "change"
});

/**
 * The classes of a `per-call` run: the union of its Flow's lasting classes and
 * permitted consequences (`send_or_publish` -> send, `move_money` -> money,
 * `delete` -> delete, the rest -> change), in `ASSISTANT_CONSEQUENCES` order.
 * Starting a run always records one, so the floor is `change`.
 */
export function assistantRunConsequences(target: AssistantRunTarget): readonly AssistantConsequence[] {
  const classes = new Set<AssistantConsequence>(["change"]);
  for (const lasting of [...target.lastingClasses, ...target.permittedConsequences]) {
    const mapped = Object.hasOwn(RUN_CLASS, lasting) ? RUN_CLASS[lasting] : undefined;
    if (mapped === undefined) throw new TypeError(`Unknown lasting class ${JSON.stringify(lasting)}; it needs an assistant consequence.`);
    classes.add(mapped);
  }
  return ASSISTANT_CONSEQUENCES.filter((consequence) => classes.has(consequence));
}
