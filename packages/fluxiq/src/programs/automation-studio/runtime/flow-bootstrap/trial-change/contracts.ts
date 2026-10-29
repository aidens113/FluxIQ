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

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioSiteResetCollection } from "../reset-settlement/index.ts";

/**
 * One reading of a witness's place, before or after a trial: where it came
 * from (the ledger's latest read while still current, a look Core took, the
 * end view's read, or the acting step's own diff, read just before and just
 * after that step: t787), its location, the complete list groups it carried, its
 * controls (place -> state token -> count), and, on an after reading, the
 * domain's readable differences from the before reading.
 */
export type AutomationStudioTrialReading = {
  source: "latest_read" | "core_look" | "end_view" | "step_diff";
  location?: string;
  collections?: AutomationStudioTrialCollection[];
  controls?: Record<string, Record<string, number>>;
  lines?: { gone: string[]; added: string[] };
};

/**
 * One complete list group's collection as a trial reads it. A page read whole (t791,
 * `../site-reset/page-collection.ts`: every subject one read of a page reports, as one list Core makes of it, which an
 * empty page reads as holding nothing) also carries `values`, an opaque digest of every value that page shows (t772), so
 * a quantity the page shows changing is a change of that page (`./delta.ts`). A list the domain read carries none.
 */
export type AutomationStudioTrialCollection = AutomationStudioSiteResetCollection & { values?: string };

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

/** One witness's delta from before to after. `unread` when either side carried no reading of it. List subjects and control state tokens stay opaque here; the packet reduces them to counts. A changed control is `returned` where every state it changed ended at the build's recorded start for its place (`./delta.ts`, t787). */
export type AutomationStudioTrialDelta =
  | { witness: string; kind: "list" | "control"; status: "unread" }
  | { witness: string; kind: "list"; status: "changed" | "unchanged"; added: string[]; removed: string[]; changed: string[]; unchanged: string[] }
  | { witness: string; kind: "control"; status: "changed" | "unchanged"; before: Record<string, number>; after: Record<string, number>; returned?: true };

/** What the trial proves of one part: `none` (the part has no typed effect), `shown`, `no_change`, `already_in_end_state`, `carried` (the end state held before, and the same step was seen making it earlier in the build), `unproven`, or `contradicted` (a part asking to add, one of whose controls the trial put back to the build's start: t787), which is never a yes. */
export type AutomationStudioTrialProof = "none" | "shown" | "no_change" | "already_in_end_state" | "carried" | "unproven" | "contradicted";

/** One part's proof, with its effect and the trial steps whose acts serve it. */
export type AutomationStudioTrialPartProof = { part: string; effect?: AutomationStudioTrialPartEffect; proof: AutomationStudioTrialProof; steps: number[] };

/** Core's closed mechanical findings over a trial's change. */
export type AutomationStudioTrialChangeFinding =
  | { code: "result.change_not_seen"; part: string }
  | { code: "result.unasked_change"; witness: string; where?: string }
  | { code: "result.change_contradicted"; part: string; witness: string };

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

// ---- Readings around a live trial (t775 phase D1) ----

/**
 * One step a live trial will run, as Core reads where its change shows: its number in the plan, its registered
 * definition, its lasting classes, its node's witness stamp (unread here: the ledger resolves it), and the task parts
 * it serves (none for a step that only prepares the trial's entry, or in a build with no task parts).
 */
export type AutomationStudioTrialChangeStep = { step: number; definitionId: string; label?: string; consequences: readonly string[]; witness?: unknown; parts: string[] };

/** One task part a trial is judged on, with its typed effect where the plan declared one. */
export type AutomationStudioTrialChangePart = { id: string; effect?: AutomationStudioTrialPartEffect | undefined };

/** Where a witness is read: a list group, or a control place, and the page location Core can open it at (absent where none is known). */
export type AutomationStudioTrialWitnessPlace =
  | { kind: "list"; group: string; location?: string }
  | { kind: "control"; place: string; location?: string };

/** The latest read a ledger holds of one place: its reading, the domain's opaque state of that page, whether no lasting call or trial landed since (`fresh`), and its order among the ledger's reads (`seq`). */
export type AutomationStudioTrialLatestRead = { reading: AutomationStudioTrialReading; state?: JsonObject; fresh: boolean; seq: number };

