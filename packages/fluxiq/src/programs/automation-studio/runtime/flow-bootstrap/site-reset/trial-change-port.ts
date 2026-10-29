// One ledger as a live trial's readings see it (t775 D1), split out of
// `./ledger.ts`, which builds it over its own acts and receipts.
//
// - **Where a step's change shows** (`port().places`): a step's witness stamp
//   resolved through the build's receipts -- a destination ref to its list
//   group, a control receipt to its place, a repeated explored act to its lists
//   and its own control -- each with the location it was last read at, else
//   where its original was read.
// - **The latest read of a place** (`port().latest`), from the ledger's read
//   log (`../trial-change/read-log.ts`), fresh while no lasting call or trial
//   landed since (the ledger clock).
// - **What of the build is on the site** (`leftFromEarlier`): acts in place,
//   that no call can settle, kept, irreversible, or settled with no change seen
//   (t772: these are no longer among a trial's acts left, so they are said
//   here), each by what it did.
// - **Whether a step's change was seen before** (`carried`): an act of the same
//   definition at the step's control place, or the act its stamp repeats (or a
//   trial act repeating it), whose change a read showed.
// - **A start already in an asked end state** (`endStateClash`): an in-place
//   act whose change was seen, of another definition, on a step's list or at
//   its control place, for a step serving an `end_state` part whose own change
//   was never seen (`carried`). The ledger refuses the trial on just those acts.

import { automationStudioSiteResetWitnessStampValid as stampValid } from "../reset-admission/index.ts";
import {
  AutomationStudioTrialChangeReadLog,
  automationStudioTrialChangeBegin,
  type AutomationStudioTrialChangeAsk,
  type AutomationStudioTrialChangeLedgerPort,
  type AutomationStudioTrialChangeSession,
  type AutomationStudioTrialLeftAct,
  type AutomationStudioTrialWitnessPlace
} from "../trial-change/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioSiteResetChecks } from "./contracts.ts";
import type { AutomationStudioSiteResetControlWitnesses } from "./control-witnesses.ts";
import type { AutomationStudioSiteResetCreateBaselines } from "./create-baselines.ts";
import type { AutomationStudioSiteResetExploredAct } from "./ledger.ts";
import type { AutomationStudioSiteResetLedgerAct } from "./ledger-act.ts";
import type { AutomationStudioSiteResetLeftover } from "./leftover.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

type Act = AutomationStudioSiteResetLedgerAct;
type Step = AutomationStudioTrialChangeAsk["steps"][number];

/** The classes whose change a witness shows. */
const LASTING: ReadonlySet<string> = new Set<AutomationStudioActionConsequence>(["create_new", "modify_existing", "delete"]);

export class AutomationStudioSiteResetTrialChange {
  /** Every read that reached the ledger, for a trial's readings (header). */
  readonly readLog = new AutomationStudioTrialChangeReadLog();

  constructor(private readonly ledger: {
    acts: () => readonly Act[];
    clock: () => number;
    createBaselines: Pick<AutomationStudioSiteResetCreateBaselines, "retained" | "described">;
    controlWitnesses: Pick<AutomationStudioSiteResetControlWitnesses, "resolve">;
    explored: () => readonly AutomationStudioSiteResetExploredAct[];
    standing: (act: Act) => AutomationStudioSiteResetLeftover["standing"];
    groups: (act: Act) => string[];
    /** The counts a control place showed at the build's start (the control tracker's `start`), for a trial's direction (`../trial-change/proof.ts`, t787). */
    controlStart?: (place: string) => Readonly<Record<string, number>> | undefined;
  }) {}

  /** The read-only port a trial's readings ask (header). */
  port(): AutomationStudioTrialChangeLedgerPort {
    return {
      places: (witness) => this.places(witness),
      latest: (place) => {
        const read = this.readLog.latest(place);
        if (!read) return undefined;
        const seen = place.kind === "list"
          ? (read.collections ? { collections: read.collections.filter((entry) => entry.group === place.group) } : {})
          : (read.controls ? { controls: read.controls } : {});
        return { reading: { source: "latest_read", ...(read.location ? { location: read.location } : {}), ...seen, ...(read.lines ? { lines: read.lines } : {}) }, state: read.state, fresh: read.clock === this.ledger.clock(), seq: read.seq };
      },
      seq: () => this.readLog.seq,
      leftFromEarlier: () => this.leftFromEarlier(),
      carried: (step) => this.carried(step),
      start: (place) => this.ledger.controlStart?.(place)
    };
  }

  /** A trial's readings begun over this ledger (header); none without the trial's steps or without a look. */
  async begin(ask: AutomationStudioTrialChangeAsk | undefined, checks: AutomationStudioSiteResetChecks): Promise<AutomationStudioTrialChangeSession | undefined> {
    const look = checks.lookAt;
    if (!ask || !look) return undefined;
    return await automationStudioTrialChangeBegin({ steps: ask.steps, parts: ask.parts, port: this.port(), look: (location, start) => look(location, start) });
  }

