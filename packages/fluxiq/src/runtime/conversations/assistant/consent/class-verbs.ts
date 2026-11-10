import type { PanelAssistantGatedClass } from "./gated-class.ts";

/**
 * The words that say a person asks for each gated class (`panel-design.md`
 * section 4), with only their plain inflections added. The list is short on
 * purpose: a word missing from it costs the person one press of Allow, while a
 * word wrongly on it lets a call run that nobody asked for.
 *
 * Only a verb said as a command counts (`./clearly-asked.ts`), so the nouns on
 * the security list ("key", "permission") rarely do. Two words of the design's
 * list are left out because they also mean something harmless: "order" (sort:
 * "order my Flows by date") and "access" (open: "access this key").
 */
export const PANEL_ASSISTANT_CLASS_VERBS: Readonly<Record<PanelAssistantGatedClass, readonly string[]>> = Object.freeze({
  delete: ["delete", "deletes", "deleting", "remove", "removes", "removing", "erase", "erases", "erasing"],
  send: ["send", "sends", "sending", "post", "posts", "posting", "publish", "publishes", "publishing", "email", "emails", "emailing"],
  money: ["pay", "pays", "paying", "buy", "buys", "buying", "transfer", "transfers", "transferring"],
  security: ["key", "keys", "revoke", "revokes", "revoking", "rotate", "rotates", "rotating", "permission", "permissions"],
  budget: ["spend", "spends", "spending", "exceed", "exceeds", "exceeding"]
});
