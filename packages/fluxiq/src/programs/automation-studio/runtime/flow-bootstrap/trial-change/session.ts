// One live trial judged by its change (t775 D1; user, 2026-10-27: a trial is
// judged against the state recorded just before it and the change asked for).
//
// `begin` runs inside the trial's reset, after any start hook: it resolves the
// trial's witnesses (`./witnesses.ts`), takes their before readings
// (`./readings.ts`), notes which parts' end state an earlier act of the same
// step was seen to make (`carried`), and the build's acts on the site as the
// trial starts (`leftFromEarlier`). It answers nothing when the trial has no
// witness and nothing of the build is on the site: there is no change to show.
//
// `finish` runs inside the trial port, after the end view and before the
// judge: it reads every witness again, attributes the trial's acts to their
// witnesses (by stamp, else by step definition), and builds each part's proof,
// Core's closed findings and the bounded packet (`./proof.ts`, `./findings.ts`,
// `./packet.ts`). Only live trials have a session: an offline trial changes
// nothing on the site.

import type { AutomationStudioTrialActOutcome, AutomationStudioTrialChangeAct, AutomationStudioTrialChangeLedgerPort, AutomationStudioTrialChangeLook, AutomationStudioTrialChangePart, AutomationStudioTrialChangeSession, AutomationStudioTrialChangeStep, AutomationStudioTrialReading } from "./contracts.ts";
import { automationStudioTrialDelta } from "./delta.ts";
import { automationStudioTrialChangeFindings } from "./findings.ts";
import { automationStudioTrialSiteChangePacket } from "./packet.ts";
import { automationStudioTrialPartProof } from "./proof.ts";
import { automationStudioTrialWitnessReadings } from "./readings.ts";
import { automationStudioTrialWitnesses } from "./witnesses.ts";

/** Takes the before readings of a live trial and answers how to finish it (header); none when there is nothing to show. */
export async function automationStudioTrialChangeBegin(input: {
  steps: readonly AutomationStudioTrialChangeStep[];
  parts: readonly AutomationStudioTrialChangePart[];
  port: AutomationStudioTrialChangeLedgerPort;
  look?: AutomationStudioTrialChangeLook | undefined;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioTrialChangeSession | undefined> {
  const { steps, parts, port } = input;
  const set = automationStudioTrialWitnesses(steps, port);
  const left = port.leftFromEarlier();
  if (!set.witnesses.length && !left.length) return undefined;
  // An end state already held proves the run only where the same step was seen making it earlier in the build (design section 3).
  const carried = new Set(parts.filter((part) => part.effect?.kind === "end_state" && steps.some((step) => step.parts.includes(part.id) && port.carried(step))).map((part) => part.id));
  const before = await automationStudioTrialWitnessReadings({ side: "before", set, port, look: input.look, signal: input.signal });
  return {
    async finish(acts: readonly AutomationStudioTrialChangeAct[], signal?: AbortSignal) {
      const after = await automationStudioTrialWitnessReadings({ side: "after", set, port, look: input.look, starts: before.starts, signal: signal ?? input.signal });
      const witnesses = set.witnesses.map((witness) => ({ ...witness, steps: [] as number[], parts: [...witness.parts] }));
      const outcomes: AutomationStudioTrialActOutcome[] = acts.map((act) => {
        const definition = set.byDefinition[act.definitionId];
        const ids = (act.witness !== undefined ? set.byStamp[JSON.stringify(act.witness)] : undefined) ?? definition?.witnesses ?? [];
        for (const witness of witnesses) if (ids.includes(witness.id) && !witness.steps.includes(act.step)) witness.steps.push(act.step);
        return { step: act.step, ...(act.pass ? { pass: act.pass } : {}), ...(act.row !== undefined ? { row: act.row } : {}), outcome: act.outcome, ...(ids[0] !== undefined ? { witness: ids[0] } : {}), parts: [...(definition?.parts ?? [])] };
      });
      for (const witness of witnesses) witness.steps.sort((left, right) => left - right);
      const readings: Record<string, { before?: AutomationStudioTrialReading; after?: AutomationStudioTrialReading }> = {};
      for (const witness of witnesses) readings[witness.id] = { ...(before.readings[witness.id] ? { before: before.readings[witness.id] } : {}), ...(after.readings[witness.id] ? { after: after.readings[witness.id] } : {}) };
      const deltas = witnesses.map((witness) => automationStudioTrialDelta(witness, readings[witness.id]?.before, readings[witness.id]?.after));
      const proofs = parts.map((part) => automationStudioTrialPartProof({
        part,
        deltas: deltas.filter((delta) => witnesses.find((witness) => witness.id === delta.witness)?.parts.includes(part.id)),
        acts: outcomes,
        carried: carried.has(part.id)
      }));
      const findings = automationStudioTrialChangeFindings({ witnesses, deltas, acts: outcomes, proofs });
      return { siteChange: automationStudioTrialSiteChangePacket({ witnesses, readings, acts: outcomes, leftFromEarlier: left, proofs }), findings };
    }
  };
}
