import type { AutomationStudioProjectStructurePlan, AutomationStudioProjectSubflowBrief, AutomationStudioProjectTaskSpec } from "../contracts/index.ts";
import { automationStudioProjectSupervisorInterfaceChange } from "./interface-change.ts";
import { automationStudioProjectSupervisorPartChange } from "./part-change.ts";

/**
 * What the plan in force changed for one subflow against the plan a done
 * proposal of it was built under (`./carried-proposals.ts`): what changed in
 * words (`why`, empty when nothing did); the parts it only reworded; each part
 * it was built for that changed, with what (`changedParts`, t671); and, when what changed can be carried onto its next
 * build brief, what that brief must add to it (`carry`, t658, t671).
 */
export type AutomationStudioProjectSupervisorSubflowChange = {
  why: string[];
  reworded: string[];
  changedParts: Array<{ part: string; what: string }>;
  carry?: { addedParts: string[]; renamedOutputs: Array<{ from: string; to: string }>; removedOutputs: string[] };
};

/** The reasons a change a carried proposal can follow gives: its parts, its facts, its outputs (t658, t671). */
const CARRIED_REASONS: ReadonlySet<string> = new Set(["its inputs or outputs changed", "its parts changed", "its facts changed"]);

/** What a part a proposal was built for may have become and the proposal still be carried: its id and words kept (`./part-change.ts`, t671). */
const CARRIED_PARTS: ReadonlySet<string> = new Set(["same", "reworded", "facts", "acts"]);

/**
 * Compares subflow `key` under `now` with the plan `brief` was built under
 * (`then`, with the task specs of both and the `after` the plan in force gives
 * it). Its role, interface, success check, parts and what runs before it are
 * each compared; "its parts changed" says only that its part ids differ or one
 * of them changed its own lasting acts, source or words beyond a rewording
 * (t671: a subflow whose parts are each the same, reworded or with new facts
 * never reports it). A change is carried (`carry`) when it is only parts added
 * beside every part the proposal was built for -- each of those keeping its id
 * and words, the same, reworded, or with its facts or lasting acts changed --
 * and outputs added, renamed or removed (t658, t671), with the same inputs,
 * role, success check and `after`, and every output removed one no subflow of
 * the plan in force takes.
 *
 * **A part's facts or lasting acts changed carries, not drops (Lab
 * `run-mvan7giv` step 0055, supervisor decision, t671).** t595 dropped such a
 * proposal, since its trial was judged against the old facts. It was still
 * the best place to start: that run rewrote a part's lasting act and facts
 * while the steps it asked stayed the same, and the drop cost a rebuild from
 * the start page. A carried proposal is not done: its next build brief's scope
 * check holds it to the new lasting acts and its trial judges the new facts.
 */
export function automationStudioProjectSupervisorSubflowChange(input: {
  key: string;
  brief: AutomationStudioProjectSubflowBrief;
  now: AutomationStudioProjectStructurePlan;
  then: AutomationStudioProjectStructurePlan | undefined;
  specNow: AutomationStudioProjectTaskSpec | undefined;
  specThen: AutomationStudioProjectTaskSpec | undefined;
  after: readonly string[] | undefined;
}): AutomationStudioProjectSupervisorSubflowChange {
  const { key, brief, now, then, specNow, specThen } = input;
  const ours = now.plan.subflows.find((subflow) => subflow.key === key);
  if (!ours) return { why: ["it is no longer in the plan"], reworded: [], changedParts: [] };
  const theirs = then?.plan.subflows.find((subflow) => subflow.key === key);
  if (!then || !theirs || !specNow || !specThen) return { why: ["the plan it was built under is not known to this run"], reworded: [], changedParts: [] };
  const changed: string[] = [];
  if (ours.role !== theirs.role) changed.push("its role changed");
  if (!same(ours.interface, theirs.interface)) changed.push("its inputs or outputs changed");
  // An input taken away is one the proposal reads: a done proposal reads every input it declares (t581).
  const kept = new Set((ours.interface?.inputs ?? []).map((port) => port.id));
  for (const port of theirs.interface?.inputs ?? []) if (ours.interface && !kept.has(port.id)) changed.push(`its steps read the input "${port.id}", which the plan no longer gives it`);
  if (!same(ours.metadata?.["fluxiq.successCheck"], theirs.metadata?.["fluxiq.successCheck"])) changed.push("its success check changed");
  const partsNow = [...(now.partOf[key] ?? [])].sort();
  const partsThen = [...(then.partOf[key] ?? [])].sort();
  const compared = new Map(partsNow.map((id) => [id, automationStudioProjectSupervisorPartChange(specNow, specThen, id)] as const));
  if (!same(partsNow, partsThen) || [...compared.values()].some((found) => found.change === "changed" || found.change === "acts")) changed.push("its parts changed");
  else if ([...compared.values()].some((found) => found.change === "facts")) changed.push("its facts changed");
  if (!input.after) changed.push("what runs before it is not known to this run");
  else if (!same([...new Set(input.after)].sort(), [...new Set(brief.entry.predecessors)].sort())) changed.push("what runs before it changed");
  const reworded = [...compared].filter(([, found]) => found.change === "reworded").map(([id]) => id);
  const changedParts = partsThen.flatMap((id) => {
    const found = compared.get(id);
    return found?.what ? [{ part: id, what: found.what }] : [];
  });
  const keepsItsParts = partsThen.every((id) => CARRIED_PARTS.has(compared.get(id)?.change ?? "changed"));
  const outputs = changed.every((why) => CARRIED_REASONS.has(why)) && keepsItsParts ? automationStudioProjectSupervisorInterfaceChange(theirs.interface, ours.interface) : undefined;
  // An output removed that a subflow of the plan in force still takes is lost, not narrowed: that subflow waits on it.
  const wanted = outputs?.removedOutputs.filter((output) => now.plan.subflows.some((subflow) => subflow.interface?.inputs.some((port) => port.id === output))) ?? [];
  for (const output of wanted) changed.push(`it no longer hands on "${output}", which a subflow of the plan still takes`);
  if (!changed.length || !outputs || wanted.length) return { why: changed, reworded, changedParts };
  return { why: changed, reworded, changedParts, carry: { addedParts: partsNow.filter((id) => !partsThen.includes(id)), ...outputs } };
}

/** Whether two plain values hold the same JSON. */
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
