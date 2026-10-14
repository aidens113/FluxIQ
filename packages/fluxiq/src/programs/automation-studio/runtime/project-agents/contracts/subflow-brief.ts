import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioFlowBootstrapInterface } from "../../flow-bootstrap/plan/index.ts";
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
};

const LIMITS = { parts: 50, predecessors: 40, excerpt: 20_000, iterations: 1000, calls: 10_000 } as const;

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
  }
});

function read(value: unknown): AutomationStudioProjectSubflowBrief {
  const fields = shape.object(value, "brief", ["briefId", "kind", "planDigest", "subflowKey", "parts", "entry", "allowanceUsd", "maxIterations", "permittedActs"], ["interface", "maxCalls", "recordingExcerpt", "failingReceipt"]);
  const kind = shape.oneOf(fields.kind, "brief.kind", AUTOMATION_STUDIO_PROJECT_BRIEF_KINDS);
  const parts = shape.ids(fields.parts, "brief.parts", LIMITS.parts);
  if (kind !== "survey" && kind !== "reset" && !parts.length) return shape.refuse("project.brief_no_parts", "brief.parts");
  if (kind === "reset" && parts.length) return shape.refuse("project.brief_reset_parts", "brief.parts");
  const entry = shape.object(fields.entry, "brief.entry", ["caseId", "predecessors"]);
  const permittedActs = shape.array(fields.permittedActs, "brief.permittedActs", AUTOMATION_STUDIO_ACTION_CONSEQUENCES.length)
    .map((act, index) => shape.oneOf(act, `brief.permittedActs.${index}`, AUTOMATION_STUDIO_ACTION_CONSEQUENCES));
  if (new Set(permittedActs).size !== permittedActs.length) return shape.refuse("project.duplicate", "brief.permittedActs");
  if ((kind === "repair") !== (fields.failingReceipt !== undefined)) return shape.refuse("project.brief_failing_receipt", "brief.failingReceipt");
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
  return brief;
}
