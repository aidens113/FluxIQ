// @fluxiq-test-group real-sql
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioProjectBuildDocuments } from "../../../project-agents/record/index.ts";
import { AutomationStudioProjectWriteCompletion, invokeAutomationStudioProjectWriteCallback } from "../../../project-agents/record-completion/index.ts";
import { queuedWriterFixture } from "../../../project-agents/record-completion/tests/fixture.ts";
import { sqlAdmissionAuthority, sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../service/paths/index.ts";
import { AutomationStudioSiteResetCallbackPolicies } from "../../reset-observation/index.ts";
import { AutomationStudioSiteResetProjectLedger, type AutomationStudioSiteResetProjectSnapshot } from "../index.ts";

const ref = { projectId: "project.isolated", flowId: "flow.actual", buildId: "build.actual" };
const acts = [{ step: 1, definitionId: "example.press", label: "Reserve", consequences: ["create_new" as const] }];

it("awaits the original project sink and lexical persist owner through the real SQL document commit", async () => sqlAdmissionFixture(async sql => {
  await writeFile(path.join(sql.root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
  const projects = new AutomationStudioProjectPaths(path.join(sql.root, "programs", "automation-studio", "projects"));
  const documents = new AutomationStudioProjectBuildDocuments(projects, new AutomationStudioFlowPaths(projects));
  const receivers: unknown[] = [];
  let writes = 0;
  const persist = function (this: undefined, snapshot: AutomationStudioSiteResetProjectSnapshot): Promise<void> {
    receivers.push(this);
    const frame = AutomationStudioProjectWriteCompletion.capture(snapshot);
    const change = () => JSON.parse(JSON.stringify(snapshot)) as JsonObject;
    AutomationStudioSiteResetCallbackPolicies.rememberLexical(change, "pure");
    const child = Object.freeze({});
    const returned = invokeAutomationStudioProjectWriteCallback(frame, { receiver: documents, callback: documents.update, args: [ref, "ledger", change, child] }, child).then(() => {
      writes++;
      completion.completed(returned, frame, { disposition: "settled", completionDigest: "fixture.persist.real_commit", assessmentDigest: "fixture.persist.original_document_owner" });
    });
    return returned;
  };
  const completion = AutomationStudioProjectWriteCompletion.for(undefined, persist);
  const project = new AutomationStudioSiteResetProjectLedger({ persist });
  const own = project.forBrief("builder.actual");
  const f = await queuedWriterFixture(sql.store, "owned.project-ledger:" + sql.root);
  const invocation = Object.freeze({});
  await expect(f.run({ receiver: own, callback: own.trialRanObserved, args: [acts, "trial.actual", invocation] }, invocation)).resolves.toMatchObject([{ act: "act-1" }]);
  expect(writes).toBe(1);
  expect(receivers).toEqual([undefined]);
  expect(f.released()).toBe(true);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  expect(await new AutomationStudioProjectBuildDocuments(projects, new AutomationStudioFlowPaths(projects)).read(ref, "ledger")).toEqual(project.snapshot());
}));

it("retains a fulfilled unsupported persist as unknown and blocks another trial on the durable resource", async () => sqlAdmissionFixture(async sql => {
  const saved: AutomationStudioSiteResetProjectSnapshot[] = [];
  const persist = function (this: undefined, snapshot: AutomationStudioSiteResetProjectSnapshot) {
    expect(this).toBeUndefined();
    saved.push(structuredClone(snapshot));
    return Promise.resolve();
  };
  const project = new AutomationStudioSiteResetProjectLedger({ persist });
  const own = project.forBrief("builder.actual");
  const resource = "owned.project-ledger:" + sql.root;
  const f = await queuedWriterFixture(sql.store, resource);
  const invocation = Object.freeze({});
  await expect(f.run({ receiver: own, callback: own.trialRanObserved, args: [acts, "trial.actual", invocation] }, invocation)).resolves.toMatchObject([{ act: "act-1" }]);
  expect(saved).toHaveLength(1);
  expect(saved[0]?.acts).toHaveLength(1);
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("pending");
  const next = await sqlAdmissionAuthority(sql.store, { series: true, resources: [resource], epoch: "epoch.new", runId: "run.new" });
  await expect(next.assembly.consumer.reserve(next.scope, next.grant)).rejects.toThrow("execution_blocked");
  expect(saved).toHaveLength(1);
}));
