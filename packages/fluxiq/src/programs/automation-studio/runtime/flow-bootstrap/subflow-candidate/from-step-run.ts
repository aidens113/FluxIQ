// A run of the builder's latest proposal from one of its steps (t804): the
// subflow trial gate's answer to `core.test_subflow` with `from`
// (`./subflow-trial-gate.ts`). It checks a repair, on the page as it stands: no
// admission, start hook, site reset, offline check, entry or judge, and it is
// never the part's test -- it carries no `partial`, so the builder loop never
// records it as a trial (`./builder-loop.ts`), it is never kept as a verdict,
// and completion never accepts it. Its acts are recorded with the brief's reset
// (`trialRan`), so the next whole test's before-state includes them. It clears
// the repair a failed whole test left standing once it passes that test's
// failing step (`./pending-repair.ts`).
//
// The port's answer is read as the gate reads a trial's: one about another
// brief, plan, subflow, revision, digest or step is no run of this one, and a
// port that threw is said by kind only, never its text.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/evidence-loop.ts";
import { automationStudioCandidateTrialStop as Stop } from "../candidate/index.ts";
import type { AutomationStudioSiteResetNamedAct, AutomationStudioSiteResetTrialReset } from "../site-reset/index.ts";
import type { AutomationStudioSubflowFromStepPort, AutomationStudioSubflowFromStepResult, AutomationStudioSubflowProposal, AutomationStudioSubflowScope } from "./contracts.ts";
import type { AutomationStudioSubflowPendingRepair } from "./pending-repair.ts";
import { automationStudioSubflowFromStepKeys, automationStudioSubflowFromStepResolve } from "../step-label/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_REPAIR_WORDS as WORDS } from "./repair-words.ts";

const STATUSES: ReadonlySet<unknown> = new Set(["ended", "stopped", "not_run"]);
/** At most this many step keys are listed where `from` names none of the latest proposal's. */
const MAX_KEYS_LISTED = 60;

/** Runs `latest` from the step `from` names, and answers the builder (header). `offline`: the port's environment is not live, so nothing is recorded as left on the site. */
export async function automationStudioSubflowFromStepRun(input: {
  from: string;
  latest: AutomationStudioSubflowProposal;
  scope: AutomationStudioSubflowScope;
  fromStep: AutomationStudioSubflowFromStepPort;
  signal: AbortSignal;
  reset?: Pick<AutomationStudioSiteResetTrialReset, "trialRan"> | undefined;
  offline: boolean;
  repair: AutomationStudioSubflowPendingRepair;
}): Promise<AutomationStudioLlmEvidenceToolExecutionResult> {
  const { latest, signal } = input;
  const { keys, labelsOf } = automationStudioSubflowFromStepKeys(latest);
  const resolved = automationStudioSubflowFromStepResolve(input.from, keys, latest.stepLabels);
  if (!resolved || !("key" in resolved)) {
    const labelled = keys.filter((key) => labelsOf.has(key)).slice(0, MAX_KEYS_LISTED).map((key) => ({ key, labels: [...labelsOf.get(key)!] }));
    const listing = { steps: keys.slice(0, MAX_KEYS_LISTED), ...(labelled.length ? { labelled } : {}) };
    return resolved
      ? refused("subflow.from_step_unknown", WORDS.ambiguousLabel(input.from, resolved.ambiguous), { ...listing, ambiguous: resolved.ambiguous })
      : refused("subflow.from_step_unknown", WORDS.unknownStep(input.from, labelled.length > 0), listing);
  }
  // From here on `from` is the plan key, which the port, the repair and the answer all use.
  const from = resolved.key;
  const { buildId, briefId, planDigest, subflowKey } = input.scope;
  const identity = { buildId, briefId, planDigest, subflowKey };
  let raw: unknown;
  try {
    raw = await input.fromStep({ scope: structuredClone(input.scope), proposal: structuredClone(latest), fromKey: from, signal });
  } catch (error) {
    if (signal.aborted) throw error;
    // The port's own error text may carry page or account detail, so the model is told only its kind.
    const failed = Stop.portFailed("subflow.from_step_port_failed", error);
    return refused("subflow.from_step_port_failed", WORDS.notRun("subflow.from_step_port_failed"), { fromStep: true, notRun: failed });
  }
  signal.throwIfAborted();
  const result = read(raw, identity, latest, from);
  if (!result) return refused("subflow.from_step_result_invalid", WORDS.notRun("subflow.from_step_result_invalid"), { fromStep: true });
  if (result.status === "not_run") {
    const code = result.code ?? "subflow.from_step_not_run";
    return refused(code, WORDS.notRun(code), { fromStep: true, notRun: structuredClone(result.feedback) });
  }
  // Its acts count as the build's, as a trial's do, so the next whole test starts from them (header).
  const leftOnSite = input.offline ? undefined : input.reset?.trialRan(result.acts ?? [], result.trialRunId);
  const checked = input.repair.afterFromStep(result, latest, from);
  const evidence: JsonObject = {
    ok: true, fromStep: true, passed: result.status === "ended", subflowKey, revision: latest.revision, digest: latest.digest, from,
    ...(result.stoppedAtKey !== undefined ? { stoppedAt: result.stoppedAtKey } : {}),
    passedKeys: [...result.passedKeys], steps: structuredClone(result.feedback), promotionCredit: false,
    ...(resolved.label !== undefined ? { fromLabel: resolved.label } : {}),
    ...(checked.standing ? { repairChecked: checked.cleared, ...(checked.step ? { repairStep: checked.step.key } : {}) } : {}),
    instruction: WORDS.answered({ status: result.status, from, stoppedAt: result.stoppedAtKey, checked, latest }),
    ...(leftOnSite?.length ? { leftOnSite: leftOnSite.map(namedAct) } : {}),
    ...(result.trialRunId ? { trialRunId: result.trialRunId } : {})
  };
  return { kind: "llm_evidence_tool_execution", evidence, effectApplied: true, targetsUnchanged: false, resultCode: `subflow.from_step_${result.status}` };
}

