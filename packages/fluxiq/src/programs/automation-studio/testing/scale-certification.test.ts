import { describe, expect, it } from "vitest";
import {
  assertAutomationStudioScaleCertificationPasses,
  createAutomationStudioScaleCertificationReport,
  createAutomationStudioScaleCertificationTemplate,
  createAutomationStudioScaleMatrixTemplate,
  createPassingAutomationStudioScaleCertificationFixture
} from "./scale-certification.ts";

describe("Automation Studio scale certification", () => {
  it("creates a blocked template until every Phase 12 evidence gate is attached", () => {
    const report = createAutomationStudioScaleCertificationTemplate({ generatedAt: "2026-08-27T00:00:00.000Z", machine: "fixture", nodeVersion: "v22.0.0" });

    expect(report.schemaVersion).toBe("0.1");
    expect(report.overallStatus).toBe("blocked");
    expect(report.gates.map((gate) => gate.phaseStep)).toEqual(["12.1", "12.2", "12.3", "12.4", "12.5", "12.6", "12.7", "12.8"]);
    expect(report.gates.every((gate) => gate.blockers.length > 0)).toBe(true);
    expect(() => assertAutomationStudioScaleCertificationPasses(report)).toThrow(/scale certification is blocked/);
  });

  it("passes only when scale, soak, crash, heap, query, backup, docs, and feature flags all pass", () => {
    const report = createPassingAutomationStudioScaleCertificationFixture();

    expect(report.overallStatus).toBe("passed");
    expect(report.gates.every((gate) => gate.status === "passed")).toBe(true);
    expect(report.evidenceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(() => assertAutomationStudioScaleCertificationPasses(report)).not.toThrow();
  });

  it("fails query/payload gates that full-scan or exceed payload budgets", () => {
    const passing = createPassingAutomationStudioScaleCertificationFixture();
    const report = createAutomationStudioScaleCertificationReport({
      generatedAt: passing.generatedAt,
      hardware: passing.hardware,
      config: passing.config,
      scaleMatrix: passing.evidence.scaleMatrix!,
      soaks: passing.evidence.soaks!,
      crashInjection: passing.evidence.crashInjection!,
      heapRetention: passing.evidence.heapRetention!,
      backupReplay: passing.evidence.backupReplay!,
      documentation: passing.evidence.documentation!,
      featureFlags: passing.evidence.featureFlags!,
      criticalQueries: [{ name: "runtime event page", expectedIndex: "runtime_event_chunks_sequence_idx", plan: "SCAN runtime_event_chunks", fullScan: true, elapsedMs: 200, elapsedBudgetMs: 150, payloadBytes: 2_000_000, payloadBudgetBytes: 1_000_000 }]
    });

    const gate = report.gates.find((candidate) => candidate.gateId === "query-payload-budgets");
    expect(report.overallStatus).toBe("blocked");
    expect(gate?.blockers).toContain("runtime event page performs a full scan");
    expect(gate?.blockers).toContain("runtime event page exceeds payload budget");
  });

  it("exposes the required smoke, baseline, and target matrix template rows", () => {
    expect(createAutomationStudioScaleMatrixTemplate().map((row) => row.name)).toEqual(["smoke", "baseline", "target"]);
  });
});
