import { actionLabel } from "./action-label";
import { resourceWords } from "./resource-words";
import type { ActivityEntry } from "./types";

/** What each known act reads as: `did` when it was allowed, `tried` when it was not. A named thing it acted on is added after. */
const PHRASES: Readonly<Record<string, { did: string; tried: string }>> = {
  "secrets:CreateKey": { did: "added", tried: "add" },
  "secrets:UpdateKey": { did: "replaced", tried: "replace" },
  "secrets:RotateKey": { did: "replaced", tried: "replace" },
  "secrets:DeleteKey": { did: "removed", tried: "remove" },
  "secrets:RevealKey": { did: "viewed", tried: "view" },
  "secrets:UseKey": { did: "used", tried: "use" },
  "secrets:OfferKey": { did: "shared", tried: "share" },
  "secrets:SetDefaultKey": { did: "chose a default for", tried: "choose a default for" },
  "iam:SetPassword": { did: "changed a password", tried: "change a password" },
  "iam:SetMemberRole": { did: "changed someone's role", tried: "change someone's role" },
  "iam:InviteMember": { did: "created an invite", tried: "create an invite" },
  "iam:ResendInvite": { did: "created a new invite link", tried: "create a new invite link" },
  "iam:RevokeInvite": { did: "cancelled an invite", tried: "cancel an invite" },
  "iam:RemoveMember": { did: "removed a person", tried: "remove a person" },
  "iam:DisableMember": { did: "turned a person off", tried: "turn a person off" },
  "iam:EnableMember": { did: "turned a person on", tried: "turn a person on" },
  "iam:CreateUser": { did: "added a person", tried: "add a person" },
  "iam:UpdateUser": { did: "changed a person's details", tried: "change a person's details" },
  "iam:DeleteUser": { did: "deleted a person", tried: "delete a person" },
  "iam:RevokeSession": { did: "ended a sign-in session", tried: "end a sign-in session" },
  "iam:BeginTotp": { did: "started two-step sign-in setup", tried: "start two-step sign-in setup" },
  "iam:ConfirmTotp": { did: "turned on two-step sign-in", tried: "turn on two-step sign-in" },
  "iam:DisableTotp": { did: "turned off two-step sign-in", tried: "turn off two-step sign-in" },
  "iam:RecaseMyUsername": { did: "changed the capitals in their sign-in name", tried: "change the capitals in their sign-in name" },
  "platform:CreateAccount": { did: "created an account", tried: "create an account" }
};

const NOUN_AFTER = new Set(["secrets:CreateKey", "secrets:UpdateKey", "secrets:RotateKey", "secrets:DeleteKey", "secrets:RevealKey", "secrets:UseKey", "secrets:OfferKey", "secrets:SetDefaultKey"]);

/**
 * Acts on a saved key that can still fail after the permission check passed (the store refuses, the account password is
 * wrong). Allowed only says the person may try, so without the operation's own `result` these read "tried to ...", never "added".
 */
const MAY_FAIL_AFTER_ALLOWED = new Set(["secrets:CreateKey", "secrets:UpdateKey", "secrets:RotateKey", "secrets:DeleteKey", "secrets:OfferKey", "secrets:SetDefaultKey"]);

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * One entry as a sentence: "Ada removed the key Work." or "Cy tried to change
 * someone's role." An act this page has no words for reads from its name
 * ("Ada set member role."). A key is named when its entry carries a readable
 * name, and is "a key" otherwise; no id appears.
 */
export function activitySentence(entry: ActivityEntry): string {
  const phrase = PHRASES[entry.action];
  const allowed = entry.outcome === "allowed";
  const verb = phrase === undefined ? lowerFirst(actionLabel(entry.action)) : allowed ? phrase.did : phrase.tried;
  const subject = entry.resources.map(resourceWords)[0];
  const tail = NOUN_AFTER.has(entry.action) ? ` ${subject?.startsWith("the key ") ? subject : "a key"}` : "";
  const unsure = allowed && phrase !== undefined && entry.result === undefined && MAY_FAIL_AFTER_ALLOWED.has(entry.action);
  if (allowed && phrase !== undefined && (entry.result === "failed" || unsure)) return `${entry.who} tried to ${phrase.tried}${tail}${entry.result === "failed" ? ", but it did not work" : ""}.`;
  const lead = allowed ? verb : phrase === undefined ? `was not allowed to ${verb}` : `tried to ${verb}`;
  return `${entry.who} ${lead}${tail}.`;
}
