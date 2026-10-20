// The story of each recent unit of work, as the chat tells it: every decision
// Core explains (a `thought` with its reason), every check and repair, every
// action's start and end, every run step, and the event that ends the unit.
// The relay's `recent` keeps only the last 60 events of every kind, so a long
// build's first decisions fell out of it; this keeps the whole unit, bounded
// (`ACTIVITY_HISTORY_LIMITS`): the last few units of work, each at most so
// many events, the newest kept.
//
// The current build is kept whole. A build with a project supervisor speaks
// through a supervisor, several builders, the validator and a repair, and
// passes 500 events on its own (automation-project-agents-plan, chat
// presentation), so until it ends its units are held to the larger
// `buildEventsCeiling`, and no newer unit drops them: ten runs heard from
// since never evict the build still working. A build (its subject id) is in
// progress while any unit of it has not sent its final event, and the current
// build is the one in progress heard from last, so a build Core never ended
// (a restart) is an ordinary unit once another starts. Once it ends it is one
// more unit, trimmed to the usual bound.
//
// Some rows are pinned: what the person asked (`request`) and each card of the
// supervisor's work (a `note` row with a `projectCard`: its plan, briefs,
// returns and receipts). A trim takes the oldest unpinned events first, so a
// 1,500-event build still shows the plan it was built from; only a unit of
// nothing but pinned rows past its bound loses some, its plan last.
//
// Left out: a pure status change (no `detail` and not final), a decision
// that has not been explained yet ("Deciding the next step", which has no
// text: the live line says it), and Core's own bookkeeping (`isInternalStep`).
// Kept in the order the relay accepted them, which is Core's order within a
// session and arrival order across a Core restart, when sequences begin again.
//
// It does not touch the pacer or the overlay: the paced display is made from
// every event, kept or not, exactly as before.

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { ACTIVITY_HISTORY_LIMITS } from "./history-limits.ts";
import { isInternalStep } from "./internal-step.ts";
import { projectCard } from "./project/index.ts";

type Kept = { order: number; event: ClientGatewayActivity; pin: Pin };

/** How a kept event is held: unpinned rows go first, the plan last. */
const PIN = { none: 0, row: 1, plan: 2 } as const;
type Pin = (typeof PIN)[keyof typeof PIN];

/** One unit's kept events and what it is part of. */
type Unit = { kept: Kept[]; build: string | undefined; ended: boolean };

/** The bounds, as `ACTIVITY_HISTORY_LIMITS` sets them; a build's ceiling defaults to that. */
export type UnitHistoryLimits = { units: number; eventsPerUnit: number; buildEventsCeiling?: number };

export class UnitHistory {
  /** Each unit's kept events; the unit heard from last is last. */
  private readonly units = new Map<string, Unit>();
  private order = 0;
  /** The build held whole at the last event, so it is trimmed once it no longer is. */
  private held: string | undefined;
  private flat: ClientGatewayActivity[] | undefined = [];

  constructor(private readonly limits: UnitHistoryLimits = ACTIVITY_HISTORY_LIMITS) {}

  /** Takes one accepted event. Returns whether it is part of the story. */
  accept(event: ClientGatewayActivity): boolean {
    if (!tellsTheStory(event)) return false;
    const unit = this.units.get(event.activityId) ?? { kept: [], build: buildOf(event), ended: false };
    this.units.delete(event.activityId);
    this.order += 1;
    unit.kept.push({ order: this.order, event, pin: pinOf(event) });
    if (event.final === true) unit.ended = true;
    this.units.set(event.activityId, unit);
    const current = this.currentBuild();
    trim(unit.kept, this.boundOf(unit, current));
    // A build no longer current (it ended, or another began) is one more unit: every unit of it is held to the usual bound again.
    if (this.held !== undefined && this.held !== current) {
      for (const other of this.units.values()) if (other.build === this.held) trim(other.kept, this.limits.eventsPerUnit);
    }
    this.held = current;
    this.evict(current);
    this.flat = undefined;
    return true;
  }

  /** The kept events of every unit, in the order they were accepted. */
  events(): ClientGatewayActivity[] {
    this.flat ??= [...this.units.values()].flatMap((unit) => unit.kept).sort((a, b) => a.order - b.order).map((entry) => entry.event);
    return [...this.flat];
  }

  /** The build in progress heard from last: some unit of it has not ended. Undefined when there is none. */
  private currentBuild(): string | undefined {
    const working = new Set<string>();
    for (const unit of this.units.values()) if (unit.build !== undefined && !unit.ended) working.add(unit.build);
    let current: string | undefined;
    for (const unit of this.units.values()) if (unit.build !== undefined && working.has(unit.build)) current = unit.build;
    return current;
  }

  private boundOf(unit: Unit, current: string | undefined): number {
    const ceiling = this.limits.buildEventsCeiling ?? this.limits.eventsPerUnit;
    return unit.build !== undefined && unit.build === current ? Math.max(ceiling, this.limits.eventsPerUnit) : this.limits.eventsPerUnit;
  }

  /** Drops the units heard from longest ago past the bound, never one of the current build. */
  private evict(current: string | undefined): void {
    for (const [activityId, unit] of this.units) {
      if (this.units.size <= this.limits.units) return;
      if (unit.build !== undefined && unit.build === current) continue;
      this.units.delete(activityId);
    }
  }
}

/** The build `event` is part of, by its subject; undefined for a run. */
function buildOf(event: ClientGatewayActivity): string | undefined {
  return event.subject.kind === "build" ? event.subject.id : undefined;
}

function pinOf(event: ClientGatewayActivity): Pin {
  const card = projectCard(event);
  if (card?.kind === "plan") return PIN.plan;
  if (card !== undefined) return PIN.row;
  return typeof event.request === "string" && event.request.trim() !== "" ? PIN.row : PIN.none;
}

/** Keeps at most `bound` of `kept`, dropping the oldest of the least-pinned first. */
function trim(kept: Kept[], bound: number): void {
  for (const pin of [PIN.none, PIN.row, PIN.plan]) {
    let over = kept.length - bound;
    if (over <= 0) return;
    for (let index = 0; index < kept.length && over > 0; ) {
      if (kept[index]!.pin === pin) {
        kept.splice(index, 1);
        over -= 1;
      } else index += 1;
    }
  }
}

function tellsTheStory(event: ClientGatewayActivity): boolean {
  // What the person asked the work, in their own words: the chat shows it as their message.
  if (typeof event.request === "string" && event.request.trim() !== "") return true;
  const detail = event.detail;
  if (detail === undefined) return event.final === true;
  if (isInternalStep(detail)) return false;
  if (detail.kind === "thought") return (detail.text?.trim() ?? "") !== "";
  return true;
}
