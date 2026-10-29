// The readings of a trial that runs steps with no witness (t791 fix 4,
// `./unwitnessed-steps.ts`).
//
// Its finish is the trial's own session's (`./session.ts`), with the gap said
// (`./unwitnessed-outcome.ts`). Where the trial has no session -- no step has
// a witness and nothing of the build is on the site, so there is no change to
// read -- the judge is still told what Core could not read: the packet carries
// the trial's acts, no witness, each typed part `unproven` (`./proof.ts`, a
// part with no witness), and the gap.

import type { AutomationStudioTrialActOutcome, AutomationStudioTrialChangeAct, AutomationStudioTrialChangePart, AutomationStudioTrialChangeSession, AutomationStudioTrialChangeStep, AutomationStudioTrialLeftAct } from "./contracts.ts";
import { automationStudioTrialChangeFindings } from "./findings.ts";
import { automationStudioTrialSiteChangePacket } from "./packet.ts";
import { automationStudioTrialPartProof } from "./proof.ts";
import { automationStudioTrialChangeUnwitnessedOutcome } from "./unwitnessed-outcome.ts";

/** `session` (or, without one, a session of no readings) whose finish says the gap its steps with no witness leave (header). */
export function automationStudioTrialChangeUnwitnessedSession(input: {
  session: AutomationStudioTrialChangeSession | undefined;
  steps: readonly AutomationStudioTrialChangeStep[];
  parts: readonly AutomationStudioTrialChangePart[];
  /** The numbers of the trial's steps with no witness. */
  unwitnessed: readonly number[];
  /** This build's acts on the site as the trial starts, for a trial with no session. */
  leftFromEarlier: () => AutomationStudioTrialLeftAct[];
}): AutomationStudioTrialChangeSession {
  const { session, steps, parts, unwitnessed } = input;
  const left = session ? [] : input.leftFromEarlier();
  return {
    async finish(acts, signal) {
      const outcome = session ? await session.finish(acts, signal) : unread(acts, steps, parts, left);
      return automationStudioTrialChangeUnwitnessedOutcome(outcome, { steps, unwitnessed, acts });
    }
  };
}

/** A trial's change where Core read nothing (header): its acts, each with the parts its step definition serves, and each part's proof from no witness. */
function unread(acts: readonly AutomationStudioTrialChangeAct[], steps: readonly AutomationStudioTrialChangeStep[], parts: readonly AutomationStudioTrialChangePart[], left: readonly AutomationStudioTrialLeftAct[]) {
  const served = (definitionId: string): string[] => [...new Set(steps.filter((step) => step.definitionId === definitionId).flatMap((step) => step.parts))];
  const outcomes: AutomationStudioTrialActOutcome[] = acts.map((act) => ({ step: act.step, ...(act.pass ? { pass: act.pass } : {}), ...(act.row !== undefined ? { row: act.row } : {}), outcome: act.outcome, parts: served(act.definitionId) }));
  const proofs = parts.map((part) => automationStudioTrialPartProof({ part, deltas: [], acts: outcomes, carried: false }));
  const findings = automationStudioTrialChangeFindings({ witnesses: [], deltas: [], acts: outcomes, proofs });
  return { siteChange: automationStudioTrialSiteChangePacket({ witnesses: [], readings: {}, acts: outcomes, leftFromEarlier: left, proofs }), findings };
}
