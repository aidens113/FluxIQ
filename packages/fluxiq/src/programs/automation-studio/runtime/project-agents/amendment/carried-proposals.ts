import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectStructurePlan, AutomationStudioProjectSubflowBrief, AutomationStudioProjectTaskSpec } from "../contracts/index.ts";
import { automationStudioProjectSupervisorMergedInto } from "./merged-into.ts";
import { automationStudioProjectSupervisorSubflowChange, type AutomationStudioProjectSupervisorSubflowChange } from "./subflow-change.ts";

/** A brief and the return that answered it. */
export type AutomationStudioProjectSupervisorAnswered = { brief: AutomationStudioProjectSubflowBrief; returned: AutomationStudioProjectBuilderReturn };

/**
 * What the plan in force did with the done proposals made under earlier plans
 * (t590): each it keeps, by subflow key, and each it drops, with what changed.
 */
export type AutomationStudioProjectSupervisorCarried = {
  kept: ReadonlyMap<string, AutomationStudioProjectSupervisorAnswered>;
  dropped: ReadonlyMap<string, readonly string[]>;
  /** Each kept subflow whose parts the amendment only reworded, with those part ids (t595). */
  reworded: ReadonlyMap<string, readonly string[]>;
  /** Each subflow a proposal was carried onto, by the key it has under the plan in force, never done on it (t658, t671). */
  forward: ReadonlyMap<string, AutomationStudioProjectSupervisorCarriedForward>;
  /** Each dropped subflow's parts whose own lasting acts, words or facts changed, with what (t671). */
  changedParts: ReadonlyMap<string, ReadonlyArray<{ part: string; what: string }>>;
};

/**
 * A done proposal an amendment carried (t658, t671): its brief and return,
 * what changed in words, the parts it was not built for, each output the
 * amendment renamed and each it removed, the subflow it was built for when it
 * was merged into another (`absorbed`), and one sentence saying why it was
 * carried (`because`).
 */
export type AutomationStudioProjectSupervisorCarriedForward = {
  answered: AutomationStudioProjectSupervisorAnswered;
  why: readonly string[];
  addedParts: readonly string[];
  renamedOutputs: ReadonlyArray<{ from: string; to: string }>;
  removedOutputs: readonly string[];
  /** Each part it was built for whose facts or lasting acts the amendment changed, with what: its next trial judges them (t671). */
  changedParts: ReadonlyArray<{ part: string; what: string }>;
  /** Set when the amendment merged subflows (t671): the one the proposal was built for, the others whose parts it now holds, and whether it became the one the router runs. */
  absorbed?: { builtFor: string; partsFrom: readonly string[]; routerRun: boolean };
  because: string;
};

/**
 * Which earlier plans' latest done proposals (`earlier`, by subflow key) the
 * plan in force keeps, which it carries, and what changed for each it drops.
 *
 * **Kept (t590, t595).** A subflow with the same key, role, interface, success
 * check, parts -- each the same or only reworded -- and `after`, every subflow
 * it runs after kept too, however far down the chain.
 *
 * **Carried on its own key (t658, t671).** Only parts added beside every part
 * it was built for -- each of those keeping its id and words, its facts or
 * lasting acts perhaps changed, which t595 dropped (supervisor decision,
 * t671) -- and outputs added, renamed or removed, with its inputs,
 * role, success check and `after` as they were (`./subflow-change.ts`). A
 * removed output is a narrowing (Lab `run-mvan7giv`, steps 0055: an output no
 * subflow took any more). It is carried rather than kept done: Core holds a
 * proposal only as its builder submitted it, through the scope check that
 * fixes its interface, and assembly puts that subflow in the Flow as
 * submitted (`../supervisor/assembly.ts`), so a proposal kept done would hand
 * on the removed output still. Its next build brief starts from its script
 * with that output's line taken out (`../dispatch/run-brief.ts`), submits it
 * through the scope check, and tests it. A removed input
 * is never a narrowing: a done proposal reads every input it declares (t581).
 *
 * **Carried onto the subflow it was merged into (Lab `run-mvan7giv`, steps
 * 0099, t671).** When the plan in force merges a done subflow into another,
 * or renames it, its proposal is carried onto the subflow that now holds its
 * parts (`./merged-into.ts`), its role, inputs and outputs as that rule
 * allows. When several proposals were merged into one subflow, the one built
 * for the most parts is carried, its own key's first; the others are dropped,
 * each saying which was carried instead, since a build brief starts from one.
 *
 * Anything else drops it. A carried subflow is not kept, so what runs after it
 * is dropped, as after any not kept.
 */
