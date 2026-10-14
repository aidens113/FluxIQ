import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../action-permissions/index.ts";
import {
  AUTOMATION_STUDIO_PROJECT_AGENT_ROLES,
  automationStudioProjectBuilderReturn,
  automationStudioProjectDecisionLogEntry,
  automationStudioProjectJsonShape as shape,
  automationStudioProjectStructurePlan,
  automationStudioProjectSubflowBrief,
  automationStudioProjectTaskSpec,
  readAutomationStudioProjectReceiptRef,
  type AutomationStudioProjectParse,
  type AutomationStudioProjectSubflowBrief
} from "../contracts/index.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_ENDINGS, type AutomationStudioProjectBuildRecord, type AutomationStudioProjectBuildRef, type AutomationStudioProjectBuildReturnRecord } from "./build-record.ts";

// Reads a stored build record back, trusting nothing in it. A record reopened
// after a restart is re-validated as if each piece were being written now:
// every task spec and plan must carry its own digest, every plan must bind a
// recorded task spec, every brief must still satisfy the plan it names, and
// every return must answer its brief. An edited file is refused, not repaired.

const LIMITS = { revisions: 200, briefs: 500, entries: 5000, sources: 200 } as const;

export const automationStudioProjectBuildRecordParser = Object.freeze({
  main(value: unknown, ref: AutomationStudioProjectBuildRef): AutomationStudioProjectParse<AutomationStudioProjectBuildRecord> {
    return shape.parse(() => readMain(value, ref));
  },

  returned(value: unknown, ref: AutomationStudioProjectBuildRef, brief: AutomationStudioProjectSubflowBrief): AutomationStudioProjectParse<AutomationStudioProjectBuildReturnRecord> {
    return shape.parse(() => {
      const fields = shape.object(value, "returnRecord", ["kind", "schemaVersion", "buildId", "briefId", "recordedAt", "builderReturn"]);
      if (fields.kind !== "project_builder_return" || fields.schemaVersion !== 1) return shape.refuse("project.record_kind", "returnRecord.kind");
      if (fields.buildId !== ref.buildId || fields.briefId !== brief.briefId) return shape.refuse("project.record_identity", "returnRecord.briefId");
      const builderReturn = unwrap(automationStudioProjectBuilderReturn.parse(fields.builderReturn));
      firstIssue(automationStudioProjectBuilderReturn.issues(builderReturn, brief));
      return { kind: "project_builder_return", schemaVersion: 1, buildId: ref.buildId, briefId: brief.briefId, recordedAt: shape.count(fields.recordedAt, "returnRecord.recordedAt"), builderReturn };
    });
  }
});

