import type { FailedVerdict } from "../../../../flows/authoring/project/index.ts";
import type { AutomationStudioCandidateTrialVerdict } from "../../../../flows/authoring/plan/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../../agents/evidence-loop/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS } from "../../../../flows/authoring/plan/index.ts";
import type { AutomationStudioProjectCarriedProposal, AutomationStudioProjectFailingTrial, AutomationStudioProjectParse, AutomationStudioProjectStructurePlan, AutomationStudioProjectSubflowBrief, AutomationStudioProjectTaskSpec } from "../../../../flows/authoring/project/index.ts";
import { automationStudioProjectJsonShape as shape } from "./json-shape.ts";
import { automationStudioProjectDigest } from "./digest.ts";
import { automationStudioProjectAskedActs } from "./asked-acts.ts";
import type { JsonObject } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_PROJECT_BRIEF_KINDS } from "../../../../flows/authoring/project/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../../../components/automation/action-effect/consequences/index.ts";
import { readAutomationStudioProjectSubflowInterface } from "./subflow-interface.ts";
import { readAutomationStudioProjectReceiptRef } from "./receipt-ref.ts";
import { automationStudioProjectEarlierAttempt } from "./earlier-attempt.ts";

/** `iterations` is the builder loop's own most, so no brief can carry a length its loop refuses (t577). `said`, `step` and `scalar` bound a failing trial, in JSON characters. */
const LIMITS = { parts: 50, predecessors: 40, excerpt: 20_000, iterations: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxIterations, calls: 10_000, said: 8_000, step: 3_000, scalar: 500, interruptions: 10 } as const;
const FAILED_VERDICTS = AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS.filter((verdict): verdict is FailedVerdict => verdict !== "yes");

export const automationStudioProjectSubflowBrief = Object.freeze({
  parse(value: unknown): AutomationStudioProjectParse<AutomationStudioProjectSubflowBrief> {
    return shape.parse(() => read(value));
  },

  /** What stops this brief being dispatched under this plan and task spec. */
  issues(brief: AutomationStudioProjectSubflowBrief, plan: AutomationStudioProjectStructurePlan, taskSpec: AutomationStudioProjectTaskSpec): Array<{ code: string; path: string }> {
    const issues: Array<{ code: string; path: string }> = [];
    if (brief.planDigest !== plan.digest) issues.push({ code: "project.brief_plan_stale", path: "brief.planDigest" });
    if (plan.taskSpecDigest !== taskSpec.digest) issues.push({ code: "project.plan_task_spec_stale", path: "structurePlan.taskSpecDigest" });
    const subflow = plan.plan.subflows.find((candidate) => candidate.key === brief.subflowKey);
    if (!subflow) return [...issues, { code: "project.brief_subflow_unknown", path: "brief.subflowKey" }];
    const carried = new Set(plan.partOf[brief.subflowKey] ?? []);
    for (const [index, part] of brief.parts.entries()) {
      if (!carried.has(part)) issues.push({ code: "project.brief_part_not_carried", path: `brief.parts.${index}` });
    }
    if (automationStudioProjectDigest("interface", brief.interface ?? null) !== automationStudioProjectDigest("interface", subflow.interface ?? null)) issues.push({ code: "project.brief_interface_mismatch", path: "brief.interface" });
    const declared = new Set(plan.plan.subflows.map((candidate) => candidate.key));
    for (const [index, predecessor] of brief.entry.predecessors.entries()) {
      if (predecessor === brief.subflowKey || !declared.has(predecessor)) issues.push({ code: "project.brief_predecessor_invalid", path: `brief.entry.predecessors.${index}` });
    }
    const asked = new Set<string>(automationStudioProjectAskedActs(taskSpec, brief.parts));
    for (const [index, act] of brief.permittedActs.entries()) {
      if (!asked.has(act)) issues.push({ code: "project.brief_act_not_asked", path: `brief.permittedActs.${index}` });
    }
    return issues;
  },

  /**
   * A trial that did not pass, as a repair carries it (header): the last step
   * that failed, and everything else it said, each bounded. A trial that
   * passed is one only with `unanswered` -- what the trial gate says its Flow
   * does not answer yet (`slowDown`), one entry per step -- and carries each
   * such step as its own step record has it; with none it is undefined.
   */
  failingTrial(trial: { verdict: AutomationStudioCandidateTrialVerdict; feedback: JsonObject }, unanswered: readonly JsonObject[] = []): AutomationStudioProjectFailingTrial | undefined {
    const { steps, ...rest } = trial.feedback;
    if (trial.verdict === "yes") {
      if (!unanswered.length) return undefined;
      const recorded = Array.isArray(steps) ? steps.filter(isObject) : [];
      const paces = Array.isArray(rest.paces) ? rest.paces.filter(isObject) : [];
      return { verdict: "yes", interruptions: unanswered.slice(0, LIMITS.interruptions).map((entry) => bounded(interruption(entry, recorded, paces), LIMITS.step)), said: bounded(rest, LIMITS.said) };
    }
    const failed = Array.isArray(steps) ? [...steps].reverse().find((step): step is JsonObject => isObject(step) && step.status === "failed") : undefined;
    return { verdict: trial.verdict, ...(failed ? { failedStep: bounded(failed, LIMITS.step) } : {}), said: bounded(rest, LIMITS.said) };
  }
});

