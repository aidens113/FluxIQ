import { expect, it, vi } from "vitest";
import type { AutomationStudioFlowBuildPlan } from "../../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { candidateSourceFixture as fixture } from "../../../candidate-drafts/tests/fixtures.ts";
import type { AutomationStudioAnswerFirstSourceRead } from "../source-authority.ts";
import { automationStudioAnswerFirstExecutionIdentity } from "../execution-identity.ts";

function setup() {
  const record = fixture.record(), reference = fixture.reference(record), buildPlan = structuredClone(record.candidate.buildPlan);
  const basis: AutomationStudioAnswerFirstSourceRead = structuredClone({ status: "bound", reference, record });
  const read = vi.fn(async (): Promise<AutomationStudioAnswerFirstSourceRead> => structuredClone({ status: "bound", reference, record }));
  const currentBaseDigest = vi.fn(async () => "base");
  const input = { projectId: record.projectId, flowId: record.flowId, candidateId: record.candidateId, authority: { read }, basis, buildPlan, currentBaseDigest };
  return { record, reference, buildPlan, read, currentBaseDigest, input };
}

it("keeps only the existing reference after exact before/after executable equality", async () => {
  const { input, read, reference } = setup();
  const started = await automationStudioAnswerFirstExecutionIdentity(input);
  const result = await started.finish("base");
  expect(result).toEqual({ status: "bound", reference });
  expect(read).toHaveBeenCalledOnce();
  expect(read).toHaveBeenCalledWith(reference.candidateId, reference);
  expect(result).not.toHaveProperty("record");
  expect(result).not.toHaveProperty("buildPlan");
  if (result.status === "bound") {
    result.reference.candidateId = "consumer mutation";
    expect(reference.candidateId).toBe("candidate.1");
  }
});

const mutate = (plan: AutomationStudioFlowBuildPlan, change: Record<string, unknown>) => Object.assign(plan.plan.subflows[0]!.nodes[0]!, change);

it.each([
  ["resolved predicate", (plan: AutomationStudioFlowBuildPlan) => mutate(plan, { parameters: { where: [{ field: "price", before: 10 }] } })],
  ["projected reader", (plan: AutomationStudioFlowBuildPlan) => mutate(plan, { parameters: { fields: { title: { kind: "text", selector: ".changed" } } } })],
  ["input binding", (plan: AutomationStudioFlowBuildPlan) => mutate(plan, { bindings: { value: { source: "flow_input", input: "other" } } })],
  ["pinned child version", (plan: AutomationStudioFlowBuildPlan) => mutate(plan, { subflow: { flowId: "child", version: "2.0.0" } })],
  ["routing", (plan: AutomationStudioFlowBuildPlan) => { plan.plan.router.name = "Changed routing"; }],
  ["layout executable", (plan: AutomationStudioFlowBuildPlan) => { plan.subflows[0]!.nodes[0]!.position.x += 1; }],
  ["authored subflow name", (plan: AutomationStudioFlowBuildPlan) => { plan.plan.subflows[0]!.name = "Different completion wording"; }],
  ["risk", (plan: AutomationStudioFlowBuildPlan) => { plan.risk = "high"; }]
] as const)("does not normalize away a changed %s", async (_name, change) => {
  const { input, read } = setup();
  change(input.buildPlan);
  expect(await (await automationStudioAnswerFirstExecutionIdentity(input)).finish("base")).toEqual({ status: "unknown", code: "executable_changed" });
  expect(read).not.toHaveBeenCalled();
});

it("snapshots the carried source A before awaiting anything and never selects a new initial source", async () => {
  const { input, reference, read } = setup();
  const pending = automationStudioAnswerFirstExecutionIdentity(input);
  if (input.basis.status !== "bound") throw new Error("Expected carried source A");
  input.basis.reference.revision = 2;
  input.basis.record.candidate.revision = 2;
  const started = await pending;
  expect(read).not.toHaveBeenCalled();
  expect(await started.finish("base")).toEqual({ status: "bound", reference });
  expect(read).toHaveBeenCalledWith(reference.candidateId, reference);
});