/** `raw`, the port's answer to a run of `latest` from `from`, where it is one; undefined otherwise (header). */
function read(raw: unknown, identity: AutomationStudioSubflowFromStepResult["identity"], latest: Pick<AutomationStudioSubflowProposal, "revision" | "digest">, from: string): AutomationStudioSubflowFromStepResult | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const result = raw as Partial<AutomationStudioSubflowFromStepResult>;
  const said = result.identity;
  if (result.fromStep !== true || !said || said.buildId !== identity.buildId || said.briefId !== identity.briefId || said.planDigest !== identity.planDigest || said.subflowKey !== identity.subflowKey) return undefined;
  if (result.revision !== latest.revision || result.digest !== latest.digest || result.fromKey !== from || !STATUSES.has(result.status) || !isJsonObject(result.feedback)) return undefined;
  if (!Array.isArray(result.passedKeys) || !result.passedKeys.every((key) => typeof key === "string")) return undefined;
  if ((result.stoppedAtKey !== undefined && typeof result.stoppedAtKey !== "string") || (result.code !== undefined && typeof result.code !== "string") || (result.trialRunId !== undefined && typeof result.trialRunId !== "string")) return undefined;
  return {
    fromStep: true, identity: { ...identity }, revision: latest.revision, digest: latest.digest, fromKey: from, status: result.status!, passedKeys: [...result.passedKeys], feedback: structuredClone(result.feedback as JsonObject),
    ...(result.stoppedAtKey !== undefined ? { stoppedAtKey: result.stoppedAtKey } : {}),
    ...(result.code !== undefined ? { code: result.code } : {}),
    ...(result.trialRunId ? { trialRunId: result.trialRunId } : {}),
    ...(Array.isArray(result.acts) && result.acts.length ? { acts: structuredClone(result.acts) } : {})
  };
}

/** An act as the model is shown it: its id, what it did, and the call that made it. */
function namedAct(act: AutomationStudioSiteResetNamedAct): JsonObject {
  return { act: act.act, did: act.did, ...(act.call ? { call: act.call } : {}) };
}

function refused(code: string, instruction: string, detail: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code, instruction, ...detail }, effectApplied: false, targetsUnchanged: true, resultCode: code };
}

function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