/**
 * One step the gate says the Flow does not answer, as the trial's step record
 * has it (header): the step's number, label, node and control, what the run
 * absorbed there and the layers it closed, any pace the run learned for it,
 * and what the gate says the Flow needs (`needs`).
 */
function interruption(entry: JsonObject, steps: readonly JsonObject[], paces: readonly JsonObject[]): JsonObject {
  const { step: number, label, ...needs } = entry;
  const record = typeof number === "number" ? steps.find((step) => step.step === number) : undefined;
  const learned = paces.filter((pace) => (record ? pace.definitionId === record.definitionId && pace.label === record.label && pace.control === record.control : pace.label === label));
  const field = (key: string): JsonObject => (record?.[key] !== undefined ? { [key]: record[key]! } : {});
  return {
    ...(number !== undefined ? { step: number } : {}),
    ...(label !== undefined ? { label } : {}),
    ...field("definitionId"),
    ...field("control"),
    ...field("absorbed"),
    ...field("interruptions"),
    ...(learned.length ? { learned } : {}),
    needs
  };
}

/** `value` whole when it fits in `max` JSON characters; otherwise its plain fields alone, each text cut short. */
function bounded(value: JsonObject, max: number): JsonObject {
  if (JSON.stringify(value).length <= max) return structuredClone(value);
  const plain: JsonObject = {};
  for (const [key, field] of Object.entries(value)) {
    if (typeof field === "string") plain[key] = field.length > LIMITS.scalar ? `${field.slice(0, LIMITS.scalar - 3)}...` : field;
    else if (typeof field === "number" || typeof field === "boolean") plain[key] = field;
  }
  return plain;
}

/** A failing trial as a recorded brief holds it; throws a refusal for `shape.parse`. */
function readFailingTrial(value: unknown, path: string): AutomationStudioProjectFailingTrial {
  const fields = shape.object(value, path, ["verdict", "said"], ["failedStep", "interruptions"]);
  const said = jsonObject(fields.said, `${path}.said`, LIMITS.said);
  // A pass is a failing trial only with the interruptions its run recovered from by itself (header).
  if (fields.verdict === "yes" && fields.interruptions !== undefined && fields.failedStep === undefined) {
    const interruptions = shape.array(fields.interruptions, `${path}.interruptions`, LIMITS.interruptions).map((entry, index) => jsonObject(entry, `${path}.interruptions.${index}`, LIMITS.step));
    if (!interruptions.length) return shape.refuse("project.brief_failing_receipt", `${path}.interruptions`);
    return { verdict: "yes", interruptions, said };
  }
  if (fields.interruptions !== undefined) return shape.refuse("project.brief_failing_receipt", `${path}.interruptions`);
  const trial: Extract<AutomationStudioProjectFailingTrial, { verdict: FailedVerdict }> = { verdict: shape.oneOf(fields.verdict, `${path}.verdict`, FAILED_VERDICTS), said };
  if (fields.failedStep !== undefined) trial.failedStep = jsonObject(fields.failedStep, `${path}.failedStep`, LIMITS.step);
  return trial;
}

