// The bounded `siteChange` packet a trial's judge sees (t775, design section
// 2). Pure.
//
// Group, scope, place, subject and state tokens are the domain's opaque
// handles and never reach the judge: a list side is its row count, a control
// side its counts under labels local to the witness ("state 1", "state 2", by
// token order, the same labels before and after), and a change is counts plus
// the domain's readable lines from the after reading. Every free text is cut to
// 200 characters, lines to 20 per side, witnesses, acts and acts left from
// earlier to fixed counts, and every cut is marked. A proof's `notRun` (t796,
// `./proof.ts`) keeps at most 10 steps, each label cut as any text and its
// passes to 60.

import { automationStudioTrialDelta } from "./delta.ts";
import type {
  AutomationStudioTrialActOutcome,
  AutomationStudioTrialLeftAct,
  AutomationStudioTrialPartProof,
  AutomationStudioTrialReading,
  AutomationStudioTrialSiteChange,
  AutomationStudioTrialSiteLines,
  AutomationStudioTrialSiteSide,
  AutomationStudioTrialSiteWitnessChange,
  AutomationStudioTrialWitness
} from "./contracts.ts";

const TEXT_CAP = 200;
const LINES_CAP = 20;
const WITNESSES_CAP = 30;
const ACTS_CAP = 60;
const LEFT_CAP = 20;
const NOT_RUN_CAP = 10;
const PASSES_CAP = 60;

type Witness = AutomationStudioTrialWitness;
type Reading = AutomationStudioTrialReading;

/** The judge's `siteChange` packet from a trial's witnesses, their before and after readings (by witness id), its acts, the acts of the build left in place at its start, and its parts' proofs (`none` proofs are left out). */
export function automationStudioTrialSiteChangePacket(input: {
  witnesses: readonly Witness[];
  readings: Readonly<Record<string, { before?: Reading | undefined; after?: Reading | undefined }>>;
  acts: readonly AutomationStudioTrialActOutcome[];
  leftFromEarlier?: readonly AutomationStudioTrialLeftAct[];
  proofs: readonly AutomationStudioTrialPartProof[];
}): AutomationStudioTrialSiteChange {
  const left = input.leftFromEarlier ?? [];
  const omitted = {
    ...(input.witnesses.length > WITNESSES_CAP ? { witnesses: input.witnesses.length - WITNESSES_CAP } : {}),
    ...(input.acts.length > ACTS_CAP ? { acts: input.acts.length - ACTS_CAP } : {}),
    ...(left.length > LEFT_CAP ? { leftFromEarlier: left.length - LEFT_CAP } : {})
  };
  const proofs: AutomationStudioTrialSiteChange["proofs"] = [];
  for (const { part, effect, proof, steps, notRun } of input.proofs) {
    if (!effect || proof === "none") continue;
    proofs.push({ part, effect: boundedEffect(effect), proof, steps: [...steps], ...(notRun?.length ? { notRun: notRun.slice(0, NOT_RUN_CAP).map(boundedNotRun) } : {}) });
  }
  return {
    witnesses: input.witnesses.slice(0, WITNESSES_CAP).map((witness) => witnessEntry(witness, input.readings[witness.id] ?? {})),
    acts: input.acts.slice(0, ACTS_CAP).map(({ step, pass, row, outcome, witness, parts }) => ({ step, ...(pass ? { pass: { number: pass.number, of: pass.of } } : {}), ...(row !== undefined ? { row: bounded(row) } : {}), outcome, ...(witness !== undefined ? { witness } : {}), parts: [...parts] })),
    leftFromEarlier: left.slice(0, LEFT_CAP).map(({ did, where }) => ({ did: bounded(did), ...(where !== undefined ? { where: bounded(where) } : {}) })),
    proofs,
    ...(Object.keys(omitted).length ? { omitted } : {})
  };
}

