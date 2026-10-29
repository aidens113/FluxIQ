// A trial whose own change contradicts a part is never a pass (t787 fix 4).
//
// A part asking to add is `contradicted` when the trial put one of its
// controls back to how this build found it (`./proof.ts`): it took away what an
// earlier act of the build had added. A downstream live run had a looped
// press flip three items, one of them back, and its judges said yes. Whatever the judges answer, a trial gate
// that reads such a change takes no yes from it: both gates
// (`../candidate/trial-gate.ts`, `../subflow-candidate/subflow-trial-gate.ts`)
// hand each answer here with the outcome their own session finished with, and
// a yes it contradicts comes back a no, with Core's words beside its feedback
// as `changeContradicted`; any other answer comes back as it went. Every word
// here is generic: the parts by their ids, the places by where Core read them,
// the acts by step and pass. Pure.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioTrialChangeOutcome } from "./contracts.ts";

/** What a contradicted trial says (header). */
const WORDS = {
  said: (parts: readonly string[], places: number, acts: readonly string[]): string =>
    `Core read what this trial changed on the site, and it contradicts a yes: ${parts.length === 1 ? `part "${parts[0]}" asks` : `parts ${parts.map((part) => `"${part}"`).join(", ")} ask`} to add, and the trial put ${places === 1 ? "a control" : `${places} controls`} back to how this build found ${places === 1 ? "it" : "them"}, taking away what an earlier act of this build had added${acts.length ? ` (${acts.join("; ")})` : ""}. `
    + "So this revision does not pass, whatever the judges answered. A step that switches a control on every pass switches back one that already shows the state asked for: make it leave such a control as it is."
} as const;

/** The most places and acts named; the rest are counted. */
const CAP = 10;

/** A trial gate's answer as it keeps it (header): a yes the outcome its session finished with contradicts, as a no with `changeContradicted` beside its feedback; any other answer unchanged. */
export function automationStudioTrialChangeContradictedNo<A extends { verdict: string; feedback: JsonObject }>(answer: A, outcome: AutomationStudioTrialChangeOutcome | undefined): A {
  const contradicted = answer.verdict === "yes" ? contradiction(outcome) : undefined;
  return contradicted ? { ...answer, verdict: "no", feedback: { ...answer.feedback, changeContradicted: contradicted } } as A : answer;
}

/** What contradicts the trial's yes (header); none when nothing does. */
function contradiction(outcome: AutomationStudioTrialChangeOutcome | undefined): JsonObject | undefined {
  const found = (outcome?.findings ?? []).flatMap((finding) => (finding.code === "result.change_contradicted" ? [finding] : []));
  const proved = (outcome?.siteChange.proofs ?? []).filter((proof) => proof.proof === "contradicted").map((proof) => proof.part);
  const parts = [...new Set([...proved, ...found.map((finding) => finding.part)])];
  if (!parts.length || !outcome) return undefined;
  const ids = [...new Set(found.map((finding) => finding.witness))];
  const places = ids.map((id) => outcome.siteChange.witnesses.find((witness) => witness.id === id)).flatMap((witness) => (witness ? [{ witness: witness.id, ...(witness.where !== undefined ? { where: witness.where } : {}), steps: [...witness.steps] }] : []));
  const acts = outcome.siteChange.acts.filter((act) => act.outcome === "changed" && act.witness !== undefined && ids.includes(act.witness)).map((act) => `trial step ${act.step}${act.pass ? `, pass ${act.pass.number} of ${act.pass.of}` : ""}`);
  return {
    code: "trial.change_contradicted",
    parts,
    places: places.slice(0, CAP),
    ...(places.length > CAP ? { morePlaces: places.length - CAP } : {}),
    said: WORDS.said(parts, Math.max(1, places.length), acts.slice(0, CAP))
  };
}
