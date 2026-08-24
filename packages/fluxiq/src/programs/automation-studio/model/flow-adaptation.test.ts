import { describe, expect, it } from "vitest";
import { createAutomationStudioFlowExpansionFixture } from "./fixtures.ts";
import {
  validateAutomationStudioAdaptationPolicy,
  validateAutomationStudioFlowAdaptation,
  validateAutomationStudioFlowChangeProposal,
  validateAutomationStudioFlowInstruction,
  validateAutomationStudioFlowRouter,
  validateAutomationStudioFlowSubflow,
  validateAutomationStudioFlow
} from "./validation.ts";

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
