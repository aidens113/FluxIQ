import type { SubflowLastingClass } from "../../types.ts";

const CAN: Readonly<Record<SubflowLastingClass, string>> = {
  move_money: "can spend money",
  delete: "can delete things",
  send_or_publish: "can send or publish",
  modify_existing: "can change existing things",
  create_new: "can create new things"
};

/** A lasting class in words: "can spend money". */
export function lastingWords(lasting: SubflowLastingClass): string {
  return CAN[lasting];
}
