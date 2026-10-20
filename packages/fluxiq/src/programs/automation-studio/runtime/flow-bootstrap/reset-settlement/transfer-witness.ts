// A move of one item from one complete list to another, witnessed around the
// act itself (t719 review; moved out of `../site-reset/ledger.ts` with L1's settlement).
//
// A `modify_existing` press on an item of a complete original list that moved
// exactly that item into another original list of the same group, read just
// before and just after the act, with every other row, its order and its
// values surviving on both lists and their captured siblings, is a transfer:
// the one quantity-free inverse the ledger admits by subject (`target`), and
// both lists are witnesses of the act (`./group-witness.ts`). Only
// the immediate before/after evidence counts; no later read can make one.
// Pure.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioSiteResetCollection } from "./collection-groups.ts";
import type { AutomationStudioSiteResetOriginal } from "./observations.ts";
import type { AutomationStudioSiteResetSettlementSpot } from "./spot.ts";

/** The transfer an act made: from `origin` to `scope` in `group`, its `subject` arriving with row value `state`. */
export type AutomationStudioSiteResetTransfer = { origin: string; scope: string; group: string; subject: string; state: string };

export function automationStudioSiteResetTransferWitness(input: {
  consequences: readonly AutomationStudioActionConsequence[];
  spot: AutomationStudioSiteResetSettlementSpot | undefined;
  /** The complete lists read just before and just after the act (site-reset's `AutomationStudioSiteResetPlace["collections"]`). */
  witness: { before: readonly AutomationStudioSiteResetCollection[]; after: readonly AutomationStudioSiteResetCollection[] } | undefined;
  originals: ReadonlyMap<string, AutomationStudioSiteResetOriginal>;
  /** The act's 1-based place among its ledger's acts. */
  sequence: number;
}): AutomationStudioSiteResetTransfer | undefined {
  const { witness, spot, sequence } = input;
  if (!witness || input.consequences.length !== 1 || input.consequences[0] !== "modify_existing" || !spot?.scope || !spot.subject) return undefined;
  if ([...witness.before, ...witness.after].some((collection) => new Set(collection.subjects).size !== collection.subjects.length || Object.keys(collection.states).length !== collection.subjects.length || collection.subjects.some((subject) => typeof collection.states[subject] !== "string" || !collection.states[subject]))) return undefined;
  const subject = spot.subject;
  const origin = witness.before.find((collection) => collection.scope === spot.scope);
  const baseline = origin && input.originals.get(origin.scope);
  if (!origin || !baseline || baseline.beforeAct >= sequence || baseline.group !== origin.group || !baseline.subjects.has(subject) || !origin.subjects.includes(subject)) return undefined;
  const before = witness.before.filter((collection) => collection.group === origin.group);
  const after = witness.after.filter((collection) => collection.group === origin.group);
  if (new Set(before.map((collection) => collection.scope)).size !== before.length || new Set(after.map((collection) => collection.scope)).size !== after.length) return undefined;
  if (before.filter((collection) => collection.subjects.includes(subject)).length !== 1 || after.filter((collection) => collection.subjects.includes(subject)).length !== 1) return undefined;
  const destination = after.find((collection) => collection.scope !== origin.scope && collection.subjects.includes(subject));
  const destinationBefore = destination && before.find((collection) => collection.scope === destination.scope);
  const destinationBaseline = destination && input.originals.get(destination.scope);
  const originAfter = after.find((collection) => collection.scope === origin.scope);
  if (!destination || !destinationBefore || !destinationBaseline || destinationBaseline.group !== origin.group || destinationBaseline.beforeAct >= sequence || destinationBaseline.subjects.has(subject) || !originAfter || originAfter.subjects.includes(subject) || !destination.states[subject]) return undefined;
  // Other rows and their order must survive the effect, on both collections and captured siblings.
  if (before.length !== after.length || before.some((collection) => {
    const current = after.find((candidate) => candidate.scope === collection.scope);
    const expected = collection.subjects.filter((value) => value !== subject);
    const actual = current?.subjects.filter((value) => value !== subject);
    return !current || !actual || actual.length !== expected.length || expected.some((value, index) => actual[index] !== value || collection.states[value] !== current.states[value]);
  })) return undefined;
  return { origin: origin.scope, scope: destination.scope, group: origin.group, subject, state: destination.states[subject] };
}