export function automationStudioProjectSupervisorCarriedProposals(input: {
  structure: AutomationStudioProjectStructurePlan;
  plans: ReadonlyMap<string, AutomationStudioProjectStructurePlan>;
  specs: ReadonlyMap<string, AutomationStudioProjectTaskSpec>;
  after: Readonly<Record<string, string[]>>;
  earlier: ReadonlyMap<string, AutomationStudioProjectSupervisorAnswered>;
  /** The subflows with a done proposal under the plan in force. */
  current: ReadonlySet<string>;
}): AutomationStudioProjectSupervisorCarried {
  const { structure: now, plans, specs, earlier } = input;
  const specNow = specs.get(now.taskSpecDigest);
  const compared = new Map<string, AutomationStudioProjectSupervisorSubflowChange>([...earlier].map(([key, answered]) => {
    const then = plans.get(answered.brief.planDigest);
    return [key, automationStudioProjectSupervisorSubflowChange({ key, brief: answered.brief, now, then, specNow, specThen: then ? specs.get(then.taskSpecDigest) : undefined, after: input.after[key] })];
  }));
  const changed = new Map([...compared].map(([key, found]) => [key, found.why]));
  // A subflow that runs after one that is not kept is not kept either, however far down the chain.
  for (let moved = true; moved;) {
    moved = false;
    for (const [key, answered] of earlier) {
      if (changed.get(key)!.length) continue;
      const lost = answered.brief.entry.predecessors.filter((predecessor) => changed.get(predecessor)?.length !== 0);
      if (!lost.length) continue;
      changed.set(key, lost.map((predecessor) => `it runs after "${predecessor}", which is not kept`));
      moved = true;
    }
  }
  const kept = new Map<string, AutomationStudioProjectSupervisorAnswered>();
  const dropped = new Map<string, readonly string[]>();
  const reworded = new Map<string, readonly string[]>();
  const changedParts = new Map<string, ReadonlyArray<{ part: string; what: string }>>();
  // Every proposal that could be carried, by the subflow it would be carried onto.
  const offered = new Map<string, Array<{ key: string; carried: AutomationStudioProjectSupervisorCarriedForward }>>();
  const offer = (onto: string, key: string, carried: AutomationStudioProjectSupervisorCarriedForward) => offered.set(onto, [...(offered.get(onto) ?? []), { key, carried }]);
  for (const [key, answered] of earlier) {
    const why = changed.get(key)!;
    const found = compared.get(key)!;
    if (!why.length) {
      kept.set(key, answered);
      if (found.reworded.length) reworded.set(key, found.reworded);
      continue;
    }
    if (found.carry) {
      offer(key, key, { answered, why: [...why], ...structuredClone(found.carry), changedParts: structuredClone(found.changedParts), because: ownKeyBecause(answered, found.carry, found.changedParts) });
      continue;
    }
    const then = plans.get(answered.brief.planDigest);
    const specThen = then ? specs.get(then.taskSpecDigest) : undefined;
    const merged = then && specNow && specThen ? automationStudioProjectSupervisorMergedInto({ key, now, then, specNow, specThen, taken: input.current }) : undefined;
    if (merged) {
      offer(merged.into, key, {
        answered, why: [...why], addedParts: merged.addedParts, renamedOutputs: [], removedOutputs: merged.removedOutputs, changedParts: merged.changedParts,
        absorbed: { builtFor: key, partsFrom: merged.mergedWith, routerRun: merged.routerRun }, because: mergedBecause(key, answered, merged)
      });
      continue;
    }
    dropped.set(key, why);
    if (found.changedParts.length) changedParts.set(key, found.changedParts);
  }
  const forward = new Map<string, AutomationStudioProjectSupervisorCarriedForward>();
  for (const [onto, offers] of offered) {
    // The proposal built for the most parts is carried, the subflow's own first (header).
    const ranked = [...offers].sort((left, right) => right.carried.answered.brief.parts.length - left.carried.answered.brief.parts.length || Number(right.key === onto) - Number(left.key === onto));
    const [chosen, ...others] = ranked;
    forward.set(onto, chosen!.carried);
    for (const other of others) dropped.set(other.key, [...other.carried.why, `its parts are now in "${onto}", whose next build brief starts from the proposal built for "${chosen!.key}" instead`]);
  }
  return { kept, dropped, reworded, forward, changedParts };
}

