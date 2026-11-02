import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../service/paths/index.ts";
import {
  automationStudioProjectBuilderReturn,
  automationStudioProjectDecisionLogEntry,
  automationStudioProjectJsonShape as shape,
  automationStudioProjectStructurePlan,
  automationStudioProjectSubflowBrief,
  automationStudioProjectTaskSpec,
  readAutomationStudioProjectReceiptRef,
  type AutomationStudioProjectAgentRole,
  type AutomationStudioProjectBuilderReturn,
  type AutomationStudioProjectDecisionLogEntry,
  type AutomationStudioProjectInstructionSource,
  type AutomationStudioProjectParse,
  type AutomationStudioProjectReceiptRef,
  type AutomationStudioProjectStructurePlan,
  type AutomationStudioProjectSubflowBrief,
  type AutomationStudioProjectTaskSpec
} from "../contracts/index.ts";
import type { AutomationStudioProjectBuildEnding, AutomationStudioProjectBuildLastingAct, AutomationStudioProjectBuildRecord, AutomationStudioProjectBuildRecordView, AutomationStudioProjectBuildRef, AutomationStudioProjectBuildReturnRecord, AutomationStudioProjectBuildSummary, AutomationStudioProjectBuildToggle } from "./build-record.ts";
import { automationStudioProjectBuildRecordParser as parser } from "./build-record-parser.ts";
import { AutomationStudioProjectBuildDocuments } from "./documents.ts";
import { AutomationStudioProjectRecordRefusal } from "./refusal.ts";
import { AutomationStudioSiteResetCallbackPolicies } from "../../flow-bootstrap/reset-observation/index.ts";
import { AutomationStudioProjectWriteCompletion, invokeAutomationStudioProjectWriteCallback } from "../record-completion/index.ts";

const defaultNow = Date.now;

// The build record store: writes the record as the build proceeds, never at
// the end, and reads it back after a restart.
//
// Every write is parsed and validated before it lands, against the record as
// it stands: a task spec's quotes against the build's own sources, a plan
// against the latest task spec, a brief against the latest plan, a return
// against its brief. Main-file writes are serialized by the documents; a
// return goes to its brief's own file, written once, so builders returning at
// the same time never contend. Once the build has ended its main file takes no
// more writes; a return still lands, because its spend happened.

const MAIN = "build";

export class AutomationStudioProjectBuildRecordStore {
  private readonly documents: AutomationStudioProjectBuildDocuments;
  private readonly now: () => number;
  private readonly readCompletion: AutomationStudioProjectWriteCompletion;
  private readonly actCompletion: AutomationStudioProjectWriteCompletion;
  private readonly toggleCompletion: AutomationStudioProjectWriteCompletion;

  constructor(projects: AutomationStudioProjectPaths, flows: AutomationStudioFlowPaths, options: { now?: () => number } = {}) {
    this.documents = new AutomationStudioProjectBuildDocuments(projects, flows);
    this.now = options.now ?? defaultNow;
    if (this.now === defaultNow) AutomationStudioSiteResetCallbackPolicies.rememberLexical(defaultNow, "pure");
    this.readCompletion = AutomationStudioProjectWriteCompletion.for(this, recordRead);
    this.actCompletion = AutomationStudioProjectWriteCompletion.for(this, recordAct);
    this.toggleCompletion = AutomationStudioProjectWriteCompletion.for(this, recordToggle);
  }

  async create(input: AutomationStudioProjectBuildRef & { instructionDigest: string; sourceIds: string[] }): Promise<AutomationStudioProjectBuildRecord> {
    const ref = refOf(input);
    const at = this.now();
    const created: AutomationStudioProjectBuildRecord = {
      kind: "project_build_record",
      schemaVersion: 1,
      buildId: ref.buildId,
      projectId: ref.projectId,
      flowId: ref.flowId,
      instructionDigest: input.instructionDigest,
      sourceIds: [...input.sourceIds],
      createdAt: at,
      updatedAt: at,
      taskSpecs: [],
      plans: [],
      briefs: [],
      receipts: [],
      allowances: [],
      lastingActs: [],
      decisions: []
    };
    const checked = take(parser.main(created, ref));
    const written = await this.documents.update(ref, MAIN, (current) => {
      if (current !== undefined) throw new AutomationStudioProjectRecordRefusal("project.record_exists", "record.buildId");
      return checked as unknown as JsonObject;
    });
    return take(parser.main(written, ref));
  }

