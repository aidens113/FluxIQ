import type { AutomationStudioActionConsequence } from "../consequences.ts";

/** Consequences requiring human authority independently of instruction wording. */
export const automationStudioDestructiveClassification: Readonly<Record<AutomationStudioActionConsequence, boolean>> = Object.freeze({
  move_money: true,
  delete: true,
  modify_existing: false,
  send_or_publish: true,
  create_new: false
});
