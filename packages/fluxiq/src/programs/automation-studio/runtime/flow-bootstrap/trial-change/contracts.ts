// The shapes a trial is judged by its change in (t775): the site's state read
// just before a trial and just after it at each place a lasting step's change
// shows (a witness), what each act of the trial did, what each task part's
// typed effect proves from those readings, and the packet the judge sees.
//
// A trial is judged against the before-state and the change the task asks
// for, never against an absolute state: a list line at 9 that is 10 after a
// part asking to add 1 is shown, with no reset. Group, scope, place, subject
// and state tokens are opaque (the domain's); only the packet's readable lines
// and counts reach the judge.

import type { AutomationStudioSiteResetCollection } from "../reset-settlement/index.ts";

/**
 * One reading of a witness's place, before or after a trial: where it came
 * from (the ledger's latest read while still current, a look Core took, or
 * the end view's read), its location, the complete list groups it carried, its
 * controls (place -> state token -> count), and, on an after reading, the
 * domain's readable differences from the before reading.
 */
export type AutomationStudioTrialReading = {
  source: "latest_read" | "core_look" | "end_view";
  location?: string;
  collections?: AutomationStudioSiteResetCollection[];
  controls?: Record<string, Record<string, number>>;
  lines?: { gone: string[]; added: string[] };
};

/** Where a part's or a step's change shows: a list group, matched across every scope it was read in, or one control place. `steps` are the trial steps attributed to it (`[]` for a list watched only to stay unchanged). */
export type AutomationStudioTrialWitness = (
  | { id: string; kind: "list"; group: string }
  | { id: string; kind: "control"; place: string }
) & { where?: string; steps: number[]; parts: string[] };

/** A task part's typed effect: structurally Core's `AutomationStudioProjectTaskEffect` (project-agents), written here so this directory imports nothing from it. */
export type AutomationStudioTrialPartEffect =
  | { kind: "change"; direction: "adds" | "removes"; count: number | "each_match"; what: string }
  | { kind: "end_state"; state: string };

/** What one act of the trial did: the step, the repeat pass and readable row it acted on, whether it changed something, found its target already in the asked state, or showed no change; the witness it shows at and the parts it serves. */
export type AutomationStudioTrialActOutcome = {
  step: number;
  pass?: { number: number; of: number };
  row?: string;
  outcome: "changed" | "already_in_state" | "no_change_seen";
  witness?: string;
  parts: string[];
};

/** One witness's delta from before to after. `unread` when either side carried no reading of it. List subjects and control state tokens stay opaque here; the packet reduces them to counts. */
export type AutomationStudioTrialDelta =
  | { witness: string; kind: "list" | "control"; status: "unread" }
  | { witness: string; kind: "list"; status: "changed" | "unchanged"; added: string[]; removed: string[]; changed: string[]; unchanged: string[] }
  | { witness: string; kind: "control"; status: "changed" | "unchanged"; before: Record<string, number>; after: Record<string, number> };

/** What the trial proves of one part: `none` (the part has no typed effect), `shown`, `no_change`, `already_in_end_state`, `carried` (the end state held before, and the same step was seen making it earlier in the build), or `unproven`. */
export type AutomationStudioTrialProof = "none" | "shown" | "no_change" | "already_in_end_state" | "carried" | "unproven";

/** One part's proof, with its effect and the trial steps whose acts serve it. */
export type AutomationStudioTrialPartProof = { part: string; effect?: AutomationStudioTrialPartEffect; proof: AutomationStudioTrialProof; steps: number[] };

/** Core's closed mechanical findings over a trial's change. */
export type AutomationStudioTrialChangeFinding =
  | { code: "result.change_not_seen"; part: string }
  | { code: "result.unasked_change"; witness: string; where?: string };

/** An act of this build in place at the trial's start, in the words of what it did. */
export type AutomationStudioTrialLeftAct = { did: string; where?: string };

/** A witness's reading as the judge sees it: counts only, never a token. */
export type AutomationStudioTrialSiteSide = "unread" | { source: AutomationStudioTrialReading["source"]; rows: number } | { source: AutomationStudioTrialReading["source"]; state: Record<string, number> };

/** Bounded readable lines, with how many were left out on each side. */
export type AutomationStudioTrialSiteLines = { gone: string[]; added: string[]; cut?: { gone: number; added: number } };

/** A witness's change as the judge sees it. */
export type AutomationStudioTrialSiteWitnessChange =
  | "unread"
  | "none"
  | { added: number; removed: number; changed: number; unchanged: number; lines?: AutomationStudioTrialSiteLines }
  | { from: Record<string, number>; to: Record<string, number>; lines?: AutomationStudioTrialSiteLines };

/** The bounded `siteChange` packet the judge sees (design section 2). No group, scope, place, subject or state token appears in it. */
export type AutomationStudioTrialSiteChange = {
  witnesses: Array<{ id: string; kind: "list" | "control"; where?: string; steps: number[]; parts: string[]; before: AutomationStudioTrialSiteSide; after: AutomationStudioTrialSiteSide; change: AutomationStudioTrialSiteWitnessChange }>;
  acts: Array<{ step: number; pass?: { number: number; of: number }; row?: string; outcome: AutomationStudioTrialActOutcome["outcome"]; witness?: string; parts: string[] }>;
  leftFromEarlier: AutomationStudioTrialLeftAct[];
  proofs: Array<{ part: string; effect: AutomationStudioTrialPartEffect; proof: Exclude<AutomationStudioTrialProof, "none">; steps: number[] }>;
  omitted?: { witnesses?: number; acts?: number; leftFromEarlier?: number };
};
