import { expect, it } from "vitest";
import { automationStudioFlowBootstrapEvidenceSteps, parseAutomationStudioFlowBootstrapEvidenceSteps } from "../../../flow-bootstrap/index.ts";
import { evidenceTraceAuditDetail, sanitizeEvidenceLoopTrace } from "../evidence-trace.ts";

it("preserves opaque structural diagnostics through stored, refused and proposed trace rebuilders", () => {
  const diagnostic = { schemaVersion: "demo-refusal.v1", reference: "item.4", blockingReferences: ["item.8"], count: 1, observed: true };
  const trace = [{ iteration: 1, decision: "tool_call" as const, toolId: "demo.run", effectApplied: false, resultCode: "demo.refused", diagnostic }];
  const stored = sanitizeEvidenceLoopTrace(trace);
  expect(stored[0]?.diagnostic).toEqual(diagnostic);
  const refused = automationStudioFlowBootstrapEvidenceSteps(stored);
  expect(refused[0]?.diagnostic).toEqual(diagnostic);
  expect(parseAutomationStudioFlowBootstrapEvidenceSteps(refused)?.[0]?.diagnostic).toEqual(diagnostic);
  const proposed = evidenceTraceAuditDetail(stored);
  expect((proposed.steps as Array<{ diagnostic: unknown }>)[0]?.diagnostic).toEqual(diagnostic);
});

it("drops a malformed optional diagnostic without losing a completed build's step", () => {
  const trace = [{ iteration: 1, decision: "tool_call" as const, toolId: "demo.run", effectApplied: false, diagnostic: { message: "Private page text" } }];
  expect(sanitizeEvidenceLoopTrace(trace)[0]?.diagnostic).toBeUndefined();
  const steps = automationStudioFlowBootstrapEvidenceSteps(trace);
  expect(steps).toHaveLength(1);
  expect(steps[0]?.diagnostic).toBeUndefined();
  expect(parseAutomationStudioFlowBootstrapEvidenceSteps([{ toolId: "demo.run", diagnostic: { message: "Private page text" } }])?.[0]?.diagnostic).toBeUndefined();
});
