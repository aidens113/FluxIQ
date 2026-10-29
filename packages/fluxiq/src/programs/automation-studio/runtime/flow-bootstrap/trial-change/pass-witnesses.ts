// The trial's acts attributed to its witnesses, each pass of a looped lasting
// step at its own item (t787 fix 4). Pure.
//
// The witnesses a trial reads before it runs come from its steps' stamps
// (`./witnesses.ts`): one control place per step. A step that ran in N passes
// of a loop acted at N items, and the stamp names one of them at most, so all
// N passes were attributed to it: a downstream live run put three passes at the
// first item while the second pass took back an earlier trial's change, at a
// place no witness covered.
//
// - **A landed act of a lasting step whose own diff read its control**
//   (`control`, `./acts.ts`) is attributed to the control witness at that place: the stamp's own where
//   the place is the same, else one witness per place, made here, at the act's
//   page location, serving its step's parts. A witness made here is read by
//   the diffs of the acts at it: before by the first act's `before`, after by
//   the last act's `after` (`step_diff`). A stamp's witness keeps the readings
//   the trial took of it, a side it could not read taken from those diffs too.
// - **Any other act** -- one already in its asked state, a landed act whose
//   diff did not name its control, or one of a step that declares no lasting
//   class (choosing an option before the lasting confirm changes no site
//   state a part is judged on) -- is attributed as before: to the witnesses
//   its stamp names, else to those of its step's definition.

import type { AutomationStudioTrialChangeMadeAct, AutomationStudioTrialReading, AutomationStudioTrialWitness, AutomationStudioTrialWitnessSet } from "./contracts.ts";

/** Both sides of one witness's readings, by witness id. */
type Readings = Record<string, { before?: AutomationStudioTrialReading; after?: AutomationStudioTrialReading }>;

/** The trial's witnesses with every act attributed (header): the stamps' witnesses first, then one per further place an act acted at; their readings; and each act's witness ids, in the order of `acts`. */
export function automationStudioTrialPassWitnesses(input: {
  set: Pick<AutomationStudioTrialWitnessSet, "witnesses" | "byStamp" | "byDefinition">;
  readings: Readonly<Readings>;
  acts: readonly AutomationStudioTrialChangeMadeAct[];
  /** The trial's steps that declare no lasting class: their acts' diffs never make or read a witness. */
  passive?: ReadonlySet<number> | undefined;
}): { witnesses: AutomationStudioTrialWitness[]; readings: Readings; attributed: string[][] } {
  const witnesses = input.set.witnesses.map((witness) => ({ ...witness, steps: [] as number[], parts: [...witness.parts] }));
  const readings: Readings = Object.fromEntries(Object.entries(input.readings).map(([id, sides]) => [id, { ...sides }]));
  const atPlace = new Map(witnesses.flatMap((witness) => (witness.kind === "control" ? [[witness.place, witness.id] as const] : [])));
  /** Witness sides read by the acts' diffs, which a later act at the same place reads again. */
  const byDiff = new Set<string>();
  const attributed = input.acts.map((act) => {
    const definition = input.set.byDefinition[act.definitionId];
    const control = act.outcome === "changed" && !input.passive?.has(act.step) ? act.control : undefined;
    const ids = control
      ? [atPlace.get(control.place) ?? made(witnesses, readings, atPlace, control.place, control.location)]
      : (act.witness !== undefined ? input.set.byStamp[JSON.stringify(act.witness)] : undefined) ?? definition?.witnesses ?? [];
    for (const witness of witnesses) {
      if (!ids.includes(witness.id)) continue;
      if (!witness.steps.includes(act.step)) witness.steps.push(act.step);
      if (control) for (const part of definition?.parts ?? []) if (!witness.parts.includes(part)) witness.parts.push(part);
    }
    if (control) {
      const sides = readings[ids[0]!] ??= {};
      const read = (counts: Record<string, number>): AutomationStudioTrialReading => ({ source: "step_diff", ...(control.location !== undefined ? { location: control.location } : {}), controls: { [control.place]: { ...counts } } });
      if (!sides.before) sides.before = read(control.before);
      if (!sides.after || byDiff.has(ids[0]!)) {
        sides.after = read(control.after);
        byDiff.add(ids[0]!);
      }
    }
    return [...ids];
  });
  for (const witness of witnesses) witness.steps.sort((left, right) => left - right);
  return { witnesses, readings, attributed };
}

/** A control witness at a place no other witness of the trial covers, at the acting page's location (header). */
function made(witnesses: AutomationStudioTrialWitness[], readings: Readings, atPlace: Map<string, string>, place: string, location: string | undefined): string {
  const id = `w${witnesses.length + 1}`;
  witnesses.push({ id, kind: "control", place, ...(location !== undefined ? { where: location } : {}), steps: [], parts: [] });
  readings[id] = {};
  atPlace.set(place, id);
  return id;
}
