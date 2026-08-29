export const visualSnapshot = {
  id: "snapshot.visual",
  timestamp: 100,
  namespaces: {
    app: {
      schemaId: "app",
      schemaVersion: "0.1",
      values: {
        "bank.visible": {
          type: "boolean",
          value: true,
          observedAt: 100,
          confidence: 0.98,
          presentation: {
            label: "Bank visible",
            anchor: { type: "bounds", bounds: { x: 20, y: 30, width: 160, height: 90 } }
          }
        },
        "inventory.logs": {
          type: "integer",
          value: 24,
          observedAt: 100,
          sourceId: "recorder"
        }
      }
    }
  },
  presentation: {
    defaultFrameId: "frame.main",
    visualFrames: [{
      id: "frame.main",
      coordinateSpace: { width: 800, height: 600, unit: "px" },
      layers: [{
        id: "screen",
        kind: "image",
        contentRef: "automation-object://project/test/sha",
        bounds: { x: 0, y: 0, width: 800, height: 600 }
      }, {
        id: "bank-region",
        kind: "region",
        statePath: "app.bank.visible",
        bounds: { x: 20, y: 30, width: 160, height: 90 }
      }]
    }]
  }
};

export function snapshotWithImage(id: string, timestamp: number, contentRef: string) {
  return {
    ...visualSnapshot,
    id,
    timestamp,
    presentation: {
      ...visualSnapshot.presentation,
      visualFrames: [{
        ...visualSnapshot.presentation.visualFrames[0]!,
        layers: [{
          ...visualSnapshot.presentation.visualFrames[0]!.layers[0]!,
          contentRef
        }]
      }]
    }
  };
}