  /** The in-place acts already showing an end state a step of the trial is to bring about, made with another step (header). */
  endStateClash(ask: AutomationStudioTrialChangeAsk, carried: (step: Step) => boolean = (step) => this.carried(step)): Act[] {
    const ends = new Set(ask.parts.filter((part) => part.effect?.kind === "end_state").map((part) => part.id));
    if (!ends.size) return [];
    const clashing = new Map<string, Act>();
    for (const step of ask.steps) {
      if (!step.parts.some((part) => ends.has(part)) || step.witness === undefined || !step.consequences.some((consequence) => LASTING.has(consequence)) || carried(step)) continue;
      const places = this.places(step.witness);
      for (const act of this.ledger.acts()) {
        const standing = this.ledger.standing(act);
        if (act.possible || !act.changeSeen || act.operation === step.definitionId || (standing !== "in_place" && standing !== "unsettleable" && standing !== "kept")) continue;
        const groups = this.ledger.groups(act);
        if (places.some((place) => (place.kind === "control" ? act.spot?.place === place.place || act.controlOriginal?.place === place.place : groups.includes(place.group)))) clashing.set(act.id, act);
      }
    }
    return [...clashing.values()];
  }

  /** The places a step's witness stamp names (header). */
  private places(witness: unknown): AutomationStudioTrialWitnessPlace[] {
    if (!stampValid(witness)) return [];
    if (witness.via === "destination") {
      const named = this.ledger.createBaselines.retained(witness.ref);
      return named ? [this.listPlace(named)] : [];
    }
    if (witness.via === "control") {
      const stamped = this.ledger.controlWitnesses.resolve(witness.ref);
      return stamped ? [this.controlPlace(stamped.place, stamped.location)] : [];
    }
    if (witness.via !== "repeats") return [];
    const repeated = this.ledger.explored().find((act) => act.id === witness.act);
    if (!repeated) return [];
    const places = repeated.destinations.map((destination) => this.listPlace(destination));
    if (repeated.spot?.place !== undefined && repeated.consequences.length === 1 && repeated.consequences[0] === "modify_existing") places.push(this.controlPlace(repeated.spot.place));
    return places;
  }

  /** A list group as a trial reads it, at the location it was last read, else where its original was read. */
  private listPlace(named: { scope: string; group: string }): AutomationStudioTrialWitnessPlace {
    const location = this.readLog.locationOf({ kind: "list", group: named.group }) ?? this.ledger.createBaselines.described(named.scope)?.location;
    return { kind: "list", group: named.group, ...(location !== undefined ? { location } : {}) };
  }

  /** A control place as a trial reads it, at the location given, else where it was last read. */
  private controlPlace(place: string, location?: string): AutomationStudioTrialWitnessPlace {
    const where = location ?? this.readLog.locationOf({ kind: "control", place });
    return { kind: "control", place, ...(where !== undefined ? { location: where } : {}) };
  }

  /** This build's acts on the site as a trial starts (header). */
  private leftFromEarlier(): AutomationStudioTrialLeftAct[] {
    return this.ledger.acts().flatMap((act) => {
      if (act.possible) return [];
      const standing = this.ledger.standing(act);
      const settledUnchanged = act.settled === "unchanged";
      if (!settledUnchanged && standing !== "in_place" && standing !== "unsettleable" && standing !== "kept" && standing !== "irreversible") return [];
      const did = settledUnchanged ? `${act.did} (${WORDS.settledAs("unchanged", act.unread)})` : act.did;
      // `place` is kept only where the act changed something its reads could name (`./ledger.ts`, `placed`); an act made where
      // nothing differed, as in a dialog over the page, is placed by where its control was read (t796).
      const where = act.place?.location || act.controlOriginal?.location || (act.spot?.place !== undefined ? this.readLog.locationOf({ kind: "control", place: act.spot.place }) : undefined);
      return [{ did, ...(where ? { where } : {}) }];
    });
  }

  /** Whether an earlier act of this step's definition -- the act it repeats, or one at its control's place -- was seen to change the site (header). */
  private carried(step: { definitionId: string; witness?: unknown }): boolean {
    const stamp = stampValid(step.witness) ? step.witness : undefined;
    const place = stamp?.via === "control" ? this.ledger.controlWitnesses.resolve(stamp.ref)?.place : undefined;
    return this.ledger.acts().some((act) => act.changeSeen && (stamp?.via === "repeats"
      ? act.id === stamp.act || act.repeats.includes(stamp.act)
      : act.operation === step.definitionId && (place === undefined || act.spot?.place === place || act.controlOriginal?.place === place)));
  }
}
