import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TRIAL_VERDICTS, type AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioFlowBootstrapInterface } from "../../flow-bootstrap/plan/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { automationStudioProjectAskedActs } from "./asked-acts.ts";
import { automationStudioProjectDigest } from "./digest.ts";
import { automationStudioProjectJsonShape as shape, type AutomationStudioProjectParse } from "./json-shape.ts";
import { readAutomationStudioProjectReceiptRef, type AutomationStudioProjectReceiptRef } from "./receipt-ref.ts";
import type { AutomationStudioProjectStructurePlan } from "./structure-plan.ts";
import { readAutomationStudioProjectSubflowInterface } from "./subflow-interface.ts";
import type { AutomationStudioProjectTaskSpec } from "./task-spec.ts";

// A subflow brief: everything one builder needs to build, survey or repair one
// subflow, or to reset the site before the judged whole run, and nothing of the supervisor's own state (its handles and packets
// may be gone by the time the builder reads it).
//
// A brief is bound to one structure-plan digest. It may only name parts the
// plan gives its subflow, must repeat that subflow's interface exactly, may
// only name predecessors the plan declares, and may only permit lasting acts
// the task asks for, and none when its own parts only read
// (`asked-acts.ts`) -- so a brief cannot widen what a builder may do beyond
// what the person asked.
//
// **A repair is told what failed (bigbox debug fix 2, t595).** Bigbox
// `run-mv8c7unr-42a8456d` sent eight repair briefs, each naming its
// `failingReceipt`, and no builder was shown what that trial said: the
// receipt was checked, stored and read by nothing, so every repair builder
// explored from scratch and wrote the same steps again. A repair now carries
// the trial it starts from, read by Core (`failingTrial`): its verdict, the
// step it stopped at and the rest of what it said, bounded
// (`failingTrial(...)` below), so its builder's opening look shows it
// (`../dispatch/run-brief.ts`). The supervisor fills it in for the whole test
// it names; a subflow trial's is filled in by the dispatcher, which ran it.
//
// **A pass the run rescued is a failing trial too (social debug, t603).**
// Social `run-mv8mebid-84ada5bd`: the whole test passed only because the
// runtime recovered by itself when the site asked the run to slow down -- it
// waited, tried the step again and closed the site's notice -- and the Flow
// had no step that does any of that. The trial gate holds that yes back from
// completion (`flow-bootstrap/candidate/trial-gate.ts`, `slowDown`), so the
// supervisor's repair of it was right, and was refused as naming a trial that
// passed. A failing trial may now be a `yes` carrying `interruptions`: each
// step where the run recovered from what the Flow does not answer, read from
// the trial's own step record (its `absorbed` and `interruptions` entries and
// the paces the run learned), never from what the page said, with what the
// gate says the Flow needs there. A `yes` with none is still no failing trial.
//
// **A build brief may start from a carried proposal (A8 towels
// `run-mvac0nmw`, t658).** An amendment moved a reshaping part into the
// subflow that reads and renamed its output, and Core dropped that subflow's
// judged-yes proposal, though it already stored exactly what the moved part
// asked. A proposal whose subflow the amendment only gave more parts, or whose
// outputs it only added to or renamed, is now carried (`../supervisor/state.ts`):
// the next build brief of that subflow names it (`carriedFrom`), its builder
// starts from it, and its own trial is judged against every part, the new ones
// with them, before the brief can be done. Core sets it; a brief as sent never
// carries one (`../supervisor/brief-input.ts`).
//
// **A narrowed or merged proposal is carried too (Lab `run-mvan7giv`, t671).**
// The carried proposal then names the outputs the amendment removed
// (`removedOutputs`), the subflow it was built for when merged under another
// key (`builtFor`), and that it now is the subflow the router runs
// (`routerRun`), so the dispatcher shows its builder a script that already
// fits (`../dispatch/run-brief.ts`). Each is absent when it does not apply, so
// a brief recorded before them reads as it did.

