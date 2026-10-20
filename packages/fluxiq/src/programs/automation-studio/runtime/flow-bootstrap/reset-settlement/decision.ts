// Whether one act of the build is settled (L1 reset settlement): the one rule
// that replaced the ledger's three narrow proofs (`originalGroupRestored`,
// `subjectRestored`, F1's `leftUnchanged`).
//
// An act is settled when every witness it has holds: each complete list group
// it could change (`./group-witness.ts`) and its own control's
// toggle (`./control-tracker.ts`). Settled is `restored` when a
// change was seen at some point or an undo of it landed, and `unchanged` when
// no read ever showed a change: then it is left, and the judge of every later
// trial is told so. Otherwise it is open, with a reason per witness, each
// saying where:
//
// - `look`: a witness is stale or was read incomplete: read it completely
//   again (Core does this itself first, `../site-reset/ledger.ts`, `beforeTrial`);
// - `undo`: a list it could change still differs: undo it there;
// - `toggle`: its control still shows the state it set: press it back;
// - `name`: it has no witness at all: nothing read shows where its effect
//   would be, so read that list completely and name it;
// - `unreachable`: its only witnesses are lists Core's own look could not read
//   again (below): no call can meet it.
//
// **Adopted witnesses (office rerun round 3).** A trial or entry-preparation
// act with no witness of its own is judged instead on the build's issued
// lists it could have changed (`adopted`, `./judge.ts`): settled when every one
// holds, `look` where one is stale or incomplete, and where one differs open
// with `name` alone -- never `undo`, since another act may have changed that
// list. An adopted list is no change seen of the act's own. Each reason an
// adopted list gives is marked `adopted`.
//
// **Unreachable witnesses (t743, photo `run-mvgw7320-de416190`).** A group
// Core's own look reaches but cannot read again (`./reach.ts`) is never a
// `look` again. With another witness that holds, the act settles as it would
// without it, and the settlement says which lists could not be read again
// (`unread`), so every later trial's judge is told. Where unreachable lists
// are its only witnesses, it stays open with `unreachable`.
//
// Pure: inputs are already-judged witnesses.

import type { AutomationStudioSiteResetGroupStanding } from "./group-witness.ts";
import type { AutomationStudioSiteResetToggleStanding } from "./control-tracker.ts";

/**
 * Why an act is still open, and where (`ref` a destination's issued ref, `location` where to look or act, `group` the opaque
 * group of a list witness, for Core alone). `adopted`: the reason is an adopted list's (header).
 */
export type AutomationStudioSiteResetOpenReason = { reason: "look" | "undo" | "toggle" | "name" | "unreachable"; witness?: "group" | "toggle"; ref?: string; location?: string; group?: string; adopted?: true };

/** `unread`: the refs of lists named for the act that Core could not read again (header); present only where there were any. */
export type AutomationStudioSiteResetSettlement =
  | { kind: "settled"; how: "restored" | "unchanged"; unread?: string[] }
  | { kind: "open"; reasons: AutomationStudioSiteResetOpenReason[] };

/** One group witness as judged, with where it is told by and whether Core could not read it again (`unreachable`). */
export type AutomationStudioSiteResetJudgedGroup = AutomationStudioSiteResetGroupStanding & { ref?: string | undefined; location?: string | undefined; group?: string | undefined; unreachable?: boolean | undefined };

export function automationStudioSiteResetSettleDecision(input: {
  groups: readonly AutomationStudioSiteResetJudgedGroup[];
  toggle?: AutomationStudioSiteResetToggleStanding | undefined;
  /** A read after the act showed one of its witnesses changed. */
  changeSeen: boolean;
  /** An undo of it landed. */
  undoLanded: boolean;
  /** The build's issued lists it could have changed, judged as witnesses only where it has none of its own (header). */
  adopted?: readonly AutomationStudioSiteResetJudgedGroup[] | undefined;
}): AutomationStudioSiteResetSettlement {
  const groups = input.groups.filter((group) => group.status !== "none");
  if (!groups.length && !input.toggle) return adoptedDecision(input.adopted ?? [], input.changeSeen || input.undoLanded);
  // A list Core could not read again is never a look again (header): only one read fresh says anything of it.
  const unreachable = groups.filter(unreadable);
  const reachable = groups.filter((group) => !unreadable(group));
  const reasons: AutomationStudioSiteResetOpenReason[] = [];
  for (const group of reachable) {
    if (group.status === "holds") continue;
    reasons.push({ reason: group.status === "differs" ? "undo" : "look", witness: "group", ...where(group) });
  }
  const toggle = input.toggle;
  if (toggle && toggle.status !== "holds") reasons.push({ reason: toggle.status === "stale" ? "look" : "toggle", witness: "toggle", ...(toggle.location ? { location: toggle.location } : {}) });
  if (reasons.length) return { kind: "open", reasons };
  // Its only witnesses are lists no read can reach: nothing can show it put back (header).
  if (!reachable.length && !toggle) return { kind: "open", reasons: unreachable.map((group): AutomationStudioSiteResetOpenReason => ({ reason: "unreachable", witness: "group", ...where(group) })) };
  const how = input.changeSeen || input.undoLanded ? "restored" : "unchanged";
  return unreachable.length ? { kind: "settled", how, unread: unreachable.flatMap((group) => (group.ref ? [group.ref] : [])) } : { kind: "settled", how };
}

/** An act with no witness of its own, judged on the issued lists it could have changed (header); with none, it is to name one. */
function adoptedDecision(adopted: readonly AutomationStudioSiteResetJudgedGroup[], restored: boolean): AutomationStudioSiteResetSettlement {
  const groups = adopted.filter((group) => group.status !== "none" && !unreadable(group));
  if (!groups.length) return { kind: "open", reasons: [{ reason: "name" }] };
  if (groups.some((group) => group.status === "differs")) return { kind: "open", reasons: [{ reason: "name", adopted: true }] };
  const reasons: AutomationStudioSiteResetOpenReason[] = [];
  for (const group of groups) {
    if (group.status === "holds") continue;
    reasons.push({ reason: "look", witness: "group", ...where(group), adopted: true });
  }
  if (reasons.length) return { kind: "open", reasons };
  return { kind: "settled", how: restored ? "restored" : "unchanged" };
}

/** A group Core could not read again, as last read: stale or incomplete (header). One read fresh is judged as any. */
function unreadable(group: AutomationStudioSiteResetJudgedGroup): boolean {
  return group.unreachable === true && (group.status === "stale" || group.status === "incomplete");
}

/** Where a group witness is told by: its ref, its location, and its opaque group. */
function where(group: AutomationStudioSiteResetJudgedGroup): { ref?: string; location?: string; group?: string } {
  return { ...(group.ref ? { ref: group.ref } : {}), ...(group.location ? { location: group.location } : {}), ...(group.group ? { group: group.group } : {}) };
}
