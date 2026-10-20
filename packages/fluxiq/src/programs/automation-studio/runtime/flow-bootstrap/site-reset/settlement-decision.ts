// Whether one act of the build is settled (L1 reset settlement): the one rule
// that replaced the ledger's three narrow proofs (`originalGroupRestored`,
// `subjectRestored`, F1's `leftUnchanged`).
//
// An act is settled when every witness it has holds: each complete list group
// it could change (`./settlement-group-witness.ts`) and its own control's
// toggle (`./settlement-control-tracker.ts`). Settled is `restored` when a
// change was seen at some point or an undo of it landed, and `unchanged` when
// no read ever showed a change: then it is left, and the judge of every later
// trial is told so. Otherwise it is open, with a reason per witness, each
// saying where:
//
// - `look`: a witness is stale or was read incomplete: read it completely
//   again (Core does this itself first, `../ledger.ts`, `beforeTrial`);
// - `undo`: a list it could change still differs: undo it there;
// - `toggle`: its control still shows the state it set: press it back;
// - `name`: it has no witness at all: nothing read shows where its effect
//   would be, so read that list completely and name it.
//
// Pure: inputs are already-judged witnesses.

import type { AutomationStudioSiteResetGroupStanding } from "./settlement-group-witness.ts";
import type { AutomationStudioSiteResetToggleStanding } from "./settlement-control-tracker.ts";

/** Why an act is still open, and where (`ref` a destination's issued ref, `location` where to look or act). */
export type AutomationStudioSiteResetOpenReason = { reason: "look" | "undo" | "toggle" | "name"; witness?: "group" | "toggle"; ref?: string; location?: string };

export type AutomationStudioSiteResetSettlement =
  | { kind: "settled"; how: "restored" | "unchanged" }
  | { kind: "open"; reasons: AutomationStudioSiteResetOpenReason[] };

export function automationStudioSiteResetSettleDecision(input: {
  groups: ReadonlyArray<AutomationStudioSiteResetGroupStanding & { ref?: string | undefined; location?: string | undefined }>;
  toggle?: AutomationStudioSiteResetToggleStanding | undefined;
  /** A read after the act showed one of its witnesses changed. */
  changeSeen: boolean;
  /** An undo of it landed. */
  undoLanded: boolean;
}): AutomationStudioSiteResetSettlement {
  const groups = input.groups.filter((group) => group.status !== "none");
  if (!groups.length && !input.toggle) return { kind: "open", reasons: [{ reason: "name" }] };
  const reasons: AutomationStudioSiteResetOpenReason[] = [];
  for (const group of groups) {
    if (group.status === "holds") continue;
    const where = { ...(group.ref ? { ref: group.ref } : {}), ...(group.location ? { location: group.location } : {}) };
    reasons.push({ reason: group.status === "differs" ? "undo" : "look", witness: "group", ...where });
  }
  const toggle = input.toggle;
  if (toggle && toggle.status !== "holds") reasons.push({ reason: toggle.status === "stale" ? "look" : "toggle", witness: "toggle", ...(toggle.location ? { location: toggle.location } : {}) });
  if (reasons.length) return { kind: "open", reasons };
  return { kind: "settled", how: input.changeSeen || input.undoLanded ? "restored" : "unchanged" };
}
