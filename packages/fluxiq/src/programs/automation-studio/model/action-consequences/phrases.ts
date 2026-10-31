import type { AutomationStudioActionConsequence } from "./types.ts";

/** Each consequence as the person being asked would say it. */
export const AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES: Readonly<Record<AutomationStudioActionConsequence, string>> = Object.freeze({
  move_money: "spend, refund or move money",
  delete: "delete or remove something",
  send_or_publish: "send or publish something that others will receive or see",
  modify_existing: "change something that already exists",
  create_new: "create something new that stays"
});