/** A trial verdict that is not a pass. */
type FailedVerdict = Exclude<AutomationStudioCandidateTrialVerdict, "yes">;

/**
 * A repair's failing trial as Core read it (header): a trial that did not
 * pass, or one that passed only on the run's own recovery from interruptions
 * the Flow does not answer, each named under `interruptions`.
 */
export type AutomationStudioProjectFailingTrial = {
  verdict: FailedVerdict;
  /** The last step that failed, as the trial's own steps name it: its number, label, node, failure code and what happened. Absent when no step failed. */
  failedStep?: JsonObject;
  /** Everything else the trial said -- its code, what happened, what its judge read -- bounded. */
  said: JsonObject;
} | {
  verdict: "yes";
  /**
   * Each step where the run recovered by itself from what the Flow does not
   * answer (header): its number, label and control, what the site did and how
   * the run recovered (`absorbed`, `interruptions`, `learned`), and what the
   * Flow needs there (`needs`), each bounded.
   */
  interruptions: JsonObject[];
  said: JsonObject;
};

/**
 * `reset` returns the site to the state the build started from, through the
 * site's own controls, before the judged whole run: it undoes exactly the
 * lasting acts this build's briefs made and never what was there before (user
 * rule, 2026-10-12). It carries no parts and permits no acts of its own:
 * reversing the build's own acts is not a new permission question.
 */
export const AUTOMATION_STUDIO_PROJECT_BRIEF_KINDS = Object.freeze(["build", "survey", "repair", "reset"] as const);

export type AutomationStudioProjectSubflowBrief = {
  briefId: string;
  kind: (typeof AUTOMATION_STUDIO_PROJECT_BRIEF_KINDS)[number];
  planDigest: string;
  subflowKey: string;
  parts: string[];
  /** Absent only for a subflow the router runs, whose interface is the Flow's. */
  interface?: AutomationStudioFlowBootstrapInterface;
  entry: { caseId: string; predecessors: string[] };
  allowanceUsd: number;
  maxIterations: number;
  /**
   * The calls its allowance is carved with, its subflow trials' judges among
   * them (t570): Core's share of the build's calls, set as the brief is
   * dispatched. Absent on a brief recorded before Core sized calls.
   */
  maxCalls?: number;
  /** Core's, from the lasting acts its parts ask for (t570); never wider. */
  permittedActs: AutomationStudioActionConsequence[];
  recordingExcerpt?: string;
  /** Repair only: the trial the repair starts from. */
  failingReceipt?: AutomationStudioProjectReceiptRef;
  /** Repair only, beside its receipt: what that trial said, when Core held it as the brief was sent (header). */
  failingTrial?: AutomationStudioProjectFailingTrial;
  /** Build only: the done proposal an amendment that only added to this subflow carried for it (header), set by Core, never by the supervisor. */
  carriedFrom?: AutomationStudioProjectCarriedProposal;
};

/**
 * A done proposal carried across an amendment that only gave its subflow more
 * parts, or added or renamed its outputs (header): the brief, revision and
 * digest that name it, the parts it was not built for, and each output renamed.
 */
export type AutomationStudioProjectCarriedProposal = {
  briefId: string;
  revision: number;
  digest: string;
  addedParts: string[];
  renamedOutputs: Array<{ from: string; to: string }>;
  /** Each output the amendment removed that the carried script still binds (t671); absent when none. */
  removedOutputs?: string[];
  /** The subflow the proposal was built for, when the amendment merged it into this one under another key (t671). */
  builtFor?: string;
  /** Set when the proposal was built for a callable subflow and this one is the subflow the router runs (t671). */
  routerRun?: true;
};

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
  const fields = shape.object(value, "brief", ["briefId", "kind", "planDigest", "subflowKey", "parts", "entry", "allowanceUsd", "maxIterations", "permittedActs"], ["interface", "maxCalls", "recordingExcerpt", "failingReceipt", "failingTrial", "carriedFrom"]);
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