  /** The record and every return written so far, or undefined when there is none. Refuses an edited file. */
  read(input: AutomationStudioProjectBuildRef, invocation?: object): Promise<AutomationStudioProjectBuildRecordView | undefined> {
    const frame = AutomationStudioProjectWriteCompletion.capture(invocation);
    const work = async (): Promise<AutomationStudioProjectBuildRecordView | undefined> => {
      const ref = refOf(input);
      const documents = this.documents;
      const callback = documents.read;
      const read = async (name: string) => {
        const child = Object.freeze({});
        return await invokeAutomationStudioProjectWriteCallback(frame, { receiver: documents, callback, args: [ref, name, child] }, child);
      };
      const stored = await read(MAIN);
      if (stored === undefined) return undefined;
      const record = take(parser.main(stored, ref));
      const returns: AutomationStudioProjectBuildReturnRecord[] = [];
      for (const { brief } of record.briefs) {
        const file = await read(returnName(brief.briefId));
        if (file !== undefined) returns.push(take(parser.returned(file, ref, brief)));
      }
      return { record, returns };
    };
    const returned = work().then(value => {
      this.readCompletion.completed(returned, frame, { disposition: "settled", completionDigest: "project.record.read_completed", assessmentDigest: "project.record.original_documents" });
      return value;
    });
    return returned;
  }

  async summary(input: AutomationStudioProjectBuildRef): Promise<AutomationStudioProjectBuildSummary | undefined> {
    const view = await this.read(input);
    if (!view) return undefined;
    const { record, returns } = view;
    const spec = record.taskSpecs.at(-1);
    const plan = record.plans.at(-1);
    const summary: AutomationStudioProjectBuildSummary = {
      buildId: record.buildId,
      instructionDigest: record.instructionDigest,
      briefs: record.briefs.map(({ brief }) => {
        const returned = returns.find((entry) => entry.briefId === brief.briefId)?.builderReturn;
        const line: AutomationStudioProjectBuildSummary["briefs"][number] = { briefId: brief.briefId, kind: brief.kind, subflowKey: brief.subflowKey, current: brief.planDigest === plan?.plan.digest };
        if (returned) line.returned = { outcome: returned.outcome, reason: returned.reason, spentUsd: returned.spentUsd };
        return line;
      }),
      spentUsd: returns.reduce((total, entry) => total + entry.builderReturn.spentUsd, 0),
      lastingActs: record.lastingActs.length
    };
    if (spec) summary.taskSpec = { revision: spec.revision, digest: spec.taskSpec.digest, parts: spec.taskSpec.parts.length };
    if (plan) summary.plan = { revision: plan.revision, digest: plan.plan.digest, subflows: plan.plan.plan.subflows.map((subflow) => subflow.key) };
    const last = record.decisions.at(-1);
    if (last) summary.lastDecision = last.entry;
    if (record.ending) summary.ending = record.ending;
    return summary;
  }

  /** A task spec revision. Every quote must be a verbatim span of one of this build's sources. */
  async recordTaskSpec(input: AutomationStudioProjectBuildRef, value: unknown, sources: readonly AutomationStudioProjectInstructionSource[]): Promise<AutomationStudioProjectTaskSpec> {
    const taskSpec = take(automationStudioProjectTaskSpec.parse(value));
    return this.change(input, (record, at) => {
      const own = sources.filter((source) => record.sourceIds.includes(source.sourceId));
      refuseFirst(automationStudioProjectTaskSpec.quoteIssues(taskSpec, own));
      record.taskSpecs.push({ revision: record.taskSpecs.length + 1, recordedAt: at, taskSpec });
      return taskSpec;
    });
  }

  /** A structure plan revision, bound to the latest task spec and covering every part. */
  async recordPlan(input: AutomationStudioProjectBuildRef, value: unknown): Promise<AutomationStudioProjectStructurePlan> {
    const plan = take(automationStudioProjectStructurePlan.parse(value));
    return this.change(input, (record, at) => {
      const spec = record.taskSpecs.at(-1)?.taskSpec;
      if (!spec) throw new AutomationStudioProjectRecordRefusal("project.plan_without_task_spec", "structurePlan.taskSpecDigest");
      refuseFirst(automationStudioProjectStructurePlan.issues(plan, spec));
      record.plans.push({ revision: record.plans.length + 1, recordedAt: at, plan });
      return plan;
    });
  }

  /** A brief, bound to the latest structure plan. */
  async recordBrief(input: AutomationStudioProjectBuildRef, value: unknown): Promise<AutomationStudioProjectSubflowBrief> {
    const brief = take(automationStudioProjectSubflowBrief.parse(value));
    return this.change(input, (record, at) => {
      const plan = record.plans.at(-1)?.plan;
      if (!plan) throw new AutomationStudioProjectRecordRefusal("project.brief_without_plan", "brief.planDigest");
      const spec = record.taskSpecs.find((entry) => entry.taskSpec.digest === plan.taskSpecDigest)!.taskSpec;
      refuseFirst(automationStudioProjectSubflowBrief.issues(brief, plan, spec));
      if (record.briefs.some((entry) => entry.brief.briefId === brief.briefId)) throw new AutomationStudioProjectRecordRefusal("project.duplicate_brief", "brief.briefId");
      record.briefs.push({ recordedAt: at, brief });
      return brief;
    });
  }