/** Why a proposal was carried on its own key (header), in one sentence. */
function ownKeyBecause(answered: AutomationStudioProjectSupervisorAnswered, carry: NonNullable<AutomationStudioProjectSupervisorSubflowChange["carry"]>, changedParts: AutomationStudioProjectSupervisorSubflowChange["changedParts"]): string {
  const did = [
    ...changedParts.map((entry) => `changed the part "${entry.part}" (${entry.what}), which its next trial judges again`),
    ...(carry.addedParts.length ? [`gave it the parts ${quoted(carry.addedParts)}`] : []),
    ...(carry.renamedOutputs.length ? [`renamed its outputs ${carry.renamedOutputs.map((pair) => `"${pair.from}" to "${pair.to}"`).join(", ")}`] : []),
    ...(carry.removedOutputs.length ? [`removed its outputs ${quoted(carry.removedOutputs)}, which its script is shown without`] : [])
  ];
  return `Its proposal was built for every part it still has (${quoted(answered.brief.parts)}), each keeping its id and words, and the amendment only ${joined(did)}.`;
}

/** Why a proposal was carried onto the subflow it was merged into (header), in one sentence. */
function mergedBecause(key: string, answered: AutomationStudioProjectSupervisorAnswered, merged: NonNullable<ReturnType<typeof automationStudioProjectSupervisorMergedInto>>): string {
  const where = merged.into === key ? `"${key}" now also holds` : `"${merged.into}" now holds the parts "${key}" was built for (${quoted(answered.brief.parts)})${merged.addedParts.length ? ", and" : ""}`;
  const added = merged.addedParts.length ? ` ${merged.mergedWith.length ? `the parts of ${quoted(merged.mergedWith)}` : "the parts"} ${quoted(merged.addedParts)}` : "";
  const role = merged.routerRun ? "; it is now the subflow the router runs, so its script is shown as the router's own steps, without inputs or outputs" : "";
  const changed = merged.changedParts.map((entry) => `; the part "${entry.part}" changed (${entry.what}), which its next trial judges again`).join("");
  const removed = merged.removedOutputs.length ? `; no subflow takes its outputs ${quoted(merged.removedOutputs)} any more, so its script is shown without them` : "";
  return `${where}${added}, each part it was built for keeping its id and words${changed}${role}${removed}.`;
}

/** Ids as said in an answer: each quoted, joined with commas. */
function quoted(ids: readonly string[]): string {
  return ids.map((id) => `"${id}"`).join(", ");
}

/** Clauses joined as a sentence: "a", "a and b", "a, b and c". */
function joined(clauses: readonly string[]): string {
  return clauses.length > 1 ? `${clauses.slice(0, -1).join(", ")} and ${clauses.at(-1)}` : clauses[0] ?? "changed nothing it was judged on";
}
