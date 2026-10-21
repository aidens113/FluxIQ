import type { AutomationStudioSubflowScope, AutomationStudioSubflowTrialPreparingPort, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectTrialRef } from "../contracts/index.ts";
import type { AutomationStudioProjectDispatchSpend } from "./ending.ts";
import type { AutomationStudioProjectDispatchReceipts } from "./receipts.ts";
import type { AutomationStudioProjectDispatchStandingNos } from "./standing-nos.ts";

// The partial-trial port one build or repair brief's gate is given
// (`./run-brief.ts`): the brief's own port, each trial it answers listed as a
// receipt (`./receipts.ts`), remembered for the build by that receipt
// (`remember`, so a later repair is shown it), and kept on the brief's spend as
// the last trial heard (t611); the port's start hook kept ahead of the gate's
// reset (`prepareStart`, t578).
//
// **The gate's verdict is what the build keeps (t634).** The port answers
// before the gate weighs the trial, so a trial the gate held unsure -- a no the
// build's own record contradicts (t633) -- was listed, remembered and kept as
// the port's no. The gate now tells this port each trial as it weighed it
// (`weighed`): the receipt is made again from the gate's answer, remembered
// again under the same receipt id, and the spend's last trial becomes the
// gate's; the brief's own port is told too, so the build's proposals record
// the gate's verdict (`../../service/project-build/subflow-trials.ts`).
//
// **A subflow's standing nos cross its briefs (t634).** A no the gate let
// stand is kept for the build by subflow and plan (`./standing-nos.ts`), and
// the ones earlier briefs kept are handed to this brief's gate as it is made
// (`standingNos`), so a repair's gate weighs a no against what the build brief
// before it upheld. Core's records, never shown to a model.
//
// **And so do its judged trials' advice (t752).** A revision made exactly the
// change an earlier no's judge advised, and its judges, told nothing of it,
// answered no for that change. Each advice a brief's gate kept is told here
// (`weighed`, `advised`), kept for the build by subflow and plan (`advised`,
// `./run-brief.ts`), and the latest three handed to a later brief's gate as it
// is made (`earlierTrials`), as standing nos are.

export function automationStudioProjectDispatchTrialPort(input: {
  /** The brief's own port, from its ports factory. */
  port: AutomationStudioSubflowTrialPreparingPort;
  /** The brief's scope: its subflow and plan name the standing nos it is handed and keeps. */
  scope: Pick<AutomationStudioSubflowScope, "subflowKey" | "planDigest">;
  receipts: AutomationStudioProjectDispatchReceipts;
  spend: AutomationStudioProjectDispatchSpend;
  standingNos: AutomationStudioProjectDispatchStandingNos;
  /** The judged trials' advice the build's briefs kept, by subflow and plan (header, t752); absent, none crosses briefs. */
  advised?: Map<string, unknown[]> | undefined;
  /** Told each trial listed under its reference, and again where the gate's answer remade that reference. */
  remember(ref: AutomationStudioProjectTrialRef, trial: AutomationStudioSubflowTrialResult): void;
}): AutomationStudioSubflowTrialPreparingPort {
  const { port, receipts, spend, standingNos, scope } = input;
  const listed = receipts.wrap(port);
  const asked: AutomationStudioSubflowTrialPreparingPort = async (request) => {
    const result = await listed(request);
    const ref = receipts.list().at(-1);
    if (ref) input.remember(ref, result);
    spend.trial = structuredClone(result);
    return result;
  };
  if (port.prepareStart) asked.prepareStart = port.prepareStart;
  // The gate's row check for a yes over a flagged read, answered by the brief's own port (t692).
  if (port.checkRows) asked.checkRows = port.checkRows;
  const earlier = standingNos.earlier(scope);
  if (earlier.length) asked.standingNos = earlier;
  // The advice earlier briefs of this subflow kept under this plan, the latest three (header, t752).
  const plan = JSON.stringify([scope.subflowKey, scope.planDigest]);
  const advised = input.advised?.get(plan) ?? [];
  if (advised.length) asked.earlierTrials = structuredClone(advised);
  asked.weighed = (trial) => {
    const { answer } = trial;
    const ref = receipts.weighed(answer);
    if (ref) input.remember(ref, answer);
    const heard = spend.trial;
    if (heard && heard.identity?.briefId === answer.identity.briefId && heard.revision === answer.revision && heard.digest === answer.digest) spend.trial = structuredClone(answer);
    if (trial.standingNo !== undefined) standingNos.stood(scope, trial.standingNo);
    if (trial.advised && input.advised) input.advised.set(plan, [...(input.advised.get(plan) ?? []), structuredClone(trial.advised)].slice(-3));
    port.weighed?.(structuredClone(trial));
  };
  return asked;
}