  /** A builder's return, to its brief's own file, once. */
  async recordReturn(input: AutomationStudioProjectBuildRef, value: unknown): Promise<AutomationStudioProjectBuilderReturn> {
    const ref = refOf(input);
    const builderReturn = take(automationStudioProjectBuilderReturn.parse(value));
    const view = await this.read(ref);
    if (!view) throw new AutomationStudioProjectRecordRefusal("project.record_missing", "record.buildId");
    const brief = view.record.briefs.find((entry) => entry.brief.briefId === builderReturn.briefId)?.brief;
    if (!brief) throw new AutomationStudioProjectRecordRefusal("project.brief_unknown", "return.briefId");
    refuseFirst(automationStudioProjectBuilderReturn.issues(builderReturn, brief));
    const file: AutomationStudioProjectBuildReturnRecord = { kind: "project_builder_return", schemaVersion: 1, buildId: ref.buildId, briefId: brief.briefId, recordedAt: this.now(), builderReturn };
    await this.documents.update(ref, returnName(brief.briefId), (current) => {
      if (current !== undefined) throw new AutomationStudioProjectRecordRefusal("project.return_exists", "return.briefId");
      return file as unknown as JsonObject;
    });
    return builderReturn;
  }

  /** A receipt reference from the supervisor's own trial, or one a brief produced outside its return. */
  async recordReceipt(input: AutomationStudioProjectBuildRef, entry: { briefId?: string; receipt: unknown }): Promise<AutomationStudioProjectReceiptRef> {
    const receipt = take(shape.parse(() => readAutomationStudioProjectReceiptRef(entry.receipt, "receipt")));
    return this.change(input, (record, at) => {
      if (entry.briefId === undefined) record.receipts.push({ recordedAt: at, receipt });
      else record.receipts.push({ recordedAt: at, briefId: knownBrief(record, entry.briefId).briefId, receipt });
      return receipt;
    });
  }

  /** An allowance carved from the Flow purse: the supervisor's reserve has no brief, every other has one. */
  async recordAllowance(input: AutomationStudioProjectBuildRef, entry: { role: AutomationStudioProjectAgentRole; briefId?: string; usd: number }): Promise<void> {
    const usd = take(shape.parse(() => shape.amount(entry.usd, "allowance.usd")));
    await this.change(input, (record, at) => {
      if ((entry.role === "supervisor") !== (entry.briefId === undefined)) throw new AutomationStudioProjectRecordRefusal("project.allowance_brief", "allowance.briefId");
      if (entry.briefId === undefined) record.allowances.push({ recordedAt: at, role: "supervisor", usd });
      else record.allowances.push({ recordedAt: at, role: entry.role, briefId: knownBrief(record, entry.briefId).briefId, usd });
    });
  }

  /**
   * A lasting act of the build, as the project's one ledger recorded it: by
   * the supervisor's whole trials, or by a recorded brief, whatever permitted
   * it -- the brief, or the person's own instruction. Each act id once.
   */
  recordLastingAct(input: AutomationStudioProjectBuildRef, entry: Omit<AutomationStudioProjectBuildLastingAct, "recordedAt">, invocation?: object): Promise<void> {
    const frame = AutomationStudioProjectWriteCompletion.capture(invocation);
    const apply = (record: AutomationStudioProjectBuildRecord, at: number) => {
      if (entry.owner.role !== "supervisor") knownBrief(record, entry.owner.briefId);
      if (record.lastingActs.some((recorded) => recorded.act === entry.act)) throw new AutomationStudioProjectRecordRefusal("project.duplicate", "lastingAct.act");
      // The whole record is validated as it is written (`change`), this entry with it.
      record.lastingActs.push({ recordedAt: at, act: entry.act, owner: structuredClone(entry.owner), consequences: [...entry.consequences], description: entry.description, undoable: entry.undoable });
    };
    AutomationStudioSiteResetCallbackPolicies.rememberLexical(apply, "pure");
    const returned = this.change(input, apply, invocation).then(() => {
      this.actCompletion.completed(returned, frame, { disposition: "settled", completionDigest: "project.record.act_acknowledged", assessmentDigest: "project.record.original_documents" });
    });
    return returned;
  }

