// @fluxiq-test-group real-sql
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { AutomationStudioExploredToggles } from "../../../flow-bootstrap/index.ts";
import { AutomationStudioProjectBuildRecordStore } from "../../../project-agents/index.ts";
import { queuedWriterFixture } from "../../../project-agents/record-completion/tests/fixture.ts";
import { sqlAdmissionFixture } from "../../../../storage/project/execution-admission/tests/fixture.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import { AutomationStudioProjectBuildTogglesRecord } from "../index.ts";

it("flushes the real queued toggle write before its observed original Promise closes the root", async () => sqlAdmissionFixture(async sql => {
  await writeFile(path.join(sql.root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
  const projects = new AutomationStudioProjectPaths(path.join(sql.root, "programs", "automation-studio", "projects"));
  const flows = new AutomationStudioFlowPaths(projects);
  const records = new AutomationStudioProjectBuildRecordStore(projects, flows);
  const ref = { projectId: "project.isolated", flowId: "flow.actual", buildId: "build.actual" };
  await records.create({ ...ref, instructionDigest: "e".repeat(64), sourceIds: ["instruction.1"] });
  const toggles = new AutomationStudioExploredToggles();
  const writer = AutomationStudioProjectBuildTogglesRecord.of(toggles);
  writer.bind(records, ref);
  toggles.explored(
    { callId: "actual.press", toolId: "core.run_node", value: { node: "example.press", parameters: { target: { handle: "control.1" } }, consequences: ["modify_existing"] } },
    { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, outputs: { toggle: { signature: { state: "selected" } } }, draft: { actionId: "example.press", ranWith: { node: "example.press", parameters: { target: { id: "opaque.control" } } } } }
  );
  expect(toggles.list()).toHaveLength(1);
  const f = await queuedWriterFixture(sql.store, "owned.toggles:" + sql.root);
  const invocation = Object.freeze({});
  await expect(f.run({ receiver: writer, callback: writer.syncAndFlushed, args: [invocation] }, invocation)).resolves.toBeUndefined();
  expect((await f.assembly.consumer.inspect(f.scope)).state).toBe("clear");
  expect(f.released()).toBe(true);
  const fresh = await new AutomationStudioProjectBuildRecordStore(projects, flows).read(ref);
  expect(fresh?.record.toggles).toMatchObject([{ from: "explored", node: "example.press", callId: "actual.press", handles: ["control.1"], signature: { state: "selected" } }]);
  expect(writer.unrecorded()).toEqual([]);
}));
