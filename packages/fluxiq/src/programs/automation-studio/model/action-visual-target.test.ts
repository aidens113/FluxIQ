import { describe, expect, it } from "vitest";
import { resolveActionVisualTarget } from "./action-visual-target.ts";
import type { ActionEntry } from "./timeline.ts";
import type { StateSnapshot } from "./state.ts";
import { validateActionVisualEntityTarget, validateRecordingSession } from "./validation.ts";

describe("action visual targets", () => {
  it("validates action visual target shape on timeline actions", () => {
    const target = {
      entityId: "checkout.submit",
      entityKind: "button",
      statePath: { namespace: "app" as const, path: "elements.submit.visible" },
      visualFrameId: "viewport",
      visualLayerId: "element.submit",
      confidence: 0.98,
      source: "importer" as const
    };

    expect(validateActionVisualEntityTarget(target).issues).toEqual([]);
    expect(validateRecordingSession({
      schemaVersion: "0.1",
      recordingId: "recording.visual",
      startedAt: 1,
      environment: { id: "test", label: "Test", kind: "test" },
      sources: [{ id: "source.action", label: "Actions", kind: "action" }],
      actionChannels: [],
      initialState: { timestamp: 1, namespaces: {} },
      timeline: [actionFixture({ visualTarget: target })],
      notes: [],
      metadata: {}
    }).issues).toEqual([]);
  });

  it("rejects malformed action visual targets", () => {
    const result = validateActionVisualEntityTarget({
      entityId: "",
      entityKind: "",
      statePath: { namespace: "app", path: "" },
      visualFrameId: "",
      visualLayerId: "",
      stateSnapshotId: "",
      confidence: 2,
      source: "guessed"
    } as any);

    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "action.visual_target_missing_entity",
      "action.visual_target_empty_entity_kind",
      "action.visual_target_empty_frame",
      "action.visual_target_empty_layer",
      "action.visual_target_empty_state",
      "action.visual_target_invalid_confidence",
      "action.visual_target_invalid_source",
      "state.path_missing_path"
    ]));
  });

  it("resolves exact visual layers before falling back to state paths and anchors", () => {
    const snapshot = snapshotFixture();

    expect(resolveActionVisualTarget({
      action: actionFixture({ visualTarget: { entityId: "checkout.submit", visualFrameId: "viewport", visualLayerId: "element.submit" } }),
      stateSnapshot: snapshot
    })).toMatchObject({
      resolution: "exact-layer",
      visualFrameId: "viewport",
      visualLayerId: "element.submit",
      anchor: { type: "bounds", bounds: { x: 40, y: 50, width: 90, height: 30 } }
    });

    expect(resolveActionVisualTarget({
      action: actionFixture({ visualTarget: { entityId: "checkout.submit", statePath: { namespace: "app", path: "elements.submit.visible" } } }),
      stateSnapshot: snapshot
    })).toMatchObject({
      resolution: "state-path",
      visualLayerId: "element.submit"
    });

    expect(resolveActionVisualTarget({
      action: actionFixture({ visualTarget: { entityId: "checkout.cancel", anchor: { type: "point", x: 1, y: 2 } } }),
      stateSnapshot: snapshot
    })).toMatchObject({
      resolution: "anchor",
      anchor: { type: "point", x: 1, y: 2 }
    });
  });

  it("resolves semantic entity metadata when no explicit layer id exists", () => {
    const resolved = resolveActionVisualTarget({
      action: actionFixture({ visualTarget: { entityId: "checkout.submit", entityKind: "button" } }),
      stateSnapshot: snapshotFixture()
    });

    expect(resolved).toMatchObject({
      resolution: "entity",
      visualLayerId: "element.submit",
      entityId: "checkout.submit"
    });
  });
});

function actionFixture(overrides: Partial<ActionEntry> = {}): ActionEntry {
  return {
    id: "entry.action",
    recordingId: "recording.visual",
    type: "action",
    timestamp: 2,
    monotonicOffsetMs: 1,
    sequence: 1,
    sourceId: "source.action",
    actionType: "click",
    parameters: {},
    origin: "operator",
    startedAt: 2,
    ...overrides
  };
}

function snapshotFixture(): StateSnapshot {
  return {
    id: "state.one",
    timestamp: 2,
    namespaces: {
      app: {
        schemaId: "app",
        schemaVersion: "0.1",
        values: {
          "elements.submit.visible": {
            type: "boolean",
            value: true,
            observedAt: 2,
            presentation: {
              anchor: { type: "bounds", bounds: { x: 40, y: 50, width: 90, height: 30 } }
            }
          }
        }
      }
    },
    presentation: {
      defaultFrameId: "viewport",
      visualFrames: [{
        id: "viewport",
        coordinateSpace: { width: 320, height: 200, unit: "px" },
        layers: [{
          id: "element.submit",
          kind: "element",
          label: "Submit",
          statePath: "app.elements.submit.visible",
          bounds: { x: 40, y: 50, width: 90, height: 30 },
          metadata: { entityId: "checkout.submit", entityKind: "button" }
        }]
      }]
    }
  };
}