it("cannot upgrade an initially unknown basis when authority later becomes available", async () => {
  const { input, read, currentBaseDigest } = setup();
  const started = await automationStudioAnswerFirstExecutionIdentity({ ...input, basis: { status: "unknown", code: "source_unbound" } });
  expect(await started.finish("base")).toEqual({ status: "unknown", code: "source_unbound" });
  expect(read).not.toHaveBeenCalled();
  expect(currentBaseDigest).not.toHaveBeenCalled();
});

it("refuses a live plan changed while authority was read or while the run was executing", async () => {
  const first = setup(), original = first.read.getMockImplementation()!;
  first.read.mockImplementation(async () => {
    const result = await original();
    first.buildPlan.plan.subflows[0]!.name = "changed during source read";
    return result;
  });
  expect(await (await automationStudioAnswerFirstExecutionIdentity(first.input)).finish("base")).toEqual({ status: "unknown", code: "executable_changed" });
  const later = setup(), started = await automationStudioAnswerFirstExecutionIdentity(later.input);
  later.buildPlan.plan.subflows[0]!.name = "changed during execution";
  expect(await started.finish("base")).toEqual({ status: "unknown", code: "executable_changed" });
});

it.each([{ candidateId: "other" }, { revision: 2 }, { digest: "b".repeat(64) }, { baseDependencyDigest: "other" }, { baseSettingsRevision: 2 }, { originalInstructionsDigest: "b".repeat(64) }])("refuses a different after-run reference %j", async changed => {
  const { input, read, reference, record } = setup(), started = await automationStudioAnswerFirstExecutionIdentity(input);
  read.mockResolvedValue({ status: "bound", reference: { ...reference, ...changed }, record });
  expect(await started.finish("base")).toEqual({ status: "unknown", code: "source_stale" });
});

it("rejects a different stored executable even if a port incorrectly retains its reference", async () => {
  const { input, read, record, reference } = setup(), started = await automationStudioAnswerFirstExecutionIdentity(input);
  record.candidate.buildPlan.plan.subflows[0]!.name = "changed stored executable";
  read.mockResolvedValue({ status: "bound", reference, record });
  expect(await started.finish("base")).toEqual({ status: "unknown", code: "executable_changed" });
});

it("checks the engine's actual dependency basis and its freshness", async () => {
  const first = setup();
  expect(await (await automationStudioAnswerFirstExecutionIdentity(first.input)).finish("other")).toEqual({ status: "unknown", code: "binding_changed" });
  const later = setup(), started = await automationStudioAnswerFirstExecutionIdentity(later.input);
  later.currentBaseDigest.mockResolvedValue("changed");
  expect(await started.finish("base")).toEqual({ status: "unknown", code: "binding_changed" });
});

it("keeps missing/unknown/error authority closed and does not read extra engine state for legacy ports", async () => {
  const { input, currentBaseDigest, read } = setup();
  expect(await (await automationStudioAnswerFirstExecutionIdentity({ ...input, authority: undefined })).finish("base")).toEqual({ status: "unknown", code: "authority_missing" });
  expect(await (await automationStudioAnswerFirstExecutionIdentity({ ...input, candidateId: undefined })).finish("base")).toEqual({ status: "unknown", code: "candidate_missing" });
  read.mockResolvedValue({ status: "unknown", code: "source_unbound" });
  expect(await (await automationStudioAnswerFirstExecutionIdentity(input)).finish("base")).toEqual({ status: "unknown", code: "source_unbound" });
  const malformed: AutomationStudioAnswerFirstSourceRead = { status: "unknown", code: "unavailable" };
  Reflect.set(malformed, "code", "private owner words");
  read.mockResolvedValue(malformed);
  expect(await (await automationStudioAnswerFirstExecutionIdentity(input)).finish("base")).toEqual({ status: "unknown", code: "unavailable" });
  read.mockRejectedValue(new Error("private original content"));
  expect(await (await automationStudioAnswerFirstExecutionIdentity(input)).finish("base")).toEqual({ status: "unknown", code: "unavailable" });
  expect(currentBaseDigest).not.toHaveBeenCalled();
});

it("requires every after-run authority read to stay bound", async () => {
  const { input, read } = setup(), started = await automationStudioAnswerFirstExecutionIdentity(input);
  read.mockResolvedValue({ status: "unknown", code: "source_stale" });
  expect(await started.finish("base")).toEqual({ status: "unknown", code: "source_stale" });
});