  /**
   * A press the domain answered as a toggle, as the build's record of them
   * holds it (t792), so a debug sees what each later step was held to. The
   * whole record is validated as it is written, this entry with it.
   */
  recordToggle(input: AutomationStudioProjectBuildRef, entry: Omit<AutomationStudioProjectBuildToggle, "recordedAt">, invocation?: object): Promise<void> {
    const frame = AutomationStudioProjectWriteCompletion.capture(invocation);
    const apply = (record: AutomationStudioProjectBuildRecord, at: number) => {
      (record.toggles ??= []).push({ ...structuredClone(entry), recordedAt: at });
    };
    AutomationStudioSiteResetCallbackPolicies.rememberLexical(apply, "pure");
    const returned = this.change(input, apply, invocation).then(() => {
      this.toggleCompletion.completed(returned, frame, { disposition: "settled", completionDigest: "project.record.toggle_acknowledged", assessmentDigest: "project.record.original_documents" });
    });
    return returned;
  }

  async recordDecision(input: AutomationStudioProjectBuildRef, value: unknown): Promise<AutomationStudioProjectDecisionLogEntry> {
    const entry = take(automationStudioProjectDecisionLogEntry.parse(value));
    if (entry.kind === "ending") throw new AutomationStudioProjectRecordRefusal("project.ending_through_end", "decision.kind");
    return this.change(input, (record, at) => {
      record.decisions.push({ recordedAt: at, entry });
      return entry;
    });
  }

  /** Ends the build: an `ending` decision and the ending itself, after which the main file is closed. */
  async end(input: AutomationStudioProjectBuildRef, ending: Omit<AutomationStudioProjectBuildEnding, "at">): Promise<AutomationStudioProjectBuildEnding> {
    return this.change(input, (record, at) => {
      const plan = record.plans.at(-1)?.plan;
      const decision = take(automationStudioProjectDecisionLogEntry.parse(plan ? { kind: "ending", reason: ending.reason, briefIds: [], planDigest: plan.digest } : { kind: "ending", reason: ending.reason, briefIds: [] }));
      const ended: AutomationStudioProjectBuildEnding = { outcome: ending.outcome, reason: ending.reason, at };
      record.decisions.push({ recordedAt: at, entry: decision });
      record.ending = ended;
      return ended;
    });
  }

  /** Reads the main file, lets `apply` change it, validates the result whole and writes it. */
  private async change<T>(input: AutomationStudioProjectBuildRef, apply: (record: AutomationStudioProjectBuildRecord, at: number) => T, invocation?: object): Promise<T> {
    const frame = AutomationStudioProjectWriteCompletion.capture(invocation);
    const ref = refOf(input);
    const documents = this.documents;
    const callback = documents.update;
    const now = this.now;
    let result: T | undefined;
    const change = async (current: JsonObject | undefined) => {
      const changing = AutomationStudioProjectWriteCompletion.capture(current);
      if (current === undefined) throw new AutomationStudioProjectRecordRefusal("project.record_missing", "record.buildId");
      const record = take(parser.main(current, ref));
      if (record.ending) throw new AutomationStudioProjectRecordRefusal("project.record_ended", "record.ending");
      const at = await invokeAutomationStudioProjectWriteCallback(changing, { receiver: this, callback: now, args: [] });
      result = await invokeAutomationStudioProjectWriteCallback(changing, { receiver: undefined, callback: apply, args: [record, at] });
      record.updatedAt = at;
      return take(parser.main(record, ref)) as unknown as JsonObject;
    };
    AutomationStudioSiteResetCallbackPolicies.rememberLexical(change, "frame");
    const child = Object.freeze({});
    await invokeAutomationStudioProjectWriteCallback(frame, { receiver: documents, callback, args: [ref, MAIN, change, child] }, child);
    return result as T;
  }
}

const recordRead = AutomationStudioProjectBuildRecordStore.prototype.read;
const recordAct = AutomationStudioProjectBuildRecordStore.prototype.recordLastingAct;
const recordToggle = AutomationStudioProjectBuildRecordStore.prototype.recordToggle;

function refOf(input: AutomationStudioProjectBuildRef): AutomationStudioProjectBuildRef {
  return take(shape.parse(() => ({ projectId: shape.id(input.projectId, "ref.projectId"), flowId: shape.id(input.flowId, "ref.flowId"), buildId: shape.storageId(input.buildId, "ref.buildId") })));
}

function returnName(briefId: string): string {
  return `returns/${briefId}`;
}

function knownBrief(record: AutomationStudioProjectBuildRecord, briefId: string): AutomationStudioProjectSubflowBrief {
  const brief = record.briefs.find((entry) => entry.brief.briefId === briefId)?.brief;
  if (!brief) throw new AutomationStudioProjectRecordRefusal("project.brief_unknown", "briefId");
  return brief;
}

function take<T>(parsed: AutomationStudioProjectParse<T>): T {
  if (parsed.status === "invalid") throw new AutomationStudioProjectRecordRefusal(parsed.code, parsed.path);
  return parsed.value;
}

function refuseFirst(issues: Array<{ code: string; path: string }>): void {
  const first = issues[0];
  if (first) throw new AutomationStudioProjectRecordRefusal(first.code, first.path);
}
