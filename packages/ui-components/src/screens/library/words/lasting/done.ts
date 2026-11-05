import type { SubflowLastingClass } from "../../types.ts";

const DONE: Readonly<Record<SubflowLastingClass, string>> = {
  move_money: "spent money",
  delete: "deleted things",
  send_or_publish: "sent or published something",
  modify_existing: "changed existing things",
  create_new: "created new things"
};

/** What a run did on the site, said afterwards: "created new things". */
export function lastingDone(lasting: SubflowLastingClass): string {
  return DONE[lasting];
}
