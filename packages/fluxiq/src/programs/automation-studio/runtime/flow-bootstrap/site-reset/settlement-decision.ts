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
// **Adopted witnesses (office rerun round 3).** A trial or entry-preparation
// act with no witness of its own is judged instead on the build's issued
// lists (`adopted`, `./ledger.ts`): settled when every one holds, `look` where
// one is stale or incomplete, and where one differs open with `name` alone --
// never `undo`, since another act may have changed that list. An adopted list
// is no change seen of the act's own.
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
  /** The build's issued lists, judged as witnesses only where it has none of its own (header). */
  adopted?: ReadonlyArray<AutomationStudioSiteResetGroupStanding & { ref?: string | undefined; location?: string | undefined }> | undefined;
}): AutomationStudioSiteResetSettlement {
  const groups = input.groups.filter((group) => group.status !== "none");
  if (!groups.length && !input.toggle) return adoptedDecision(input.adopted ?? [], input.changeSeen || input.undoLanded);
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

/** An act with no witness of its own, judged on the build's issued lists (header); with none, it is to name one. */
function adoptedDecision(adopted: ReadonlyArray<AutomationStudioSiteResetGroupStanding & { ref?: string | undefined; location?: string | undefined }>, restored: boolean): AutomationStudioSiteResetSettlement {
  const groups = adopted.filter((group) => group.status !== "none");
  if (!groups.length || groups.some((group) => group.status === "differs")) return { kind: "open", reasons: [{ reason: "name" }] };
  const reasons: AutomationStudioSiteResetOpenReason[] = [];
  for (const group of groups) {
    if (group.status === "holds") continue;
    reasons.push({ reason: "look", witness: "group", ...(group.ref ? { ref: group.ref } : {}), ...(group.location ? { location: group.location } : {}) });
  }
  if (reasons.length) return { kind: "open", reasons };
  return { kind: "settled", how: restored ? "restored" : "unchanged" };
}
