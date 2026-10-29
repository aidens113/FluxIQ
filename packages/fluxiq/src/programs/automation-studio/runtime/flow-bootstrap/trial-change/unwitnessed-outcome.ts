// What a trial's readings say of its steps with no witness (t791 fix 4,
// `./unwitnessed-steps.ts`). Pure.
//
// Core read no place where such a step's change shows, so its change is not
// in the packet. The packet says so under `unwitnessed`: each such step by its
// label and the trial steps it acted at (`ranAs`, numbered as the run's
// feedback and the packet's acts number them, matched by step definition as
// the session attributes acts: the plan's own numbering, which the admission
// uses, counts no start or subflow call), the task parts they serve, and in
// Core's words that the judge decides them by the run, its end view and each
// step's done-when check.
//
// A part such a step serves is `unproven` by what Core read, as a part with an
// unread witness is (`./proof.ts`): its change may be where nothing was read.
// So a `no_change` or `already_in_end_state` proof of that part, which only
// the places Core did read made, is said `unproven` instead, and its
// `result.change_not_seen` finding goes with it. `shown`, `carried`,
// `unproven` and `contradicted` stand: a place that went back to the build's
// start contradicts a part asking to add, whatever another step did.

import type { AutomationStudioTrialChangeAct, AutomationStudioTrialChangeFinding, AutomationStudioTrialChangeOutcome, AutomationStudioTrialChangeStep, AutomationStudioTrialSiteChange } from "./contracts.ts";

/** What the judge is told of the steps with no witness (header). Generic: it names no site. */
const SAID = "Core had no place to read for what these steps change on the site, so this packet shows no change of theirs: judge what they did by the run, its end view and each step's done-when check. "
  + "A part they serve is unproven by what Core read, which is neither a yes nor a no for it.";
const STEPS_CAP = 20;
const TEXT_CAP = 200;
/** The proofs only the places Core read made, which a step with no witness leaves open (header). */
const OPEN: ReadonlySet<string> = new Set(["no_change", "already_in_end_state"]);

/** The packet's note of the steps with no witness (header): each by its label and the trial steps it acted at. */
export type AutomationStudioTrialSiteChangeUnwitnessed = { steps: Array<{ label?: string; ranAs: number[] }>; parts: string[]; said: string; omitted?: number };

/**
 * `outcome` with the gap its steps with no witness leave said, and their parts' proofs left open (header); as it is when
 * `unwitnessed` (plan step numbers, as the admission numbers them) names no step of `steps`. `acts` are the trial's, as its
 * port reported them.
 */
export function automationStudioTrialChangeUnwitnessedOutcome(
  outcome: AutomationStudioTrialChangeOutcome,
  gap: { steps: readonly Pick<AutomationStudioTrialChangeStep, "step" | "definitionId" | "label" | "parts">[]; unwitnessed: readonly number[]; acts: readonly Pick<AutomationStudioTrialChangeAct, "step" | "definitionId">[] }
): { siteChange: AutomationStudioTrialSiteChange & { unwitnessed?: AutomationStudioTrialSiteChangeUnwitnessed }; findings: AutomationStudioTrialChangeFinding[] } {
  const steps = gap.steps.filter((step) => gap.unwitnessed.includes(step.step));
  if (!steps.length) return { siteChange: outcome.siteChange, findings: [...outcome.findings] };
  const parts = [...new Set(steps.flatMap((step) => step.parts))];
  const opened = new Set(outcome.siteChange.proofs.filter((proof) => parts.includes(proof.part) && OPEN.has(proof.proof)).map((proof) => proof.part));
  const proofs = outcome.siteChange.proofs.map((proof) => (opened.has(proof.part) ? { ...proof, proof: "unproven" as const } : proof));
  const findings = outcome.findings.filter((finding) => !(finding.code === "result.change_not_seen" && opened.has(finding.part)));
  const unwitnessed: AutomationStudioTrialSiteChangeUnwitnessed = {
    steps: steps.slice(0, STEPS_CAP).map(({ definitionId, label }) => ({ ...(label !== undefined ? { label: bounded(label) } : {}), ranAs: [...new Set(gap.acts.filter((act) => act.definitionId === definitionId).map((act) => act.step))].sort((left, right) => left - right) })),
    parts,
    said: SAID,
    ...(steps.length > STEPS_CAP ? { omitted: steps.length - STEPS_CAP } : {})
  };
  return { siteChange: { ...outcome.siteChange, proofs, unwitnessed }, findings };
}

function bounded(text: string): string {
  return text.length > TEXT_CAP ? `${text.slice(0, TEXT_CAP - 1)}…` : text;
}