function witnessEntry(witness: Witness, readings: { before?: Reading | undefined; after?: Reading | undefined }): AutomationStudioTrialSiteChange["witnesses"][number] {
  const { before, after } = readings;
  const labels = witness.kind === "control" ? stateLabels(witness.place, [before, after]) : new Map<string, string>();
  return {
    id: witness.id,
    kind: witness.kind,
    ...(witness.where !== undefined ? { where: bounded(witness.where) } : {}),
    steps: [...witness.steps],
    parts: [...witness.parts],
    before: side(witness, before, labels),
    after: side(witness, after, labels),
    change: change(witness, before, after, labels)
  };
}

function side(witness: Witness, reading: Reading | undefined, labels: ReadonlyMap<string, string>): AutomationStudioTrialSiteSide {
  if (!reading) return "unread";
  if (witness.kind === "control") {
    if (!reading.controls) return "unread";
    return { source: reading.source, state: labelled(reading.controls[witness.place] ?? {}, labels) };
  }
  const own = (reading.collections ?? []).filter((collection) => collection.group === witness.group);
  if (!own.length) return "unread";
  return { source: reading.source, rows: new Set(own.flatMap((collection) => collection.subjects)).size };
}

function change(witness: Witness, before: Reading | undefined, after: Reading | undefined, labels: ReadonlyMap<string, string>): AutomationStudioTrialSiteWitnessChange {
  const delta = automationStudioTrialDelta(witness, before, after);
  if (delta.status === "unread") return "unread";
  const lines = readableLines(after?.lines);
  if (delta.status === "unchanged" && !lines) return "none";
  if (delta.kind === "list") return { added: delta.added.length, removed: delta.removed.length, changed: delta.changed.length, unchanged: delta.unchanged.length, ...(lines ? { lines } : {}) };
  return { from: labelled(delta.before, labels), to: labelled(delta.after, labels), ...(lines ? { lines } : {}) };
}

/** Labels for every state token the place showed on either side, by token order: the same token keeps one label before and after. */
function stateLabels(place: string, readings: ReadonlyArray<Reading | undefined>): Map<string, string> {
  const tokens = new Set<string>();
  for (const reading of readings) for (const token of Object.keys(reading?.controls?.[place] ?? {})) tokens.add(token);
  return new Map([...tokens].sort().map((token, index) => [token, `state ${index + 1}`]));
}

function labelled(counts: Readonly<Record<string, number>>, labels: ReadonlyMap<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [token, label] of labels) out[label] = counts[token] ?? 0;
  return out;
}

function readableLines(lines: Reading["lines"]): AutomationStudioTrialSiteLines | undefined {
  if (!lines || (!lines.gone.length && !lines.added.length)) return undefined;
  const cut = { gone: Math.max(0, lines.gone.length - LINES_CAP), added: Math.max(0, lines.added.length - LINES_CAP) };
  return { gone: lines.gone.slice(0, LINES_CAP).map(bounded), added: lines.added.slice(0, LINES_CAP).map(bounded), ...(cut.gone || cut.added ? { cut } : {}) };
}

function boundedEffect(effect: NonNullable<AutomationStudioTrialPartProof["effect"]>): NonNullable<AutomationStudioTrialPartProof["effect"]> {
  return effect.kind === "change" ? { kind: "change", direction: effect.direction, count: effect.count, what: bounded(effect.what) } : { kind: "end_state", state: bounded(effect.state) };
}

function boundedNotRun(entry: NonNullable<AutomationStudioTrialPartProof["notRun"]>[number]): NonNullable<AutomationStudioTrialPartProof["notRun"]>[number] {
  return { nodeId: entry.nodeId, label: bounded(entry.label), reason: entry.reason, ...(entry.after !== undefined ? { after: bounded(entry.after) } : {}), passes: entry.passes.slice(0, PASSES_CAP), ...(entry.of !== undefined ? { of: entry.of } : {}) };
}

function bounded(text: string): string {
  return text.length > TEXT_CAP ? `${text.slice(0, TEXT_CAP - 1)}…` : text;
}
