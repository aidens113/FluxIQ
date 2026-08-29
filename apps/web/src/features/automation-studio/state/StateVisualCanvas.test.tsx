import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StateExplorerView } from "./StateExplorerView";
import { boundedStateItems, stateLayerImageSrc } from "./state-canvas-model";
import { stateWithImage, zIndexForLabel, zIndexForLabelIncludes } from "./state-view-test-fixtures";

describe("State visual canvas", () => {
  it("assigns distinct visual colors for common direct-rendered element types", () => {
      const html = renderToStaticMarkup(
        <StateExplorerView
          input={{
            selection: { kind: "editor-node", id: "node.screen", node: { label: "Screen", nodeType: "generated", family: "policy", description: "Screen", inputs: [], outputs: [], parameters: [], parameterValues: {} } },
            selectedNode: { id: "node.screen", label: "Screen" },
            selectedRecording: {
              recordingId: "recording.one",
              timeline: [{
                id: "entry.state",
                type: "state_checkpoint",
                timestamp: 100,
                state: {
                  id: "snapshot.one",
                  timestamp: 100,
                  namespaces: {
                    web: {
                      values: {
                        "elements.nav.visible": { value: { text: "Menu", tagName: "nav" }, observedAt: 100, presentation: { label: "Navigation", anchor: { type: "bounds", boundsKind: "document", bounds: { x: 10, y: 10, width: 180, height: 40 } } } },
                        "elements.image.visible": { value: { text: "Hero", tagName: "img" }, observedAt: 100, presentation: { label: "Image", anchor: { type: "bounds", boundsKind: "document", bounds: { x: 10, y: 60, width: 180, height: 90 } } } },
                        "elements.list.visible": { value: { text: "Item", role: "listitem" }, observedAt: 100, presentation: { label: "List item", anchor: { type: "bounds", boundsKind: "document", bounds: { x: 10, y: 160, width: 180, height: 30 } } } },
                        "elements.status.visible": { value: { text: "Warning", role: "alert" }, observedAt: 100, presentation: { label: "Status", anchor: { type: "bounds", boundsKind: "document", bounds: { x: 10, y: 200, width: 180, height: 30 } } } },
                        "elements.copy.visible": { value: { text: "Copy", tagName: "span" }, observedAt: 100, presentation: { label: "Copy", anchor: { type: "bounds", boundsKind: "document", bounds: { x: 10, y: 240, width: 180, height: 30 } } } }
                      }
                    }
                  },
                  presentation: {
                    defaultFrameId: "frame.one",
                    visualFrames: [{
                      id: "frame.one",
                      coordinateSpace: { width: 400, height: 320, unit: "px" },
                      metadata: { frameKind: "document-map", documentWidth: 400, documentHeight: 320 },
                      layers: []
                    }]
                  }
                }
              }]
            },
            selectedTimeline: null,
            policy: null,
            taskGraph: null,
            pipelineArtifacts: { nodeEvidenceBindings: [] },
            recordings: [],
            timelines: [],
            runtimeSessions: [],
            signals: []
          }}
          setSelection={() => undefined}
        />
      );
  
      expect(html).toContain("visual-navigation");
      expect(html).toContain("visual-media");
      expect(html).toContain("visual-list");
      expect(html).toContain("visual-status");
      expect(html).toContain("visual-text");
    });

  it("stacks smaller visual bounding boxes above larger ones", () => {
      const html = renderToStaticMarkup(
        <StateExplorerView
          input={{
            selection: { kind: "state", id: "state:node.search", nodeId: "node.search", factPath: "web.elements.panel.visible" },
            selectedNode: { id: "node.search", label: "Search" },
            selectedRecording: {
              recordingId: "recording.one",
              timeline: [{
                id: "entry.state",
                type: "state_checkpoint",
                timestamp: 100,
                state: {
                  id: "snapshot.one",
                  timestamp: 100,
                  namespaces: {
                    web: {
                      values: {
                        "elements.panel.visible": { value: true, observedAt: 100 },
                        "elements.search.value": { value: "fluxiq", observedAt: 100 }
                      }
                    }
                  },
                  presentation: {
                    defaultFrameId: "frame.one",
                    visualFrames: [{
                      id: "frame.one",
                      coordinateSpace: { width: 400, height: 240, unit: "px" },
                      layers: [
                        { id: "panel", kind: "region", label: "Panel", bounds: { x: 10, y: 10, width: 300, height: 180 }, statePath: "web.elements.panel.visible" },
                        { id: "input", kind: "element", label: "Search", bounds: { x: 20, y: 20, width: 120, height: 30 }, statePath: "web.elements.search.value", metadata: { tagName: "input" } }
                      ]
                    }]
                  }
                }
              }]
            },
            selectedTimeline: null,
            policy: null,
            taskGraph: null,
            pipelineArtifacts: {
              nodeEvidenceBindings: [{
                id: "evidence.panel",
                nodeId: "node.search",
                fact: { namespace: "web", path: "elements.panel.visible" },
                role: "eligibility",
                comparator: { kind: "exists" },
                anchor: { type: "bounds", bounds: { x: 10, y: 10, width: 300, height: 180 } },
                confidence: 0.9
              }]
            },
            recordings: [],
            timelines: [],
            runtimeSessions: [],
            signals: []
          }}
          setSelection={() => undefined}
        />
      );
      const panelZ = zIndexForLabel(html, "Panel");
      const inputZ = zIndexForLabel(html, "Search");
      const evidenceZ = zIndexForLabelIncludes(html, "Eligibility: Web / Elements / Panel / Visible");
  
      expect(inputZ).toBeGreaterThan(panelZ);
      expect(inputZ).toBeGreaterThan(evidenceZ);
    });

  it("renders state-path bounding boxes as selectable visual controls", () => {
      const html = renderToStaticMarkup(
        <StateExplorerView
          input={{
            selection: { kind: "state", id: "state:node.search", nodeId: "node.search", factPath: "web.elements.search.value" },
            selectedNode: { id: "node.search", label: "Search" },
            selectedRecording: {
              recordingId: "recording.one",
              timeline: [{
                id: "entry.state",
                type: "state_checkpoint",
                timestamp: 100,
                state: {
                  id: "snapshot.one",
                  timestamp: 100,
                  namespaces: {
                    web: {
                      values: {
                        "elements.search.value": {
                          value: "fluxiq",
                          observedAt: 100,
                          presentation: { label: "Search value", anchor: { type: "bounds", bounds: { x: 20, y: 20, width: 160, height: 32 } } }
                        }
                      }
                    }
                  },
                  presentation: {
                    defaultFrameId: "frame.one",
                    visualFrames: [{
                      id: "frame.one",
                      coordinateSpace: { width: 400, height: 240, unit: "px" },
                      layers: [
                        { id: "screen", kind: "image", contentRef: "/api/programs/project.one/state-assets/screen", bounds: { x: 0, y: 0, width: 400, height: 240 } },
                        { id: "input", kind: "region", label: "Search", bounds: { x: 20, y: 20, width: 160, height: 32 }, statePath: "web.elements.search.value", metadata: { tagName: "input", type: "search" } }
                      ]
                    }]
                  }
                }
              }]
            },
            selectedTimeline: null,
            policy: null,
            taskGraph: null,
            pipelineArtifacts: { nodeEvidenceBindings: [] },
            recordings: [],
            timelines: [],
            runtimeSessions: [],
            signals: []
          }}
          setSelection={() => undefined}
        />
      );
  
      expect(html).toContain('<button aria-label="Search" class="automation-state-layer automation-state-layer-region visual-input selected interactive"');
      expect(html).toContain("automation-state-evidence-list");
      expect(html).toContain("web.elements.search.value");
    });

  it("highlights a visual bounding box when the selected sidebar fact matches its bounds", () => {
      const html = renderToStaticMarkup(
        <StateExplorerView
          input={{
            selection: { kind: "state", id: "state:node.search", nodeId: "node.search", factPath: "web.elements.search.value" },
            selectedNode: { id: "node.search", label: "Search" },
            selectedRecording: {
              recordingId: "recording.one",
              timeline: [{
                id: "entry.state",
                type: "state_checkpoint",
                timestamp: 100,
                state: {
                  id: "snapshot.one",
                  timestamp: 100,
                  namespaces: {
                    web: {
                      values: {
                        "elements.search.value": {
                          value: "fluxiq",
                          observedAt: 100,
                          presentation: { label: "Search value", anchor: { type: "bounds", bounds: { x: 20, y: 20, width: 160, height: 32 } } }
                        }
                      }
                    }
                  },
                  presentation: {
                    defaultFrameId: "frame.one",
                    visualFrames: [{
                      id: "frame.one",
                      coordinateSpace: { width: 400, height: 240, unit: "px" },
                      layers: [
                        { id: "unmapped-input", kind: "region", label: "Search box", bounds: { x: 20, y: 20, width: 160, height: 32 }, metadata: { tagName: "input", type: "search" } }
                      ]
                    }]
                  }
                }
              }]
            },
            selectedTimeline: null,
            policy: null,
            taskGraph: null,
            pipelineArtifacts: {
              nodeEvidenceBindings: [{
                id: "evidence.search",
                nodeId: "node.search",
                fact: { namespace: "web", path: "elements.search.value" },
                role: "eligibility",
                comparator: { kind: "exists" },
                confidence: 0.9
              }]
            },
            recordings: [],
            timelines: [],
            runtimeSessions: [],
            signals: []
          }}
          setSelection={() => undefined}
        />
      );
  
      expect(html).toContain('aria-label="Search box" class="automation-state-layer automation-state-layer-region visual-input selected"');
      expect(html).toContain("automation-state-evidence-list");
    });

  it("keeps the selected visual element highlighted with persistent evidence context", () => {
      const values = Object.fromEntries(Array.from({ length: 10_000 }, (_, index) => [
        `elements.item${index}.text`,
        {
          value: `Item ${index}`,
          observedAt: 100,
          presentation: { label: `Item ${index}`, anchor: { type: "bounds", bounds: { x: 10, y: 10 + index, width: 80, height: 20 } } }
        }
      ]));
      const html = renderToStaticMarkup(
        <StateExplorerView
          input={{
            selection: { kind: "state", id: "state:node.search", nodeId: "node.search", factPath: "web.elements.item9999.text" },
            selectedNode: { id: "node.search", label: "Search" },
            selectedRecording: {
              recordingId: "recording.one",
              timeline: [{
                id: "entry.state",
                type: "state_checkpoint",
                timestamp: 100,
                state: {
                  id: "snapshot.one",
                  timestamp: 100,
                  namespaces: { web: { values } },
                  presentation: {
                    defaultFrameId: "frame.one",
                    visualFrames: [{
                      id: "frame.one",
                      coordinateSpace: { width: 400, height: 240, unit: "px" },
                      layers: [
                        { id: "late-item", kind: "element", label: "Item 9999", bounds: { x: 10, y: 10_009, width: 80, height: 20 }, statePath: "web.elements.item9999.text" }
                      ]
                    }]
                  }
                }
              }]
            },
            selectedTimeline: null,
            policy: null,
            taskGraph: null,
            pipelineArtifacts: {
              nodeEvidenceBindings: [{
                id: "evidence.item9999",
                nodeId: "node.search",
                fact: { namespace: "web", path: "elements.item9999.text" },
                role: "eligibility",
                comparator: { kind: "exists" },
                confidence: 0.92
              }]
            },
            recordings: [],
            timelines: [],
            runtimeSessions: [],
            signals: []
          }}
          setSelection={() => undefined}
        />
      );
  
      expect(html).toContain('aria-label="Item 9999" class="automation-state-layer automation-state-layer-element visual-text selected interactive"');
      expect(html).toContain("automation-state-evidence-list");
      expect(html).toContain("web.elements.item9999.text");
      expect(html).not.toContain("<strong>Item 9998</strong>");
      expect(html).toContain("more remain available in Structured state");
      expect(html.length).toBeLessThan(250_000);
    });

  it("shows runtime comparison controls and mismatch summary", () => {
      const html = renderToStaticMarkup(
        <StateExplorerView
          input={{
            selection: { kind: "state", id: "state:node.deposit", nodeId: "node.deposit", phase: "actual_output" },
            selectedNode: { id: "node.deposit", label: "Deposit" },
            selectedRecording: null,
            selectedTimeline: null,
            policy: null,
            taskGraph: null,
            pipelineArtifacts: {
              nodeEvidenceBindings: [{
                id: "evidence.inventory",
                nodeId: "node.deposit",
                fact: { namespace: "ui", path: "inventory.empty" },
                role: "expectation",
                comparator: { kind: "equals", value: true },
                confidence: 0.92
              }]
            },
            recordings: [],
            timelines: [],
            runtimeSessions: [{
              runId: "run.live",
              currentState: {
                id: "snapshot.runtime",
                timestamp: 200,
                namespaces: {
                  ui: {
                    values: {
                      "inventory.empty": {
                        value: false,
                        observedAt: 200,
                        presentation: {
                          label: "Inventory empty",
                          anchor: { type: "bounds", bounds: { x: 20, y: 20, width: 120, height: 80 } }
                        }
                      }
                    }
                  }
                },
                presentation: {
                  defaultFrameId: "frame.runtime",
                  visualFrames: [{
                    id: "frame.runtime",
                    coordinateSpace: { width: 400, height: 240, unit: "px" },
                    layers: [{ id: "region", kind: "region", bounds: { x: 20, y: 20, width: 120, height: 80 } }]
                  }]
                }
              }
            }],
            signals: []
          }}
          setSelection={() => undefined}
        />
      );
  
      expect(html).toContain("Compare");
      expect(html).toContain("1 mismatches");
      expect(html).toContain("Open Run Log");
      expect(html).toContain("tone-mismatch");
    });

  it("keeps Visual selected when no visual frame exists", () => {
      const html = renderToStaticMarkup(
        <StateExplorerView
          input={{
            selection: { kind: "node", id: "node.empty" },
            selectedNode: { id: "node.empty", label: "Empty Node" },
            selectedRecording: {
              recordingId: "recording.empty",
              timeline: [{
                id: "entry.state",
                type: "state_checkpoint",
                timestamp: 100,
                state: {
                  id: "snapshot.empty",
                  timestamp: 100,
                  namespaces: { ui: { values: { status: { value: "ready", observedAt: 100 } } } }
                }
              }]
            },
            selectedTimeline: null,
            policy: null,
            taskGraph: null,
            pipelineArtifacts: {},
            recordings: [],
            timelines: [],
            runtimeSessions: [],
            signals: []
          }}
          setSelection={() => undefined}
        />
      );
  
      expect(html).toContain('aria-pressed="true" title="Visual"');
      expect(html).toContain("No visual frame exists");
    });

  it("offers raw detail on demand and retries an exact missing state", () => {
      const input = {
        selection: { kind: "state", id: "state:missing", timelineEntryId: "entry.missing", stateSnapshotId: "snapshot.missing", phase: "input" } as const,
        selectedNode: null,
        selectedEntry: null,
        selectedRecording: null,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {},
        recordings: [],
        timelines: [],
        runtimeSessions: [],
        signals: []
      };
      const idleHtml = renderToStaticMarkup(<StateExplorerView input={input} setSelection={() => undefined} />);
      const loadingHtml = renderToStaticMarkup(<StateExplorerView input={input} loading={{ timelineEntryId: "entry.missing", stateSnapshotId: "snapshot.missing", phase: "input" }} setSelection={() => undefined} />);
  
      expect(idleHtml).toContain('title="Raw"');
      expect(idleHtml).not.toContain("Raw state JSON");
      expect(idleHtml).toContain("Requested state is not loaded");
      expect(idleHtml).toContain("Retry state loading");
      expect(loadingHtml).toContain("Opening state");
      expect(loadingHtml).not.toContain("Retry state loading");
    });

  it("renders action visual targets as explicit interacted-entity callouts", () => {
      const snapshot = stateWithImage("snapshot.target", 100, "/target.png");
      const action = {
        id: "entry.action.target",
        type: "action",
        actionType: "click",
        timestamp: 100,
        visualTarget: {
          entityId: "checkout.submit",
          anchor: { type: "bounds", bounds: { x: 20, y: 30, width: 30, height: 14 } },
          confidence: 0.94
        }
      };
      const html = renderToStaticMarkup(
        <StateExplorerView
          input={{
            selection: { kind: "recording", id: "recording.target" },
            selectedNode: null,
            selectedEntry: action,
            selectedRecording: {
              recordingId: "recording.target",
              timeline: [
                { id: "entry.state", type: "state_checkpoint", timestamp: 100, state: snapshot },
                action
              ]
            },
            selectedTimeline: null,
            policy: null,
            taskGraph: null,
            pipelineArtifacts: {},
            recordings: [],
            timelines: [],
            runtimeSessions: [],
            signals: []
          }}
          setSelection={() => undefined}
        />
      );
  
      expect(html).toContain("tone-action-target");
      expect(html).toContain("automation-state-overlay-tag");
      expect(html).toContain("Interacted");
      expect(html).toContain("automation-state-overlay-corner top-left");
    });
});

describe("State view rendering guards", () => {
  it("bounds huge collections while retaining priority and rejects unsafe asset references", () => {
    const items = Array.from({ length: 10_000 }, (_, index) => index);
    const bounded = boundedStateItems(items, (item) => item === 9_999, 200);

    expect(bounded).toHaveLength(200);
    expect(bounded).toContain(9_999);
    expect(stateLayerImageSrc("not-an-automation-asset")).toBe("");
    expect(stateLayerImageSrc("javascript:alert(1)")).toBe("");
  });
});