function readMain(value: unknown, ref: AutomationStudioProjectBuildRef): AutomationStudioProjectBuildRecord {
  const fields = shape.object(value, "record", ["kind", "schemaVersion", "buildId", "projectId", "flowId", "instructionDigest", "sourceIds", "createdAt", "updatedAt", "taskSpecs", "plans", "briefs", "receipts", "allowances", "lastingActs", "decisions"], ["ending"]);
  if (fields.kind !== "project_build_record" || fields.schemaVersion !== 1) return shape.refuse("project.record_kind", "record.kind");
  if (fields.buildId !== ref.buildId || fields.projectId !== ref.projectId || fields.flowId !== ref.flowId) return shape.refuse("project.record_identity", "record.buildId");
  const taskSpecs = shape.array(fields.taskSpecs, "record.taskSpecs", LIMITS.revisions).map((item, index) => {
    const entry = shape.object(item, `record.taskSpecs.${index}`, ["revision", "recordedAt", "taskSpec"]);
    if (entry.revision !== index + 1) return shape.refuse("project.record_revision", `record.taskSpecs.${index}.revision`);
    return { revision: index + 1, recordedAt: shape.count(entry.recordedAt, `record.taskSpecs.${index}.recordedAt`), taskSpec: unwrap(automationStudioProjectTaskSpec.parse(entry.taskSpec)) };
  });
  const plans = shape.array(fields.plans, "record.plans", LIMITS.revisions).map((item, index) => {
    const entry = shape.object(item, `record.plans.${index}`, ["revision", "recordedAt", "plan"]);
    if (entry.revision !== index + 1) return shape.refuse("project.record_revision", `record.plans.${index}.revision`);
    const plan = unwrap(automationStudioProjectStructurePlan.parse(entry.plan));
    const taskSpec = taskSpecs.find((candidate) => candidate.taskSpec.digest === plan.taskSpecDigest)?.taskSpec;
    if (!taskSpec) return shape.refuse("project.plan_task_spec_stale", `record.plans.${index}.plan.taskSpecDigest`);
    firstIssue(automationStudioProjectStructurePlan.issues(plan, taskSpec));
    return { revision: index + 1, recordedAt: shape.count(entry.recordedAt, `record.plans.${index}.recordedAt`), plan };
  });
  const briefs = shape.array(fields.briefs, "record.briefs", LIMITS.briefs).map((item, index) => {
    const entry = shape.object(item, `record.briefs.${index}`, ["recordedAt", "brief"]);
    const brief = unwrap(automationStudioProjectSubflowBrief.parse(entry.brief));
    const plan = plans.find((candidate) => candidate.plan.digest === brief.planDigest)?.plan;
    if (!plan) return shape.refuse("project.brief_plan_stale", `record.briefs.${index}.brief.planDigest`);
    const taskSpec = taskSpecs.find((candidate) => candidate.taskSpec.digest === plan.taskSpecDigest)!.taskSpec;
    firstIssue(automationStudioProjectSubflowBrief.issues(brief, plan, taskSpec));
    return { recordedAt: shape.count(entry.recordedAt, `record.briefs.${index}.recordedAt`), brief };
  });
  const briefIds = briefs.map((entry) => entry.brief.briefId);
  if (new Set(briefIds).size !== briefIds.length) return shape.refuse("project.duplicate_brief", "record.briefs");
  const knownBrief = (id: unknown, at: string): string => {
    const briefId = shape.storageId(id, at);
    return briefIds.includes(briefId) ? briefId : shape.refuse("project.brief_unknown", at);
  };
  const record: AutomationStudioProjectBuildRecord = {
    kind: "project_build_record",
    schemaVersion: 1,
    buildId: shape.storageId(fields.buildId, "record.buildId"),
    projectId: shape.id(fields.projectId, "record.projectId"),
    flowId: shape.id(fields.flowId, "record.flowId"),
    instructionDigest: shape.digest(fields.instructionDigest, "record.instructionDigest"),
    sourceIds: shape.ids(fields.sourceIds, "record.sourceIds", LIMITS.sources),
    createdAt: shape.count(fields.createdAt, "record.createdAt"),
    updatedAt: shape.count(fields.updatedAt, "record.updatedAt"),
    taskSpecs,
    plans,
    briefs,
    receipts: shape.array(fields.receipts, "record.receipts", LIMITS.entries).map((item, index) => {
      const at = `record.receipts.${index}`;
      const entry = shape.object(item, at, ["recordedAt", "receipt"], ["briefId"]);
      const receipt = { recordedAt: shape.count(entry.recordedAt, `${at}.recordedAt`), receipt: readAutomationStudioProjectReceiptRef(entry.receipt, `${at}.receipt`) };
      return entry.briefId === undefined ? receipt : { recordedAt: receipt.recordedAt, briefId: knownBrief(entry.briefId, `${at}.briefId`), receipt: receipt.receipt };
    }),
    allowances: shape.array(fields.allowances, "record.allowances", LIMITS.entries).map((item, index) => {
      const at = `record.allowances.${index}`;
      const entry = shape.object(item, at, ["recordedAt", "role", "usd"], ["briefId"]);
      const role = shape.oneOf(entry.role, `${at}.role`, AUTOMATION_STUDIO_PROJECT_AGENT_ROLES);
      const allowance = { recordedAt: shape.count(entry.recordedAt, `${at}.recordedAt`), role, usd: shape.amount(entry.usd, `${at}.usd`) };
      if ((role === "supervisor") !== (entry.briefId === undefined)) return shape.refuse("project.allowance_brief", `${at}.briefId`);
      return entry.briefId === undefined ? allowance : { recordedAt: allowance.recordedAt, role, briefId: knownBrief(entry.briefId, `${at}.briefId`), usd: allowance.usd };
    }),
    lastingActs: shape.array(fields.lastingActs, "record.lastingActs", LIMITS.entries).map((item, index) => {
      const at = `record.lastingActs.${index}`;
      const entry = shape.object(item, at, ["recordedAt", "briefId", "consequence", "description"]);
      const briefId = knownBrief(entry.briefId, `${at}.briefId`);
      const consequence = shape.oneOf(entry.consequence, `${at}.consequence`, AUTOMATION_STUDIO_ACTION_CONSEQUENCES);
      if (!briefs.find((candidate) => candidate.brief.briefId === briefId)!.brief.permittedActs.includes(consequence)) return shape.refuse("project.act_not_permitted", `${at}.consequence`);
      return { recordedAt: shape.count(entry.recordedAt, `${at}.recordedAt`), briefId, consequence, description: shape.text(entry.description, `${at}.description`, 500) };
    }),
    decisions: shape.array(fields.decisions, "record.decisions", LIMITS.entries).map((item, index) => {
      const entry = shape.object(item, `record.decisions.${index}`, ["recordedAt", "entry"]);
      return { recordedAt: shape.count(entry.recordedAt, `record.decisions.${index}.recordedAt`), entry: unwrap(automationStudioProjectDecisionLogEntry.parse(entry.entry)) };
    })
  };
  if (fields.ending !== undefined) {
    const ending = shape.object(fields.ending, "record.ending", ["outcome", "reason", "at"]);
    record.ending = { outcome: shape.oneOf(ending.outcome, "record.ending.outcome", AUTOMATION_STUDIO_PROJECT_BUILD_ENDINGS), reason: shape.text(ending.reason, "record.ending.reason", 2000), at: shape.count(ending.at, "record.ending.at") };
  }
  return record;
}

function unwrap<T>(parsed: AutomationStudioProjectParse<T>): T {
  return parsed.status === "valid" ? parsed.value : shape.refuse(parsed.code, parsed.path);
}

function firstIssue(issues: Array<{ code: string; path: string }>): void {
  const first = issues[0];
  if (first) shape.refuse(first.code, first.path);
}