function jsonObject(value: unknown, path: string, max: number): JsonObject {
  const read = shape.json(value, path);
  if (!isObject(read)) return shape.refuse("project.not_object", path);
  if (JSON.stringify(read).length > max) return shape.refuse("project.too_long", path);
  return read;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function read(value: unknown): AutomationStudioProjectSubflowBrief {
  const fields = shape.object(value, "brief", ["briefId", "kind", "planDigest", "subflowKey", "parts", "entry", "allowanceUsd", "maxIterations", "permittedActs"], ["interface", "maxCalls", "recordingExcerpt", "failingReceipt", "failingTrial", "carriedFrom", "earlierAttempt"]);
  const kind = shape.oneOf(fields.kind, "brief.kind", AUTOMATION_STUDIO_PROJECT_BRIEF_KINDS);
  const parts = shape.ids(fields.parts, "brief.parts", LIMITS.parts);
  if (kind !== "survey" && kind !== "reset" && !parts.length) return shape.refuse("project.brief_no_parts", "brief.parts");
  if (kind === "reset" && parts.length) return shape.refuse("project.brief_reset_parts", "brief.parts");
  const entry = shape.object(fields.entry, "brief.entry", ["caseId", "predecessors"]);
  const permittedActs = shape.array(fields.permittedActs, "brief.permittedActs", AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length)
    .map((act, index) => shape.oneOf(act, `brief.permittedActs.${index}`, AUTOMATION_STUDIO_ACTION_CONSEQUENCES));
  if (new Set(permittedActs).size !== permittedActs.length) return shape.refuse("project.duplicate", "brief.permittedActs");
  if ((kind === "repair") !== (fields.failingReceipt !== undefined)) return shape.refuse("project.brief_failing_receipt", "brief.failingReceipt");
  if (fields.failingTrial !== undefined && kind !== "repair") return shape.refuse("project.brief_failing_receipt", "brief.failingTrial");
  const allowanceUsd = shape.amount(fields.allowanceUsd, "brief.allowanceUsd");
  if (allowanceUsd <= 0) return shape.refuse("project.invalid_amount", "brief.allowanceUsd");
  const brief: AutomationStudioProjectSubflowBrief = {
    briefId: shape.storageId(fields.briefId, "brief.briefId"),
    kind,
    planDigest: shape.digest(fields.planDigest, "brief.planDigest"),
    subflowKey: shape.id(fields.subflowKey, "brief.subflowKey"),
    parts,
    entry: { caseId: shape.id(entry.caseId, "brief.entry.caseId"), predecessors: shape.ids(entry.predecessors, "brief.entry.predecessors", LIMITS.predecessors) },
    allowanceUsd,
    maxIterations: shape.count(fields.maxIterations, "brief.maxIterations", 1),
    permittedActs
  };
  if (brief.maxIterations > LIMITS.iterations) return shape.refuse("project.invalid_count", "brief.maxIterations");
  if (fields.maxCalls !== undefined) {
    brief.maxCalls = shape.count(fields.maxCalls, "brief.maxCalls", 1);
    if (brief.maxCalls > LIMITS.calls) return shape.refuse("project.invalid_count", "brief.maxCalls");
  }
  if (fields.interface !== undefined) brief.interface = readAutomationStudioProjectSubflowInterface(fields.interface, "brief.interface");
  if (fields.recordingExcerpt !== undefined) brief.recordingExcerpt = shape.text(fields.recordingExcerpt, "brief.recordingExcerpt", LIMITS.excerpt);
  if (fields.failingReceipt !== undefined) brief.failingReceipt = readAutomationStudioProjectReceiptRef(fields.failingReceipt, "brief.failingReceipt");
  if (fields.failingTrial !== undefined) brief.failingTrial = readFailingTrial(fields.failingTrial, "brief.failingTrial");
  if (fields.carriedFrom !== undefined) {
    if (kind !== "build") return shape.refuse("project.brief_carried_from", "brief.carriedFrom");
    brief.carriedFrom = readCarried(fields.carriedFrom, "brief.carriedFrom");
  }
  if (fields.earlierAttempt !== undefined) {
    if (kind !== "build" && kind !== "repair") return shape.refuse("project.brief_earlier_attempt", "brief.earlierAttempt");
    brief.earlierAttempt = automationStudioProjectEarlierAttempt.read(fields.earlierAttempt, "brief.earlierAttempt");
  }
  return brief;
}

/** A carried proposal as a recorded brief holds it (header); throws a refusal for `shape.parse`. */
function readCarried(value: unknown, path: string): AutomationStudioProjectCarriedProposal {
  const fields = shape.object(value, path, ["briefId", "revision", "digest", "addedParts", "renamedOutputs"], ["removedOutputs", "builtFor", "routerRun"]);
  const renamedOutputs = shape.array(fields.renamedOutputs, `${path}.renamedOutputs`, LIMITS.parts).map((entry, index) => {
    const pair = shape.object(entry, `${path}.renamedOutputs.${index}`, ["from", "to"]);
    return { from: shape.id(pair.from, `${path}.renamedOutputs.${index}.from`), to: shape.id(pair.to, `${path}.renamedOutputs.${index}.to`) };
  });
  return {
    briefId: shape.storageId(fields.briefId, `${path}.briefId`),
    revision: shape.count(fields.revision, `${path}.revision`, 1),
    digest: shape.digest(fields.digest, `${path}.digest`),
    addedParts: shape.ids(fields.addedParts, `${path}.addedParts`, LIMITS.parts),
    renamedOutputs,
    ...(fields.removedOutputs !== undefined ? { removedOutputs: shape.ids(fields.removedOutputs, `${path}.removedOutputs`, LIMITS.parts) } : {}),
    ...(fields.builtFor !== undefined ? { builtFor: shape.id(fields.builtFor, `${path}.builtFor`, 64) } : {}),
    ...(fields.routerRun !== undefined ? { routerRun: fields.routerRun === true ? true : shape.refuse("project.not_true", `${path}.routerRun`) } : {})
  };
}
