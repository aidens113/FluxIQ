import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { createAutomationStudioFlowExpansionFixture } from "../fixtures.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowAdaptationValidationResult, AutomationStudioFlowChangeOrigin } from "../index.ts";
import {
  parseAutomationStudioFlowChangeOrigin,
  validateAutomationStudioAdaptationPolicy,
  validateAutomationStudioFlowAdaptation,
  validateAutomationStudioFlowChangeProposal,
  validateAutomationStudioFlowInstruction,
  validateAutomationStudioFlowRouter,
  validateAutomationStudioFlowSubflow,
  validateAutomationStudioFlow
} from "../validation.ts";

function adaptationWith(overrides: Partial<AutomationStudioFlowAdaptation>): AutomationStudioFlowAdaptation {
  return { ...createAutomationStudioFlowExpansionFixture().adaptation, ...overrides };
}

function issueCodes(adaptation: AutomationStudioFlowAdaptation): string[] {
  return validateAutomationStudioFlowAdaptation(adaptation).issues.map((issue) => issue.code);
}

function withResult(result: Partial<AutomationStudioFlowAdaptationValidationResult>): AutomationStudioFlowAdaptation {
  const fixture = createAutomationStudioFlowExpansionFixture().adaptation;
  return { ...fixture, validationResults: [{ ...fixture.validationResults![0]!, ...result } as AutomationStudioFlowAdaptationValidationResult] };
}

describe("Flow expansion contracts", () => {
  it("validates the additive router, subflow, instruction, proposal, run, adaptation, and policy fixture", () => {
    const fixture = createAutomationStudioFlowExpansionFixture();

    expect(validateAutomationStudioFlow(fixture.flow)).toEqual({ ok: true, issues: [] });
    expect(validateAutomationStudioFlowRouter(fixture.router, fixture.subflows)).toEqual({ ok: true, issues: [] });
    for (const subflow of fixture.subflows) expect(validateAutomationStudioFlowSubflow(subflow)).toEqual({ ok: true, issues: [] });
    for (const instruction of fixture.instructions) expect(validateAutomationStudioFlowInstruction(instruction)).toEqual({ ok: true, issues: [] });
    expect(validateAutomationStudioFlowChangeProposal(fixture.changeProposal)).toEqual({ ok: true, issues: [] });
    expect(validateAutomationStudioFlowAdaptation(fixture.adaptation)).toEqual({ ok: true, issues: [] });
    expect(validateAutomationStudioAdaptationPolicy(fixture.policy)).toEqual({ ok: true, issues: [] });
  });

  it("rejects route rules that point at missing subflows", () => {
    const fixture = createAutomationStudioFlowExpansionFixture();
    const invalid = {
      ...fixture.router,
      rules: [{ ...fixture.router.rules[0]!, target: { kind: "subflow" as const, subflowId: "missing" } }]
    };

    expect(validateAutomationStudioFlowRouter(invalid, fixture.subflows).issues.map((issue) => issue.code)).toContain("router.rule_unknown_subflow");
  });

  it("rejects empty scoped instruction identifiers", () => {
    const fixture = createAutomationStudioFlowExpansionFixture();
    const invalid = {
      ...fixture.instructions[0]!,
      scope: { kind: "subflow" as const, projectId: fixture.flow.projectId, flowId: fixture.flow.flowId, subflowId: "" }
    };

    expect(validateAutomationStudioFlowInstruction(invalid).issues.map((issue) => issue.code)).toContain("instruction.scope_missing_subflow");
  });

  it("rejects empty change proposal patches", () => {
    const fixture = createAutomationStudioFlowExpansionFixture();
    const invalid = { ...fixture.changeProposal, patches: [] };

    expect(validateAutomationStudioFlowChangeProposal(invalid).issues.map((issue) => issue.code)).toContain("change_proposal.missing_patches");
  });

  it("rejects locked policies that still allow adaptive changes", () => {
    const fixture = createAutomationStudioFlowExpansionFixture();
    const invalid = { ...fixture.policy, preset: "locked" as const, allowRuntimeRecovery: true };

    expect(validateAutomationStudioAdaptationPolicy(invalid).issues.map((issue) => issue.code)).toContain("adaptation_policy.locked_allows_changes");
  });
});

describe("adaptation validation results", () => {
  it("still accepts a result written before kinds and bases existed", () => {
    const fixture = createAutomationStudioFlowExpansionFixture().adaptation;
    expect(fixture.validationResults![0]).not.toHaveProperty("kind");
    expect(validateAutomationStudioFlowAdaptation(fixture)).toEqual({ ok: true, issues: [] });
  });

  it("accepts a trial or a replay, and a success that names its basis", () => {
    expect(issueCodes(withResult({ kind: "trial", basis: ["downstream_assertion", "records"] }))).toEqual([]);
    expect(issueCodes(withResult({ kind: "replay", status: "failed", basis: [] }))).toEqual([]);
  });

  it("rejects a kind that is neither trial nor replay", () => {
    expect(issueCodes(withResult({ kind: "structural" as never }))).toContain("adaptation.validation_invalid_kind");
  });

  it("rejects a status that is neither succeeded nor failed", () => {
    expect(issueCodes(withResult({ status: "pending" as never }))).toContain("adaptation.validation_invalid_status");
  });

  it("rejects a basis that is not a list of distinct codes", () => {
    for (const basis of [["the Save button worked"], [""], ["records", "records"], "records", [7], Array.from({ length: 17 }, (_, index) => `code_${index}`)]) {
      expect(issueCodes(withResult({ basis: basis as never }))).toContain("adaptation.validation_invalid_basis");
    }
  });

  it("rejects a basis on a failed result", () => {
    expect(issueCodes(withResult({ status: "failed", basis: ["expected_state"] }))).toContain("adaptation.validation_basis_without_success");
  });
});

