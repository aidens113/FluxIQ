import type { SubflowLastingClass } from "../../types.ts";

const VERB: Readonly<Record<SubflowLastingClass, string>> = {
  move_money: "spend money",
  delete: "delete things",
  send_or_publish: "send or publish something",
  modify_existing: "change existing things",
  create_new: "create new things"
};

/** What allowing a class lets it do, to follow "Allow it to": "spend money". */
export function lastingVerb(lasting: SubflowLastingClass): string {
  return VERB[lasting];
}
