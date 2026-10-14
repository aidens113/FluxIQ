import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioSiteResetNamedAct } from "../../flow-bootstrap/site-reset/index.ts";

// What a phase of a project build is told about how it started (t593, step
// (e) of `./phase-start.ts`): which of the start's steps ran, and on what page
// it stands. Every phase is told in the same words, under `phaseStart` -- a
// builder's, a repair's and a reset's opening look, and a subflow trial's and
// the whole trial's feedback -- so a model is never told `reset` for a half
// start (A8 bigbox debug, fix 5: "server state reset, page not reloaded" read
// the same as a full start). The words name no site, task or product. A build
// presses many controls that declare `none`, so of the possibly lasting ones
// only the latest few are named, with how many more there are.

/** The most possibly lasting presses a phase is told of by name (header); the rest are counted. */
const MAX_POSSIBLY_NAMED = 10;

/** The phases of a project build, each of which starts through `./phase-start.ts`. */
export type AutomationStudioProjectBuildPhase = "builder" | "repair" | "reset" | "subflow_trial" | "whole_trial";

/**
 * What a phase's start came to, step by step (`./phase-start.ts`):
 *
 * - (a) `hook`: the deployment's start hook ran and put the site back, there is
 *   none, it failed, or the phase cannot say (a trial that never got that far);
 * - (b) `putBack`: the acts of this build the hook took back; `stillOnSite`:
 *   acts of this build still on the site (no hook, or one that failed);
 *   `possiblyOnSite`: presses that declared no lasting act but had an effect,
 *   which may still be there (`flow-bootstrap/site-reset/ledger.ts`). A trial
 *   leaves these to its gate, which names them beside its feedback;
 * - (c) `arrival`: Core loaded the start location (`loaded`), the phase's own
 *   opening goes there (`opening`), nothing did (`none`), or nothing ran
 *   (`not_run`);
 * - (d) `predecessors`: for a phase that begins after other subflows, whether
 *   their latest passing proposals ran it to its entry;
 * - `startLocation`: where the build starts, when it was told.
 */
export type AutomationStudioProjectBuildPhaseStartRecord = {
  phase: AutomationStudioProjectBuildPhase;
  hook: "ran" | "none" | "failed" | "unknown";
  hookCode?: string;
  putBack?: AutomationStudioSiteResetNamedAct[];
  stillOnSite?: AutomationStudioSiteResetNamedAct[];
  possiblyOnSite?: AutomationStudioSiteResetNamedAct[];
  arrival: "loaded" | "opening" | "none" | "not_run";
  predecessors?: { keys: string[]; prepared: boolean; code?: string };
  startLocation?: string;
};

/** The record as the phase is told it (header). */
export function automationStudioProjectBuildPhaseStartTold(record: AutomationStudioProjectBuildPhaseStartRecord): JsonObject {
  const putBack = record.putBack ?? [];
  const still = record.stillOnSite ?? [];
  const possiblyAll = record.possiblyOnSite ?? [];
  // The latest few by name, the rest counted (header).
  const possibly = possiblyAll.slice(-MAX_POSSIBLY_NAMED);
  const leftOut = possiblyAll.length - possibly.length;
  const trial = record.phase === "subflow_trial" || record.phase === "whole_trial";
  const sentences = [
    hookSaid(record),
    putBack.length ? `It took back this build's acts ${ids(putBack)}.` : "",
    trial ? gateSaid(record.hook) : "",
    still.length ? stillSaid(record.phase, still) : "",
    possibly.length ? `These presses declared no lasting act but changed the page, and may still be on the site: ${ids(possibly)}${leftOut ? `, and ${leftOut} earlier` : ""}. Nothing asks for them; undo one under \`undoes\` only if it is still there.` : "",
    arrivalSaid(record.arrival),
    record.predecessors ? predecessorsSaid(record.predecessors) : ""
  ];
  return {
    phase: record.phase,
    startHook: record.hook,
    ...(record.hookCode ? { startHookCode: record.hookCode } : {}),
    ...(putBack.length ? { putBack: putBack.map((act) => act.act) } : {}),
    ...(still.length ? { stillOnSite: still.map(named) } : {}),
    ...(possibly.length ? { possiblyOnSite: possibly.map(named) } : {}),
    ...(leftOut ? { possiblyOnSiteLeftOut: leftOut } : {}),
    arrival: record.arrival,
    ...(record.predecessors ? { predecessors: { ran: [...record.predecessors.keys], prepared: record.predecessors.prepared, ...(record.predecessors.code ? { code: record.predecessors.code } : {}) } } : {}),
    standsOn: standsOn(record),
    note: sentences.filter((sentence) => sentence).join(" ")
  };
}

function hookSaid(record: AutomationStudioProjectBuildPhaseStartRecord): string {
  if (record.hook === "ran") return "First the deployment's start hook ran and put the site back to its start.";
  if (record.hook === "none") return "This deployment has no start hook, so nothing put the site back on its own.";
  if (record.hook === "failed") return `The deployment's start hook failed${record.hookCode ? ` (${record.hookCode})` : ""}, so the site was not put back.`;
  return "";
}

/** Where a trial's gate names the acts of the start: beside this feedback, never in it. */
function gateSaid(hook: AutomationStudioProjectBuildPhaseStartRecord["hook"]): string {
  if (hook === "ran") return "Acts of this build it took back are named under absorbedByStartReset beside this feedback.";
  return hook === "unknown" ? "" : "Acts of this build still in place, if any, are named under startedWith beside this feedback.";
}

function stillSaid(phase: AutomationStudioProjectBuildPhase, still: readonly AutomationStudioSiteResetNamedAct[]): string {
  if (phase === "reset") return `These acts of this build are still on the site, and they are what this reset undoes: ${ids(still)}.`;
  return `These acts of this build are still on the site, so it is not as the build found it: ${ids(still)}. They are undone through the site's own controls before a trial, each named under \`undoes\`.`;
}

function arrivalSaid(arrival: AutomationStudioProjectBuildPhaseStartRecord["arrival"]): string {
  if (arrival === "loaded") return "Core then loaded the build's start location.";
  if (arrival === "opening") return "The opening look goes to the build's start location.";
  if (arrival === "none") return "Nothing loaded the build's start location, so the page is where the last run left it.";
  return "Nothing ran.";
}

function predecessorsSaid(predecessors: NonNullable<AutomationStudioProjectBuildPhaseStartRecord["predecessors"]>): string {
  const names = predecessors.keys.map((key) => `"${key}"`).join(", ");
  if (predecessors.prepared) return `Then the passing proposals of the subflows before this one (${names}) ran once, in order, so the site is where this subflow begins.`;
  return `The subflows before this one (${names}) did not run it to its entry${predecessors.code ? ` (${predecessors.code})` : ""}, so this is not where it begins.`;
}

function standsOn(record: AutomationStudioProjectBuildPhaseStartRecord): string {
  if (record.predecessors?.prepared) return `where ${record.predecessors.keys.map((key) => `"${key}"`).join(", ")} leave the site`;
  if (record.arrival === "loaded" || record.arrival === "opening") return record.startLocation ? `the build's start location (${record.startLocation})` : "the build's start location";
  return record.arrival === "not_run" ? "nothing ran" : "the page as the last run left it";
}

function ids(acts: readonly AutomationStudioSiteResetNamedAct[]): string {
  return acts.map((act) => act.act).join(", ");
}

function named(act: AutomationStudioSiteResetNamedAct): JsonObject {
  return { act: act.act, did: act.did };
}
