// The witnesses of a live trial (t775 D1): where each lasting step's change
// shows, resolved from its node's witness stamp through the build's ledger.
//
// A lasting step (one declaring create_new, modify_existing or delete) carries
// the stamp Core's admission gave it at submission; the ledger resolves it
// (`places`): a destination ref to its list group and where that list was
// read, a control receipt to its place and page, a repeated explored act to
// that act's lists and control. Steps that name the same list group or the
// same control place share one witness. A witness's `steps` start empty: the
// trial's own acts are attributed to it when they are known (`./session.ts`),
// so a list that changed with no act of the trial at it is said unasked. Pure,
// given the port.

import type { AutomationStudioTrialChangeLedgerPort, AutomationStudioTrialChangeStep, AutomationStudioTrialWitness, AutomationStudioTrialWitnessPlace, AutomationStudioTrialWitnessSet } from "./contracts.ts";

/** The classes whose change a witness shows. */
const LASTING: ReadonlySet<string> = new Set(["create_new", "modify_existing", "delete"]);

/** The trial's witnesses from its steps (header); none for a trial with no witnessed lasting step. */
export function automationStudioTrialWitnesses(steps: readonly AutomationStudioTrialChangeStep[], port: Pick<AutomationStudioTrialChangeLedgerPort, "places">): AutomationStudioTrialWitnessSet {
  const set: AutomationStudioTrialWitnessSet = { witnesses: [], places: {}, byStamp: {}, byDefinition: {} };
  const ids = new Map<string, string>();
  for (const step of steps) {
    const definition = set.byDefinition[step.definitionId] ??= { witnesses: [], parts: [] };
    for (const part of step.parts) if (!definition.parts.includes(part)) definition.parts.push(part);
    if (!step.consequences.some((consequence) => LASTING.has(consequence)) || step.witness === undefined) continue;
    const stamp = JSON.stringify(step.witness);
    for (const place of port.places(step.witness)) {
      const key = placeKey(place);
      let id = ids.get(key);
      if (id === undefined) {
        id = `w${ids.size + 1}`;
        ids.set(key, id);
        const witness: AutomationStudioTrialWitness = place.kind === "list"
          ? { id, kind: "list", group: place.group, steps: [], parts: [] }
          : { id, kind: "control", place: place.place, steps: [], parts: [] };
        if (place.location !== undefined) witness.where = place.location;
        set.witnesses.push(witness);
        set.places[id] = { ...place };
      }
      const witness = set.witnesses.find((entry) => entry.id === id)!;
      for (const part of step.parts) if (!witness.parts.includes(part)) witness.parts.push(part);
      const byStamp = set.byStamp[stamp] ??= [];
      if (!byStamp.includes(id)) byStamp.push(id);
      if (!definition.witnesses.includes(id)) definition.witnesses.push(id);
    }
  }
  return set;
}

/** One key per list group or control place. */
function placeKey(place: AutomationStudioTrialWitnessPlace): string {
  return place.kind === "list" ? `list\0${place.group}` : `control\0${place.place}`;
}
