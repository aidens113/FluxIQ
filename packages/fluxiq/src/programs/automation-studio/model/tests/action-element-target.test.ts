import { describe, expect, it } from "vitest";
import type { ActionEntry } from "../timeline.ts";
import { normalizeAutomationStudioElementTarget, validateAutomationStudioElementTarget } from "../action-element-target.ts";
import { validateRecordingSession } from "../validation.ts";

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

  it("takes a type action's target identity from its element and never from the typed text", () => {
    const target = normalizeAutomationStudioElementTarget({
      selector: "#display-name",
      statePath: "web.elements.display.name",
      text: "Ada Lovelace",
      element: { selector: "input#display-name", tagName: "input", implicitRole: "textbox", accessibleName: "Display name", id: "display-name", attributes: { name: "displayName" } }
    }, { source: "mapper" });

    expect(target?.fingerprint).toEqual({
      selector: "#display-name",
      statePath: "web.elements.display.name",
      tagName: "input",
      role: "textbox",
      accessibleName: "Display name",
      id: "display-name",
      attributes: { name: "displayName" }
    });
    expect(JSON.stringify(target)).not.toContain("Ada Lovelace");
  });

  it("carries a clicked element's own text, identifiers and implied role onto the target", () => {
    const target = normalizeAutomationStudioElementTarget({
      selector: "#save-settings",
      statePath: "web.elements.save.changes",
      element: { text: "Save changes", tagName: "button", implicitRole: "button", testId: "save-settings", id: "save-settings", classNames: ["btn", "primary"] }
    }, { source: "mapper" });

    expect(target?.fingerprint).toEqual({
      selector: "#save-settings",
      statePath: "web.elements.save.changes",
      visibleText: "Save changes",
      tagName: "button",
      role: "button",
      testId: "save-settings",
      id: "save-settings",
      classNames: ["btn", "primary"]
    });
  });

  it("keeps an authored role over the implied one, and reads parameters without an element as before", () => {
    expect(normalizeAutomationStudioElementTarget({ selector: "#tab", element: { role: "tab", implicitRole: "button", tagName: "button" } })?.fingerprint.role).toBe("tab");
    expect(normalizeAutomationStudioElementTarget({ selector: "#search", text: "Search" })?.fingerprint).toEqual({ selector: "#search", visibleText: "Search" });
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
