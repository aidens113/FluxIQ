// @fluxiq-test-group real-sql
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import { AutomationStudioProjectBuildRecordStore } from "../../../project-agents/index.ts";
import { AutomationStudioProjectWriteCompletion, invokeAutomationStudioProjectWriteCallback } from "../../../project-agents/record-completion/index.ts";
import { queuedWriterFixture } from "../../../project-agents/record-completion/tests/fixture.ts";
import { brief, sources, structurePlan, taskSpec } from "../../../project-agents/tests/fixtures.ts";
import { sqlAdmissionAuthority, sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import { AutomationStudioProjectBuildActsRecord } from "../acts-record.ts";
import { automationStudioProjectBuildResetCalls } from "../reset-calls.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER } from "../supervisor-ledger.ts";

const ref = { projectId: "project.isolated", flowId: "flow.actual", buildId: "build.actual" };
const acts = [{ step: 1, definitionId: "example.press", label: "Reserve", consequences: ["create_new" as const] }];

async function planned(root: string) {
  await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
  const projects = new AutomationStudioProjectPaths(path.join(root, "programs", "automation-studio", "projects"));
  const flows = new AutomationStudioFlowPaths(projects);
  const records = new AutomationStudioProjectBuildRecordStore(projects, flows);
  await records.create({ ...ref, instructionDigest: "e".repeat(64), sourceIds: ["instruction.1"] });
  await records.recordTaskSpec(ref, taskSpec(), sources());
  await records.recordPlan(ref, structurePlan());
  const builder = brief();
  await records.recordBrief(ref, builder);
  return { projects, flows, records, builder };
}

it("uses the original records receiver/method pinned at bind and flushes the real Store before clear", async () => sqlAdmissionFixture(async sql => {
  const { projects, flows, records, builder } = await planned(sql.root);
  const project = new AutomationStudioSiteResetProjectLedger();
  const writer = AutomationStudioProjectBuildActsRecord.of(project);
  writer.bind(records, ref);
  project.forBrief(builder.briefId).trialRan(acts, "trial.actual");
  let replacementCalls = 0;
  records.recordLastingAct = async () => { replacementCalls++; };
  const f = await queuedWriterFixture(sql.store, "owned.acts:" + sql.root);
  const invocation = Object.freeze({});
  await expect(f.run({ receiver: writer, callback: writer.trialRanAndFlushed, args: [acts, "trial.actual", invocation] }, invocation)).resolves.toBeUndefined();
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  expect(f.released()).toBe(true);
  expect(replacementCalls).toBe(0);
  const record = (await new AutomationStudioProjectBuildRecordStore(projects, flows).read(ref))!.record;
  expect(record.lastingActs).toMatchObject([{ act: "act-1", owner: { role: "builder", briefId: builder.briefId }, consequences: ["create_new"] }]);
  expect(writer.unrecorded()).toEqual([]);
}));

it("keeps the actual queued writer and root open while an authenticated original records callback is held", async () => sqlAdmissionFixture(async sql => {
  const { records } = await planned(sql.root);
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  let calls = 0;
  const owned = {
    read: records.read.bind(records),
    recordLastingAct(...args: Parameters<AutomationStudioProjectBuildRecordStore["recordLastingAct"]>): Promise<void> {
      expect(this).toBe(owned);
      expect(args[0]).toBe(ref);
      const frame = AutomationStudioProjectWriteCompletion.capture(args[2]);
      const work = async () => {
        calls++;
        started();
        await held;
        const child = Object.freeze({});
        await invokeAutomationStudioProjectWriteCallback(frame, { receiver: records, callback: records.recordLastingAct, args: [args[0], args[1], child] }, child);
      };
      const returned = work().then(() => { completion.completed(returned, frame, { disposition: "settled", completionDigest: "fixture.owned_record.ack", assessmentDigest: "fixture.real_store.completed" }); });
      return returned;
    }
  };
  const completion = AutomationStudioProjectWriteCompletion.for(owned, owned.recordLastingAct);
  const project = new AutomationStudioSiteResetProjectLedger();
  const writer = AutomationStudioProjectBuildActsRecord.of(project);
  writer.bind(owned, ref);
  project.forBrief(AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER).trialRan(acts, "trial.held");
  const f = await queuedWriterFixture(sql.store, "owned.acts:" + sql.root);
  const invocation = Object.freeze({});
  const running = f.run({ receiver: writer, callback: writer.trialRanAndFlushed, args: [acts, "trial.held", invocation] }, invocation);
  await entered;
  expect(calls).toBe(1);
  expect(f.released()).toBe(false);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  expect((await records.read(ref))!.record.lastingActs).toEqual([]);
  release();
  await running;
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  expect(f.released()).toBe(true);
  expect((await records.read(ref))!.record.lastingActs).toHaveLength(1);
}));

it("keeps a fulfilled injected records callback unknown and refuses another actual write", async () => sqlAdmissionFixture(async sql => {
  const { records } = await planned(sql.root);
  let calls = 0;
  const unsupported = {
    read: records.read.bind(records),
    recordLastingAct(...args: Parameters<AutomationStudioProjectBuildRecordStore["recordLastingAct"]>) {
      expect(this).toBe(unsupported);
      calls++;
      return records.recordLastingAct(...args);
    }
  };
  const project = new AutomationStudioSiteResetProjectLedger();
  const writer = AutomationStudioProjectBuildActsRecord.of(project);
  writer.bind(unsupported, ref);
  project.forBrief(AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER).trialRan(acts, "trial.unknown");
  const resource = "owned.acts:" + sql.root;
  const f = await queuedWriterFixture(sql.store, resource);
  const invocation = Object.freeze({});
  await expect(f.run({ receiver: writer, callback: writer.trialRanAndFlushed, args: [acts, "trial.unknown", invocation] }, invocation)).resolves.toBeUndefined();
  expect(calls).toBe(1);
  expect((await records.read(ref))!.record.lastingActs).toHaveLength(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  const next = await sqlAdmissionAuthority(sql.store, { series: true, resources: [resource], epoch: "epoch.new", runId: "run.new" });
  await expect(next.assembly.consumer.reserve(next.scope, next.grant)).rejects.toThrow("execution_blocked");
  expect(calls).toBe(1);
}));

it("awaits both original reset and record facades before acknowledging the actual exploration write", async () => sqlAdmissionFixture(async sql => {
  const { records, builder, projects, flows } = await planned(sql.root);
  const project = new AutomationStudioSiteResetProjectLedger();
  const writer = AutomationStudioProjectBuildActsRecord.of(project);
  writer.bind(records, ref);
  const routed = automationStudioProjectBuildResetCalls(project, project.forBrief(builder.briefId));
  const calls = writer.calls(routed);
  const explored = { callId: "call.actual", toolId: "core.run_node", landed: true, declared: { permitted: true, effect: "mutate" as const, consequences: ["create_new" as const], control: { name: "Reserve", kind: "button" }, verb: "press" } };
  const f = await queuedWriterFixture(sql.store, "owned.acts-facade:" + sql.root);
  await expect(f.run({ receiver: calls, callback: calls.explored, args: [explored] }, calls)).resolves.toBeUndefined();
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  expect(f.released()).toBe(true);
  const reopened = await new AutomationStudioProjectBuildRecordStore(projects, flows).read(ref);
  expect(reopened?.record.lastingActs).toMatchObject([{ act: "act-1", owner: { role: "builder", briefId: builder.briefId }, consequences: ["create_new"] }]);
  expect(writer.unrecorded()).toEqual([]);
}));

it("does not grant a supplied original claim callback a Core completion contract", async () => sqlAdmissionFixture(async sql => {
  const project = new AutomationStudioSiteResetProjectLedger();
  const own = project.forBrief("builder.actual");
  let writes = 0;
  const supplied = {
    claim(undoes: unknown) {
      expect(this).toBe(supplied);
      expect(undoes).toBe("act.actual");
      writes++;
      return { kind: "none" as const };
    },
    target: own.target.bind(own),
    explored: own.explored.bind(own)
  };
  const calls = AutomationStudioProjectBuildActsRecord.of(project).calls(supplied);
  const resource = "owned.acts-unsupported-claim:" + sql.root;
  const f = await queuedWriterFixture(sql.store, resource);
  await expect(f.run({ receiver: calls, callback: calls.claim, args: ["act.actual", undefined] }, calls)).resolves.toEqual({ kind: "none" });
  expect(writes).toBe(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  const next = await sqlAdmissionAuthority(sql.store, { series: true, resources: [resource], epoch: "epoch.next", runId: "run.next" });
  await expect(next.assembly.consumer.reserve(next.scope, next.grant)).rejects.toThrow("execution_blocked");
  expect(writes).toBe(1);
}));