describe("change origin", () => {
  const origins: AutomationStudioFlowChangeOrigin[] = [
    { entryPoint: "instruction", instructionIds: ["instruction.1"] },
    { entryPoint: "run_failure", runId: "run.1", failedNodeId: "node.save", failureSignature: "0123456789abcdef01234567" },
    { entryPoint: "edge_case", instructionIds: ["instruction.1"] },
    { entryPoint: "edge_case", instructionIds: [], runId: "run.1", failureSignature: "sig.1" }
  ];

  it("reads back every valid shape as an equal copy", () => {
    for (const origin of origins) {
      const parsed = parseAutomationStudioFlowChangeOrigin(origin);
      expect(parsed).toEqual(origin);
      expect(parsed).not.toBe(origin);
      if (parsed && "instructionIds" in parsed && "instructionIds" in origin) expect(parsed.instructionIds).not.toBe(origin.instructionIds);
    }
  });

  it("fits in adaptation metadata and survives a JSON round trip", () => {
    for (const origin of origins) {
      const metadata: JsonObject = { origin };
      expect(parseAutomationStudioFlowChangeOrigin(JSON.parse(JSON.stringify(metadata)).origin)).toEqual(origin);
    }
  });

  it("rejects anything that is not exactly one shape", () => {
    const invalid: unknown[] = [
      undefined,
      null,
      "instruction",
      [],
      {},
      { entryPoint: "recording", instructionIds: ["instruction.1"] },
      { entryPoint: "instruction", instructionIds: [] },
      { entryPoint: "instruction", instructionIds: ["instruction.1"], pageText: "Saved: Aurora Field Team" },
      { entryPoint: "instruction", instructionIds: ["instruction.1", "instruction.1"] },
      { entryPoint: "instruction", instructionIds: [" instruction.1"] },
      { entryPoint: "instruction", instructionIds: ["instruction\n1"] },
      { entryPoint: "instruction", instructionIds: Array.from({ length: 65 }, (_, index) => `instruction.${index}`) },
      { entryPoint: "run_failure", runId: "run.1", failedNodeId: "node.save" },
      { entryPoint: "run_failure", runId: "run.1", failedNodeId: "", failureSignature: "sig.1" },
      { entryPoint: "run_failure", runId: "run.1", failedNodeId: "node.save", failureSignature: "s".repeat(513) },
      { entryPoint: "run_failure", runId: "run.1", failedNodeId: "node.save", failureSignature: "sig.1", instructionIds: [] },
      { entryPoint: "edge_case", instructionIds: [] },
      { entryPoint: "edge_case", runId: "run.1" },
      { entryPoint: "edge_case", instructionIds: ["instruction.1"], failureSignature: "sig.1" },
      { entryPoint: "edge_case", instructionIds: ["instruction.1"], runId: 4 },
      { entryPoint: "edge_case", instructionIds: ["instruction.1"], failedNodeId: "node.save" }
    ];
    for (const value of invalid) expect(parseAutomationStudioFlowChangeOrigin(value), JSON.stringify(value)).toBeUndefined();
  });

  it("is validated where an adaptation keeps it", () => {
    const fixture = createAutomationStudioFlowExpansionFixture().adaptation;
    expect(issueCodes(adaptationWith({ metadata: { origin: { entryPoint: "run_failure", runId: fixture.sourceRunId!, failedNodeId: "node.save", failureSignature: "sig.1" } } }))).toEqual([]);
    expect(issueCodes(adaptationWith({ metadata: { origin: { entryPoint: "instruction", instructionIds: [] } } }))).toContain("adaptation.origin_invalid");
    expect(issueCodes(adaptationWith({ metadata: { origin: "run_failure" } }))).toContain("adaptation.origin_invalid");
  });

  it("must name the adaptation's own source run", () => {
    expect(issueCodes(adaptationWith({ metadata: { origin: { entryPoint: "run_failure", runId: "run.other", failedNodeId: "node.save", failureSignature: "sig.1" } } })))
      .toContain("adaptation.origin_run_mismatch");
    expect(issueCodes(adaptationWith({ metadata: { origin: { entryPoint: "edge_case", instructionIds: [], runId: "run.other" } } })))
      .toContain("adaptation.origin_run_mismatch");
    const { sourceRunId: _omitted, ...withoutRun } = createAutomationStudioFlowExpansionFixture().adaptation;
    expect(issueCodes({ ...withoutRun, metadata: { origin: { entryPoint: "run_failure", runId: "run.other", failedNodeId: "node.save", failureSignature: "sig.1" } } })).toEqual([]);
  });
});
