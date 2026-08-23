import { describe, expect, it } from "vitest";
import type { StateSnapshot } from "../model/state.ts";
import { createAutomationStudioElementMatcher } from "./element-fingerprint.ts";

describe("automation studio element fingerprint matcher", () => {
  it("prefers strong element identity over structural path alone", () => {
    const matcher = createAutomationStudioElementMatcher();
    const best = matcher.bestCandidate(
      { visibleText: "Submit order", id: "submit-order", xpath: "/html/body/main/button[2]" },
      [
        { candidateId: "path-only", visibleText: "Cancel", xpath: "/html/body/main/button[2]" },
        { candidateId: "stable-button", visibleText: "Submit order", id: "submit-order", xpath: "/html/body/main/button[4]" }
      ]
    );
    expect(best?.candidateId).toBe("stable-button");
    expect(best?.matchedSignals).toEqual(expect.arrayContaining(["visibleText", "id"]));
    expect(best?.confidence).toBeGreaterThan(0.8);
  });

  it("extracts candidates from visual layers and state values", () => {
    const matcher = createAutomationStudioElementMatcher();
    const snapshot: StateSnapshot = {
      id: "state.1",
      timestamp: 1,
      namespaces: {
        app: {
          schemaId: "app",
          schemaVersion: "1.0.0",
          values: {
            "form.submit.enabled": {
              type: "boolean",
              value: true,
              observedAt: 1,
              semanticRole: "button",
              presentation: { label: "Submit" },
              metadata: { id: "submit-order", selector: "button[data-testid='submit-order']" }
            }
          }
        }
      },
      presentation: {
        visualFrames: [
          {
            id: "frame.main",
            coordinateSpace: { width: 1280, height: 720, unit: "px" },
            layers: [
              {
                id: "layer.submit",
                kind: "element",
                label: "Submit order",
                statePath: "app.form.submit.enabled",
                bounds: { x: 100, y: 200, width: 120, height: 40 },
                isVisibleOnViewport: true,
                metadata: { id: "submit-order", role: "button", tagName: "button", testId: "submit-order" }
              }
            ]
          }
        ]
      }
    };
    const candidates = matcher.candidatesFromStateSnapshot(snapshot);
    expect(candidates.some((candidate) => candidate.visualLayerId === "layer.submit" && candidate.id === "submit-order")).toBe(true);
    expect(candidates.some((candidate) => candidate.candidateId === "app.form.submit.enabled" && candidate.role === "button")).toBe(true);
  });

  it("returns contribution details for missing and matched signals", () => {
    const matcher = createAutomationStudioElementMatcher();
    const score = matcher.scoreCandidate(
      { label: "Continue", selector: "main button.primary", role: "button" },
      { candidateId: "candidate", label: "Continue", role: "link" }
    );
    expect(score.positiveContributions.some((item) => item.signalPath === "label")).toBe(true);
    expect(score.negativeContributions.some((item) => item.signalPath === "selector")).toBe(true);
    expect(score.failedSignals).toEqual(expect.arrayContaining(["selector", "role"]));
  });
});
