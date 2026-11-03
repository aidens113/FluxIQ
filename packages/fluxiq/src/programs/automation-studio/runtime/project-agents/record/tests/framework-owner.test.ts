import { expect, it } from "vitest";
import * as legacy from "../index.ts";
import * as contracts from "../../contracts/index.ts";
import * as completion from "../../record-completion/index.ts";
import * as canonical from "../../../../../../runtime/flow-authoring/project/record/index.ts";
import * as readers from "../../../../../../runtime/flow-authoring/project/contracts/index.ts";
import * as writes from "../../../../../../runtime/flow-authoring/execution/write-completion/index.ts";
import * as data from "../../../../../../flows/authoring/project/index.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../../../../framework/persistence/paths/index.ts";

it("keeps one original class, parser, enum and receipt authority across canonical and legacy imports", () => {
  expect(legacy.AutomationStudioProjectBuildRecordStore).toBe(canonical.AutomationStudioProjectBuildRecordStore);
  expect(legacy.AutomationStudioProjectBuildDocuments).toBe(canonical.AutomationStudioProjectBuildDocuments);
  expect(legacy.AutomationStudioProjectRecordRefusal).toBe(canonical.AutomationStudioProjectRecordRefusal);
  expect(legacy.automationStudioProjectBuildRecordParser).toBe(canonical.automationStudioProjectBuildRecordParser);
  expect(legacy.AUTOMATION_STUDIO_PROJECT_BUILD_ENDINGS).toBe(data.AUTOMATION_STUDIO_PROJECT_BUILD_ENDINGS);
  expect(contracts.AUTOMATION_STUDIO_PROJECT_AGENT_ROLES).toBe(data.AUTOMATION_STUDIO_PROJECT_AGENT_ROLES);
  expect(contracts.automationStudioProjectTaskSpec).toBe(readers.automationStudioProjectTaskSpec);
  expect(contracts.automationStudioProjectBuilderReturn).toBe(readers.automationStudioProjectBuilderReturn);
  expect(completion.AutomationStudioProjectWriteCompletion).toBe(writes.AutomationStudioProjectWriteCompletion);
  expect(completion.invokeAutomationStudioProjectWriteCallback).toBe(writes.invokeAutomationStudioProjectWriteCallback);
  const error = new canonical.AutomationStudioProjectRecordRefusal("project.refused", "record.plan");
  expect(error.name).toBe("AutomationStudioProjectRecordRefusal");
  expect(error.message).toBe("project.refused at record.plan");
});

it("preserves canonical digest bytes, ordering and omitted optional fields", () => {
  const expected = "f3e70820019fe18b0ae26dbb5ef209424232fa93d2db120a88353b8976ebd69a";
  expect(readers.automationStudioProjectDigest("project.test.v1", { z: 1, a: [{ b: true, a: "bytes" }], absent: undefined })).toBe(expected);
  expect(contracts.automationStudioProjectDigest("project.test.v1", { a: [{ a: "bytes", b: true }], z: 1 })).toBe(expected);
});

it("uses the same real rootless store through both imports and retains complete toggle fields", async () => {
  const projects = new AutomationStudioProjectPaths(undefined);
  const store = new legacy.AutomationStudioProjectBuildRecordStore(projects, new AutomationStudioFlowPaths(projects), { now: () => 123 });
  const ref = { projectId: "project.original", flowId: "flow.original", buildId: "build.original" };
  await store.create({ ...ref, instructionDigest: "d".repeat(64), sourceIds: ["instruction.original"] });
  const toggle = {
    from: "trial" as const, node: "example.press", handles: [], trialNodes: ["step.original"],
    trialParameters: { choice: "kept" }, signature: { selected: true }, beforeSignature: { selected: false }, idempotentWith: "example.ensure"
  };
  await store.recordToggle(ref, toggle);
  const view = await canonical.AutomationStudioProjectBuildRecordStore.prototype.read.call(store, ref);
  expect(view?.record).toMatchObject({ kind: "project_build_record", schemaVersion: 1, ...ref, sourceIds: ["instruction.original"], toggles: [{ recordedAt: 123, ...toggle }] });
  expect(view?.returns).toEqual([]);
});
