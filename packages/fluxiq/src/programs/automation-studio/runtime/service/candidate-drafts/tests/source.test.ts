import { expect, it } from "vitest";
import { candidateSourceFixture as fixture } from "./fixtures.ts";
import { AutomationStudioCandidateSource as Source } from "../source.ts";
import { automationStudioCandidateFingerprint as fingerprint } from "../../../flow-bootstrap/candidate/index.ts";
import { resolveAutomationStudioLlmInstructions } from "../../../llm/index.ts";

it("retains full originals and explicit inapplicable exclusions with immutable bytes", () => {
  const original = fixture.instruction(), excluded = fixture.instruction({ instructionId: "instruction.other", scope: { kind: "flow", projectId: "project.other", flowId: "flow.other" } });
  const binding = fixture.binding([original, excluded]);
  original.body = "caller mutation";
  expect(binding.originalSources.effectiveInstructionIds).toEqual(["instruction.original"]);
  expect(binding.originalSources.excludedInstructionIds).toEqual(["instruction.other"]);
  expect(binding.originalSources.instructions[0]).toMatchObject({ createdAt: 2, updatedAt: 3, metadata: { retained: ["full", 1] }, tags: ["generation"] });
  expect(Source.text(binding)).toBe(" Original title \nCreate a deterministic Start to End Flow.\nKeep every original clause.");
  expect(Object.isFrozen(binding.originalSources.instructions[0]?.scope)).toBe(true);
  expect(Source.validate(binding)).toEqual(binding);
});
it("refuses missing/duplicate/inactive owner reads and dropped resolution originals", () => {
  const original = fixture.instruction(), base = { projectId: "project.1", flowId: "flow.1", inventoryInstructionIds: [original.instructionId], instructions: [original] };
  for (const changed of [{ inventoryInstructionIds: [original.instructionId, "missing"] }, { instructions: [original, original] }, { instructions: [{ ...original, status: "archived" as const }] }, { resolution: { ...resolveAutomationStudioLlmInstructions(base), instructionIds: [], instructions: [] } }]) expect(() => Source.capture({ ...base, ...changed })).toThrow();
});
it("does not use an ID prefix to discard an original domain instruction", () => {
  const original = fixture.instruction({ instructionId: "core.domain.original" });
  expect(fixture.binding([original]).originalSources.effectiveInstructionIds).toEqual([original.instructionId]);
});
it("changes byte binding for ID/scope/timestamp/metadata changes without inventing revisions", () => {
  const digest = fixture.binding().originalInstructionsDigest;
  for (const changed of [{ instructionId: "other" }, { updatedAt: 4 }, { metadata: { retained: "changed" } }, { scope: { kind: "global" as const } }]) expect(fixture.binding([fixture.instruction(changed)]).originalInstructionsDigest).not.toBe(digest);
  expect(fixture.binding().originalSources.instructions[0]).not.toHaveProperty("revision");
});
it("refuses forged effective/excluded sets even when caller recomputes source hash", () => {
  const binding = structuredClone(fixture.binding());
  binding.originalSources.effectiveInstructionIds = [];
  binding.originalInstructionsDigest = fingerprint.source(binding.originalSources);
  expect(() => Source.validate(binding)).toThrow();
});
it("refuses getter/symbol/undefined source values without invoking accessors", () => {
  let calls = 0;
  const binding = fixture.binding();
  const getter = { get originalSources() { calls++; return binding.originalSources; }, originalInstructionsDigest: binding.originalInstructionsDigest };
  expect(() => Source.validate(getter)).toThrow();
  expect(calls).toBe(0);
  expect(() => Source.validate({ ...binding, [Symbol("authority")]: true })).toThrow();
  expect(() => Source.capture({ projectId: "project.1", flowId: "flow.1", inventoryInstructionIds: ["instruction.original"], instructions: [fixture.instruction({ metadata: { value: undefined } as never })] })).toThrow();
});
it("full candidate record detects executable derivation and original byte tampering", () => {
  const valid = fixture.record();
  expect(Source.record(valid, valid.projectId, valid.flowId)).toEqual({ status: "valid", record: valid });
  const changed = structuredClone(valid); changed.candidate.buildPlan.subflows[0]!.nodes[0]!.position.x += 1;
  expect(Source.record(changed, valid.projectId, valid.flowId)).toMatchObject({ status: "invalid" });
  const source = structuredClone(valid); source.originalSources.instructions[0]!.body = "changed";
  expect(Source.record(source, valid.projectId, valid.flowId)).toMatchObject({ status: "invalid" });
});
