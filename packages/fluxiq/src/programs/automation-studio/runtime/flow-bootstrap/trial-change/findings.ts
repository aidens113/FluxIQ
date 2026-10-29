// Core's closed mechanical findings over a trial's change (t775). Pure.
//
// - `result.change_not_seen`: a `change` part whose proof is `no_change` (every
//   witness read, none changed): a grounded no, never a yes.
// - `result.unasked_change`: a list witnessed only to stay unchanged (`steps`
//   empty) that changed, or a control place that changed with no act of the
//   trial there. Judged relative to before: a row already in a "wrong" state
//   before the trial and the same after it is no violation. An unread witness
//   raises nothing; it is not proof of a change.
// - `result.change_contradicted` (t787): a part proved `contradicted`, once
//   for each of its control witnesses the trial put back to the build's start
//   (`returned`, `./delta.ts`): never a yes (`./contradicted.ts`).
//
// An act is at a control place when it names the witness, or names none and
// its step is one the witness attributes.

import type { AutomationStudioTrialActOutcome, AutomationStudioTrialChangeFinding, AutomationStudioTrialDelta, AutomationStudioTrialPartProof, AutomationStudioTrialWitness } from "./contracts.ts";

/** Every closed finding over one trial's change, proofs first, then witnesses in their order. */
export function automationStudioTrialChangeFindings(input: {
  witnesses: readonly AutomationStudioTrialWitness[];
  deltas: readonly AutomationStudioTrialDelta[];
  acts: readonly AutomationStudioTrialActOutcome[];
  proofs: readonly AutomationStudioTrialPartProof[];
}): AutomationStudioTrialChangeFinding[] {
  const findings: AutomationStudioTrialChangeFinding[] = [];
  for (const proof of input.proofs) if (proof.effect?.kind === "change" && proof.proof === "no_change") findings.push({ code: "result.change_not_seen", part: proof.part });
  for (const proof of input.proofs) {
    if (proof.proof !== "contradicted") continue;
    for (const witness of input.witnesses) if (witness.parts.includes(proof.part) && input.deltas.some((delta) => delta.witness === witness.id && delta.kind === "control" && delta.status === "changed" && delta.returned === true)) findings.push({ code: "result.change_contradicted", part: proof.part, witness: witness.id });
  }
  for (const witness of input.witnesses) {
    if (!input.deltas.some((delta) => delta.witness === witness.id && delta.status === "changed")) continue;
    const unasked = witness.kind === "list" ? !witness.steps.length : !input.acts.some((act) => act.witness === witness.id || (act.witness === undefined && witness.steps.includes(act.step)));
    if (unasked) findings.push({ code: "result.unasked_change", witness: witness.id, ...(witness.where ? { where: witness.where } : {}) });
  }
  return findings;
}
