import { describe, expect, it } from "vitest";
import type { ActionEntry } from "./timeline.ts";
import { normalizeAutomationStudioElementTarget, validateAutomationStudioElementTarget } from "./action-element-target.ts";
import { validateRecordingSession } from "./validation.ts";

describe("automation studio element targets", () => {
  it("normalizes legacy selector-style targets into canonical element targets", () => {
    const target = normalizeAutomationStudioElementTarget({
      selector: "button[data-testid='save']",
      label: "Save",
      metadata: { token: "secret", visibleText: "Save changes" }
    }, { source: "recording" });
    expect(target).toMatchObject({
      kind: "element",
      source: "recording",
      fingerprint: {
        selector: "button[data-testid='save']",
        label: "Save",
        visibleText: "Save changes"
      }
    });
    expect(target?.fingerprint.metadata).toBeUndefined();
  });

  it("sanitizes canonical targets while preserving matching signals", () => {
    const target = normalizeAutomationStudioElementTarget({
      kind: "element",
      fingerprint: {
        visibleText: "Submit order",
        id: "submit",
        attributes: { "data-testid": "submit", "aria-label": "Submit order", password: "nope" },
        metadata: { roleSource: "dom", authorization: "Bearer nope" }
      },
      selectedCandidate: { candidateId: "candidate.submit", confidence: 2, matchedSignals: ["id"], failedSignals: [""] }
    });
    expect(target).toMatchObject({
      kind: "element",
      fingerprint: {
        visibleText: "Submit order",
        id: "submit",
        attributes: { "data-testid": "submit", "aria-label": "Submit order" },
        metadata: { roleSource: "dom" }
      },
      selectedCandidate: { candidateId: "candidate.submit", confidence: 1, matchedSignals: ["id"] }
    });
  });

  it("validates persisted element targets on recording actions", () => {
    const action = actionFixture({
      parameters: {
        target: {
          kind: "element",
          fingerprint: { selector: "#save", bounds: { x: 0, y: 0, width: -1, height: 10 } },
          selectedCandidate: { candidateId: "candidate.save", confidence: 1.2, matchedSignals: [], failedSignals: [] }
        }
      }
    });
    const result = validateRecordingSession({
      schemaVersion: "0.1",
      recordingId: "recording.element-target",
      startedAt: 1,
      environment: { id: "env", kind: "test", label: "Test", domainId: "example" },
      sources: [{ id: "source.host", kind: "event", label: "Host" }],
      actionChannels: [],
      initialState: { timestamp: 1, namespaces: {} },
      timeline: [action],
      notes: [],
      metadata: {}
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["element_target.invalid_bounds", "element_target.selection_invalid_confidence"]));
  });

  it("requires at least one durable fingerprint signal", () => {
    expect(validateAutomationStudioElementTarget({ kind: "element", fingerprint: {} }).issues.map((issue) => issue.code)).toContain("element_target.empty_fingerprint");
  });

  it("enriches fingerprints from action visual targets", () => {
    const target = normalizeAutomationStudioElementTarget({
      selector: "#submit",
      visualTarget: { entityId: "checkout.submit", entityKind: "button", statePath: { namespace: "app", path: "checkout.submit" } }
    });
    expect(target?.fingerprint).toMatchObject({
      selector: "#submit",
      entityId: "checkout.submit",
      entityKind: "button",
      statePath: { namespace: "app", path: "checkout.submit" }
    });
  });
});

function actionFixture(overrides: Partial<ActionEntry> = {}): ActionEntry {
  return {
    id: "entry.action",
    recordingId: "recording.element-target",
    timestamp: 2,
    monotonicOffsetMs: 1,
    sequence: 0,
    sourceId: "source.host",
    type: "action",
    actionType: "click",
    parameters: {},
    origin: "operator",
    startedAt: 2,
    ...overrides
  };
}
