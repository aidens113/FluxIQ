import { describe, expect, it } from "vitest";
import { createAutomationStudioFixture } from "./fixtures.ts";
import { initialNodeStatePhases } from "./node-state.ts";
import { validateEvidenceAnchor, validateNodeEvidenceBinding, validateNodeStateRuntimeComparison, validateNodeStateSource, validateNodeStateViewSelection, validatePolicyGraph, validateRecordingSession, validateSignalRegistry, validateStateFact, validateStateSnapshot, validateStateVisualFrame } from "./validation.ts";

describe("automation studio canonical model", () => {
  it("represents a domain-neutral recording, signal registry, and policy graph", () => {
    const fixture = createAutomationStudioFixture(10_000);

    expect(validateSignalRegistry(fixture.signalRegistry)).toEqual({ ok: true, issues: [] });
    expect(validateRecordingSession(fixture.recording)).toEqual({ ok: true, issues: [] });
    expect(validatePolicyGraph(fixture.policy)).toEqual({ ok: true, issues: [] });
  });

  it("keeps raw evidence linked without overwriting the recording", () => {
    const { policy, recording } = createAutomationStudioFixture();
    const confirmNode = policy.nodes.find((node) => node.id === "node.confirm");

    expect(confirmNode?.sourceEvidence).toContainEqual({
      layer: "raw_recording",
      artifactId: recording.recordingId,
      entryId: "entry.confirm"
    });
    expect(recording.timeline.find((entry) => entry.id === "entry.confirm")?.type).toBe("action");
  });

  it("reports structural issues before mining or runtime consume artifacts", () => {
    const { policy, recording, signalRegistry } = createAutomationStudioFixture();

    const invalidRecording = {
      ...recording,
      timeline: [
        recording.timeline[1]!,
        {
          ...recording.timeline[2]!,
          sequence: 1
        }
      ]
    };
    const invalidPolicy = {
      ...policy,
      edges: [
        {
          id: "edge.missing",
          fromNodeId: "node.open-dialog",
          toNodeId: "node.missing",
          probability: 1.2
        }
      ]
    };
    const invalidRegistry = {
      ...signalRegistry,
      definitions: [
        signalRegistry.definitions[0]!,
        {
          ...signalRegistry.definitions[0]!,
          defaultWeight: 2
        }
      ]
    };

    expect(validateRecordingSession(invalidRecording).issues.map((issue) => issue.code)).toContain("timeline.sequence_not_increasing");
    expect(validatePolicyGraph(invalidPolicy).issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["policy.edge_missing_to_node", "policy.invalid_edge_probability"])
    );
    expect(validateSignalRegistry(invalidRegistry).issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["signal.duplicate_path", "signal.invalid_weight"])
    );
  });

  it("accepts domain-neutral state presentation frames and anchors", () => {
    const snapshot = {
      id: "snapshot.visual",
      timestamp: 10,
      namespaces: {
        app: {
          schemaId: "app",
          schemaVersion: "0.1",
          values: {
            "panel.visible": {
              type: "boolean" as const,
              value: true,
              observedAt: 10,
              confidence: 0.98,
              presentation: {
                label: "Panel visible",
                anchor: { type: "bounds" as const, bounds: { x: 12, y: 18, width: 180, height: 64 } },
                visualKind: "badge" as const
              }
            }
          }
        }
      },
      presentation: {
        defaultFrameId: "frame.main",
        visualFrames: [
          {
            id: "frame.main",
            label: "Main view",
            coordinateSpace: { width: 800, height: 600, unit: "px" as const, origin: "top-left" as const },
            layers: [
              {
                id: "layer.screenshot",
                kind: "image" as const,
                contentRef: "automation-object://project/project.test/sha256.test",
                bounds: { x: 0, y: 0, width: 800, height: 600 }
              },
              {
                id: "layer.panel",
                kind: "region" as const,
                label: "Panel",
                statePath: "app.panel.visible",
                bounds: { x: 12, y: 18, width: 180, height: 64 }
              }
            ]
          }
        ]
      }
    };

    expect(validateStateSnapshot(snapshot).issues).toEqual([]);
    expect(validateStateVisualFrame(snapshot.presentation.visualFrames[0]!).issues).toEqual([]);
    expect(validateEvidenceAnchor({ type: "path", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }).issues).toEqual([]);
  });

  it("rejects unsafe state presentation content and malformed geometry", () => {
    const invalidFrame = {
      id: "frame.invalid",
      coordinateSpace: { width: 0, height: Number.POSITIVE_INFINITY, unit: "px" as const },
      layers: [
        {
          id: "layer.file",
          kind: "image" as const,
          contentRef: "C:\\private\\screenshot.png",
          bounds: { x: 0, y: Number.NaN, width: -1, height: 20 },
          opacity: 2
        },
        {
          id: "layer.bad-path",
          kind: "text" as const,
          content: "bad",
          anchor: { type: "path" as const, points: [{ x: 1, y: 1 }] }
        }
      ]
    };

    expect(validateStateVisualFrame(invalidFrame).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "state.dimension_not_positive",
      "state.visual_layer_unsafe_content_ref",
      "state.coordinate_not_finite",
      "state.visual_layer_invalid_opacity",
      "state.anchor_path_too_short"
    ]));
  });

  it("separates observed state facts from node evidence bindings", () => {
    const fact = {
      id: "fact.bank.visible",
      snapshotId: "snapshot.recording.1",
      namespace: "app",
      path: "bank.visible",
      observedAt: 42,
      confidence: 0.96,
      value: { type: "boolean" as const, value: true, observedAt: 42 },
      evidence: {
        layer: "normalized_timeline" as const,
        artifactId: "timeline.1",
        entryId: "entry.state"
      }
    };
    const eligibilityBinding = {
      id: "binding.deposit.eligibility",
      nodeId: "node.deposit",
      fact,
      role: "eligibility" as const,
      comparator: { kind: "equals" as const, value: true },
      weight: 0.84,
      confidence: 0.96,
      provenance: [fact.evidence]
    };
    const expectationBinding = {
      ...eligibilityBinding,
      id: "binding.close.expectation",
      nodeId: "node.close",
      role: "expectation" as const,
      comparator: { kind: "custom" as const, comparatorId: "example.visible-after-action", parameters: { expected: true } }
    };

    expect(validateStateFact(fact).issues).toEqual([]);
    expect(validateNodeEvidenceBinding(eligibilityBinding).issues).toEqual([]);
    expect(validateNodeEvidenceBinding(expectationBinding).issues).toEqual([]);
  });

  it("reports malformed node evidence bindings without rejecting custom comparator parameters", () => {
    const result = validateNodeEvidenceBinding({
      id: "",
      nodeId: "",
      fact: {
        namespace: "",
        path: "",
        observedAt: Number.NaN,
        evidence: { layer: "evidence_claim", artifactId: "", confidence: 2 }
      },
      role: "eligibility",
      comparator: { kind: "custom", comparatorId: "", parameters: { domainOwned: true } },
      weight: -0.1,
      confidence: 1.2,
      anchor: { type: "entity", entityId: "" }
    });

    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "evidence.binding_missing_id",
      "evidence.binding_missing_node_id",
      "evidence.fact_missing_namespace",
      "evidence.fact_missing_path",
      "evidence.fact_invalid_observed_at",
      "evidence.reference_missing_artifact",
      "evidence.reference_invalid_confidence",
      "evidence.comparator_missing_custom_id",
      "evidence.binding_invalid_weight",
      "evidence.binding_invalid_confidence",
      "state.anchor_missing_entity"
    ]));
  });

  it("models learned, observed, and runtime node state sources distinctly", () => {
    expect(initialNodeStatePhases).toEqual(["input", "action", "expected_output"]);
    expect(validateNodeStateSource({
      kind: "learned",
      id: "source.learned.node.deposit",
      label: "Learned",
      modelId: "model.deposit",
      nodeId: "node.deposit",
      recordingIds: ["recording.1", "recording.2"],
      confidence: 0.91
    }).issues).toEqual([]);
    expect(validateNodeStateSource({
      kind: "observed",
      id: "source.observed.recording.1",
      label: "Recording 1",
      recordingId: "recording.1",
      timelineEntryId: "entry.checkpoint",
      timestamp: 100
    }).issues).toEqual([]);
    expect(validateNodeStateSource({
      kind: "runtime",
      id: "source.runtime.live",
      label: "Live",
      sessionId: "run.1",
      timestamp: 120
    }).issues).toEqual([]);
    expect(validateNodeStateViewSelection({ sourceId: "source.learned.node.deposit", phase: "input" }).issues).toEqual([]);
  });

  it("reports malformed node state sources", () => {
    expect(validateNodeStateSource({
      kind: "learned",
      id: "",
      label: "",
      modelId: "",
      nodeId: "",
      recordingIds: [""],
      confidence: 2
    }).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "node_state.source_missing_id",
      "node_state.source_missing_label",
      "node_state.learned_missing_node_id",
      "node_state.learned_empty_model_id",
      "node_state.learned_empty_recording_id",
      "node_state.learned_invalid_confidence"
    ]));
    expect(validateNodeStateSource({
      kind: "observed",
      id: "observed.bad",
      label: "Observed",
      recordingId: "",
      timelineEntryId: "",
      timestamp: Number.NaN
    }).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "node_state.observed_missing_recording_id",
      "node_state.observed_empty_timeline_entry_id",
      "node_state.observed_invalid_timestamp"
    ]));
    expect(validateNodeStateSource({
      kind: "runtime",
      id: "runtime.bad",
      label: "Runtime",
      sessionId: "",
      timestamp: Number.POSITIVE_INFINITY
    }).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "node_state.runtime_empty_session_id",
      "node_state.runtime_invalid_timestamp"
    ]));
  });

  it("models runtime expected-vs-actual state comparison", () => {
    expect(validateNodeStateRuntimeComparison({
      expectedSourceId: "source.expected.node.deposit",
      actualSourceId: "source.runtime.run.1",
      nodeId: "node.deposit",
      phase: "actual_output",
      matches: [{ evidenceId: "binding.bank.visible", factPath: "app.bank.visible", score: 0.98 }],
      mismatches: [{
        evidenceId: "binding.inventory.empty",
        factPath: "app.inventory.empty",
        expected: true,
        actual: false,
        severity: "error"
      }],
      confidence: 0.73
    }).issues).toEqual([]);
  });

  it("reports malformed runtime state comparisons", () => {
    expect(validateNodeStateRuntimeComparison({
      expectedSourceId: "",
      actualSourceId: "",
      nodeId: "",
      phase: "input" as "actual_output",
      matches: [{ evidenceId: "", factPath: "", score: 2 }],
      mismatches: [{ evidenceId: "", factPath: "", expected: true, actual: false, severity: "fatal" as "error" }],
      confidence: -1
    }).issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "node_state.comparison_missing_expected_source",
      "node_state.comparison_missing_actual_source",
      "node_state.comparison_missing_node_id",
      "node_state.comparison_invalid_phase",
      "node_state.comparison_match_missing_evidence",
      "node_state.comparison_match_missing_fact",
      "node_state.comparison_match_invalid_score",
      "node_state.comparison_mismatch_missing_evidence",
      "node_state.comparison_mismatch_missing_fact",
      "node_state.comparison_mismatch_invalid_severity",
      "node_state.comparison_invalid_confidence"
    ]));
  });
});