/** The narrow, read-only view of a build's ledger that the trial readings ask (`../site-reset/ledger.ts`, `trialChange`). */
export type AutomationStudioTrialChangeLedgerPort = {
  /** The places a step's witness stamp names: a destination's list, a control receipt's place, a repeated act's lists and control. */
  places(witness: unknown): AutomationStudioTrialWitnessPlace[];
  latest(place: AutomationStudioTrialWitnessPlace): AutomationStudioTrialLatestRead | undefined;
  /** How many reads the ledger has taken so far: a look landed when a place's latest read is newer than this was before it. */
  seq(): number;
  /** This build's acts on the site as the trial starts: still in place, kept, settled with no change seen, or that no call can settle. */
  leftFromEarlier(): AutomationStudioTrialLeftAct[];
  /** Whether an earlier act of the same step definition (and the same control or repeated act, where the stamp names one) was seen to change the site in this build. */
  carried(step: Pick<AutomationStudioTrialChangeStep, "definitionId" | "witness">): boolean;
  /**
   * The counts a control place showed at the build's start, where the build read them (the control tracker's `start`,
   * `../reset-settlement/control-tracker.ts`); none where it never did. A changed control that ends there was put back,
   * which a part asking to add can never be (`./proof.ts`, t787). Absent on a port that keeps no starts.
   */
  start?(place: string): Readonly<Record<string, number>> | undefined;
};

/** Core's own look at a location (the start check's `lookAt`): its read reaches the ledger; `start`, where given, is the before state the domain words its lines against. */
export type AutomationStudioTrialChangeLook = (location: string, start?: JsonObject) => Promise<void>;

/** A trial's witnesses, with where each is read and which witnesses each step's stamp and each step definition name. */
export type AutomationStudioTrialWitnessSet = {
  witnesses: AutomationStudioTrialWitness[];
  places: Record<string, AutomationStudioTrialWitnessPlace>;
  /** Witness ids by the JSON of a stamp. */
  byStamp: Record<string, string[]>;
  /** Witness ids and served parts by step definition. */
  byDefinition: Record<string, { witnesses: string[]; parts: string[] }>;
};

/** One act a live trial made or passed over, as the trial port reports it: the step's number as the trial's feedback numbers it, its definition and stamp, what it did, and, for a landed act whose own diff read its control, that control's place, page location and counts just before and just after it (t787: each pass of a loop at its own item). */
export type AutomationStudioTrialChangeAct = {
  step: number;
  definitionId: string;
  witness?: unknown;
  pass?: { number: number; of: number } | undefined;
  row?: string | undefined;
  outcome: AutomationStudioTrialActOutcome["outcome"];
  control?: AutomationStudioTrialActControl | undefined;
};

/** The control one landed act pressed, read by the act's own diff: its opaque place, its page's location where known, and the place's counts on each side. */
export type AutomationStudioTrialActControl = { place: string; location?: string; before: Record<string, number>; after: Record<string, number> };

/** The judge's packet and Core's findings over it. */
export type AutomationStudioTrialChangeOutcome = { siteChange: AutomationStudioTrialSiteChange; findings: AutomationStudioTrialChangeFinding[] };

/** The readings Core took just before a live trial, finished by reading again just after it, before its judge. */
export type AutomationStudioTrialChangeSession = {
  finish(acts: readonly AutomationStudioTrialChangeAct[], signal?: AbortSignal): Promise<AutomationStudioTrialChangeOutcome>;
};

/** What a trial gate hands its reset so Core can read the trial's change and find a start already in an asked end state. */
export type AutomationStudioTrialChangeAsk = { steps: readonly AutomationStudioTrialChangeStep[]; parts: readonly AutomationStudioTrialChangePart[] };

/** One side's readings by witness id, and each location's opaque state on that side (`./readings.ts`). */
export type AutomationStudioTrialSideReadings = { readings: Record<string, AutomationStudioTrialReading>; starts: Record<string, JsonObject> };

/** One read a ledger logged for trial readings (`./read-log.ts`), with the ledger clock when it landed and its order. */
export type AutomationStudioTrialLoggedRead = { state: JsonObject; location?: string; lines?: { gone: string[]; added: string[] }; collections?: AutomationStudioTrialCollection[]; controls?: Record<string, Record<string, number>>; clock: number; seq: number };
