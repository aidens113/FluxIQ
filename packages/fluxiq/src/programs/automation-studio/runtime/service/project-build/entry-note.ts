import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioSubflowEntryLeft, type AutomationStudioSubflowEntryLeftAct, type AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectBuildEntry } from "./entry-preparation.ts";

// What a dependent builder's opening look says about its entry, beside the
// domain's evidence under `entry` (`./brief-ports.ts`, which adds it; t580,
// t585, t638): whether Core ran the subflows before it to prepare the entry,
// and why not when it could not; the acts of this build the start hook put
// back first (`absorbedByStartReset`); and the lasting acts the preparation run
// landed (`predecessorsLeftOnSite`), as the project ledger holds them.
//
// **What it says depends on what the brief's parts ask (t676).** On three A8
// Lab runs a later builder ended blocked as "already done"; once its parts only
// read, so no predecessor could have done them, and once the act that did it
// was a press that declared nothing, so it was left out of the list. A possible
// act the preparation run landed is now listed too, marked `possibly`; the
// words "what they did is already done" and "end the brief blocked" are said
// only to a brief with a part that asks a lasting act, naming the
// `doneBefore` shape its ending takes; and a brief whose parts only read is
// told to explore and build from here. The list's key is the one the builder
// loop reads the act ids back from to check that ending
// (`flow-bootstrap/subflow-candidate/done-before.ts`).

/**
 * What a dependent builder's opening look says about its entry; nothing for a
 * subflow the build's start begins. `absorbed` names the acts of this build
 * the start hook put back before its predecessors ran, and `landed` the
 * lasting acts the run that prepared the entry left on the site, a possible
 * one marked `possibly` (header). Only a scope with a part that asks a lasting
 * act is told to end the brief blocked when one of them is its part (t676).
 */
export function automationStudioProjectBuildEntryNote(scope: AutomationStudioSubflowScope, entry: AutomationStudioProjectBuildEntry, absorbed: readonly string[] | undefined, landed: readonly AutomationStudioSubflowEntryLeftAct[] = []): JsonObject | undefined {
  if (entry.kind === "start") return undefined;
  const { subflowKey } = scope;
  const names = entry.predecessors.map((key) => `"${key}"`).join(", ");
  const putBack = absorbed?.length ? { absorbedByStartReset: [...absorbed] } : {};
  const acting = scope.parts.filter((part) => (part.lastingActs?.length ?? 0) > 0).map((part) => part.partId);
  if (entry.kind === "prepared") {
    if (!landed.length) return { prepared: true, note: PREPARED(names, subflowKey, acting.length > 0), ...putBack };
    const possibly = landed.some((act) => act.possibly) ? "An act marked possibly declared no lasting act, yet changed its own page, so it may be on the site too. " : "";
    const left = `${PREPARED(names, subflowKey, acting.length > 0)} Their lasting acts are under ${LEFT.leftKey}: each is on the site now, even where a page has not caught up with it. ${possibly}`;
    const note = acting.length
      ? `${left}If one of them is what a part of yours asks for (only ${acting.map((id) => `"${id}"`).join(", ")} ${acting.length === 1 ? "asks" : "ask"} a lasting act), a subflow before yours already does it: do not do it again, and end the brief blocked naming that part and that act -- `
        + `complete with {"ended": "blocked", "reason": "<which part, and which subflow did it>", "doneBefore": {"part": "<the part's id>", "act": "<the act's id>"}} -- so the plan can change.`
      : `${left}Your parts ask for no lasting act, so none of these is a part of yours: build your parts from this page.`;
    return { prepared: true, note, [LEFT.leftKey]: landed.map((act) => ({ ...act })), ...putBack };
  }
  const why = entry.missing?.length
    ? `${entry.missing.map((key) => `"${key}"`).join(", ")} has no proposal whose trial passed yet, so Core could not run it first`
    : entry.failed
      ? `Core ran them to reach your entry, but "${entry.failed}" did not run to its end (${entry.code})`
      : `Core could not run them to reach your entry (${entry.code})`;
  return { prepared: false, code: entry.code, note: `Your subflow "${subflowKey}" begins where ${names} leave the site, but ${why}. This page is not your subflow's entry: what you see and do here may differ from what your subflow meets when it runs after them.`, ...putBack };
}

/** The note of a prepared entry, before what its predecessors left (header); "already done" only where a part of the brief asks a lasting act (t676). */
const PREPARED = (names: string, subflowKey: string, acting: boolean) => `Before this first look, Core ran the passing proposals of the subflows before yours (${names}) once, in order, so the site is where your subflow "${subflowKey}" begins. `
  + (acting ? "Explore and build from here; what they did is already done, so do not do it again." : "Explore and build from here.");

/** Where the opening look's note lists what the preparation run landed, which the builder loop reads back (`flow-bootstrap/subflow-candidate/done-before.ts`, t676). */
const LEFT = automationStudioSubflowEntryLeft;
