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
// witnesses (each landed act whose diff read its control at that control's
// own place, a loop's passes each at its own item; any other by stamp, else by
// step definition: `./pass-witnesses.ts`, t787), and builds each part's proof,
// Core's closed findings and the bounded packet (`./proof.ts`, `./findings.ts`,
// `./packet.ts`). Only live trials have a session: an offline trial changes
// nothing on the site.
//
// **Direction (t787).** Each control witness's delta is read against the
// counts the build recorded at its place when it first read it (the port's
// `start`), so a place the trial put back to how the build found it is said
// `returned`, which a part asking to add proves only as `contradicted`. The
// starts are asked before Core's looks after the trial: a look's read reaches
// the ledger, and a place it reports for the first time would take the trial's
// own end as the build's start.

import type { AutomationStudioTrialActOutcome, AutomationStudioTrialChangeAct, AutomationStudioTrialChangeLedgerPort, AutomationStudioTrialChangeLook, AutomationStudioTrialChangePart, AutomationStudioTrialChangeSession, AutomationStudioTrialChangeStep, AutomationStudioTrialReading, AutomationStudioTrialWitnessSet } from "./contracts.ts";
import { automationStudioTrialDelta } from "./delta.ts";
import { automationStudioTrialChangeFindings } from "./findings.ts";
import { automationStudioTrialSiteChangePacket } from "./packet.ts";
import { automationStudioTrialPassWitnesses } from "./pass-witnesses.ts";
import { automationStudioTrialPartProof } from "./proof.ts";
import { automationStudioTrialWitnessReadings } from "./readings.ts";
import { automationStudioTrialWitnesses } from "./witnesses.ts";

/** The classes whose change a witness shows (`./witnesses.ts`); a step with none of them is passive. */
const LASTING: ReadonlySet<string> = new Set(["create_new", "modify_existing", "delete"]);

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
      // Asked before the looks after the trial reach the ledger (header).
      const starts = startsOf(port, set, acts);
      const after = await automationStudioTrialWitnessReadings({ side: "after", set, port, look: input.look, starts: before.starts, signal: signal ?? input.signal });
      const read: Record<string, { before?: AutomationStudioTrialReading; after?: AutomationStudioTrialReading }> = {};
      for (const witness of set.witnesses) read[witness.id] = { ...(before.readings[witness.id] ? { before: before.readings[witness.id] } : {}), ...(after.readings[witness.id] ? { after: after.readings[witness.id] } : {}) };
      // Each act at its witness, a loop's passes each at its own item (header, t787).
      const passive = new Set(steps.filter((step) => !step.consequences.some((consequence) => LASTING.has(consequence))).map((step) => step.step));
      const { witnesses, readings, attributed } = automationStudioTrialPassWitnesses({ set, readings: read, acts, passive });
      const outcomes: AutomationStudioTrialActOutcome[] = acts.map((act, index) => {
        const definition = set.byDefinition[act.definitionId];
        const ids = attributed[index] ?? [];
        return { step: act.step, ...(act.pass ? { pass: act.pass } : {}), ...(act.row !== undefined ? { row: act.row } : {}), outcome: act.outcome, ...(ids[0] !== undefined ? { witness: ids[0] } : {}), parts: [...(definition?.parts ?? [])] };
      });
      const deltas = witnesses.map((witness) => automationStudioTrialDelta(witness, readings[witness.id]?.before, readings[witness.id]?.after, witness.kind === "control" ? starts.get(witness.place) : undefined));
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

/** The build's start at every control place the trial's witnesses and acts name, where the port keeps one (header). */
function startsOf(port: Pick<AutomationStudioTrialChangeLedgerPort, "start">, set: Pick<AutomationStudioTrialWitnessSet, "witnesses">, acts: readonly AutomationStudioTrialChangeAct[]): Map<string, Readonly<Record<string, number>>> {
  const starts = new Map<string, Readonly<Record<string, number>>>();
  if (!port.start) return starts;
  const places = new Set([...set.witnesses.flatMap((witness) => (witness.kind === "control" ? [witness.place] : [])), ...acts.flatMap((act) => (act.control ? [act.control.place] : []))]);
  for (const place of places) {
    const start = port.start(place);
    if (start) starts.set(place, { ...start });
  }
  return starts;
}
