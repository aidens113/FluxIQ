import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationStateView } from "./StateView";

describe("AutomationStateView", () => {
  it("opens an action state request from the indexed state source", () => {
    const afterState = stateWithImage("snapshot.after", 1_040, "/after.png");
    const html = renderToStaticMarkup(
      <AutomationStateView
        input={{
          selection: {
            kind: "state",
            id: "state.recording.target.action.click",
            recordingId: "recording.target",
            timelineEntryId: "action.click",
            sourceId: "observed:recording.target:snapshot.after",
            stateSnapshotId: "snapshot.after",
            phase: "input"
          },
          selectedNode: { id: "node.click", label: "Click" },
          selectedRecording: {
            recordingId: "recording.stale",
            timeline: [{
              id: "snapshot.stale",
              type: "observation",
              observationType: "client.state_snapshot",
              timestamp: 100,
              payload: { state: stateWithImage("snapshot.stale", 100, "/stale.png") }
            }]
          },
          selectedTimeline: null,
          policy: null,
          taskGraph: null,
          pipelineArtifacts: {},
          recordings: [{
            recordingId: "recording.target",
            timeline: [
              { id: "snapshot.before", type: "observation", observationType: "client.state_snapshot", timestamp: 100, payload: { state: stateWithImage("snapshot.before", 100, "/before.png") } },
              { id: "action.click", type: "action", actionType: "click", timestamp: 1_000 },
              { id: "snapshot.after", type: "observation", observationType: "client.state_snapshot", timestamp: 1_040, payload: { state: afterState } }
            ]
          }],
          timelines: [],
          runtimeSessions: [],
          signals: [],
          indexedStateSources: [{
            source: {
              kind: "observed",
              id: "observed:recording.target:snapshot.after",
              label: "Recording target @ snapshot.after",
              recordingId: "recording.target",
              timelineEntryId: "snapshot.after",
              stateSnapshotId: "snapshot.after",
              timestamp: 1_040
            } as any,
            snapshot: afterState as any
          }]
        }}
        setSelection={() => undefined}
      />
    );

    expect(html).toContain("/after.png");
    expect(html).not.toContain("/stale.png");
    expect(html).not.toContain("/before.png");
  });

  it("renders the reconstructed visual state view with evidence overlays", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
        input={{
          selection: { kind: "editor-node", id: "node.deposit", node: { label: "Deposit", nodeType: "generated", family: "policy", description: "Deposit items", inputs: [], outputs: [], parameters: [], parameterValues: {} } },
          selectedNode: { id: "node.deposit", label: "Deposit" },
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
                  ui: {
                    values: {
                      "bank.visible": { value: true, confidence: 0.98, presentation: { label: "Bank visible", anchor: { type: "bounds", bounds: { x: 20, y: 20, width: 180, height: 80 } } } }
                    }
                  }
                },
                presentation: {
                  defaultFrameId: "frame.one",
                  visualFrames: [{
                    id: "frame.one",
                    label: "Screen",
                    coordinateSpace: { width: 400, height: 240, unit: "px" },
                    layers: [
                      { id: "screen", kind: "image", contentRef: "/api/programs/project.one/state-assets/screen", bounds: { x: 0, y: 0, width: 400, height: 240 } },
                      { id: "label", kind: "text", content: "Bank", bounds: { x: 30, y: 30, width: 100, height: 24 } }
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
              id: "evidence.bank",
              nodeId: "node.deposit",
              fact: { namespace: "ui", path: "bank.visible" },
              role: "eligibility",
              comparator: { kind: "equals", value: true },
              confidence: 0.98
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

    expect(html).not.toContain("Node State: Deposit");
    expect(html).not.toContain("Phase");
    expect(html).not.toContain('title="Visual"');
    expect(html).toContain("Eligibility: Ui / Bank / Visible");
    expect(html).toContain("automation-state-overlay");
    expect(html).toContain('class="automation-state-zoom-controls"');
    expect(html).toContain('aria-label="Canvas zoom">100%</span>');
  });

  it("renders visual bounding boxes without visible canvas labels", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
        input={{
          selection: { kind: "editor-node", id: "node.deposit", node: { label: "Deposit", nodeType: "generated", family: "policy", description: "Deposit items", inputs: [], outputs: [], parameters: [], parameterValues: {} } },
          selectedNode: { id: "node.deposit", label: "Deposit" },
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
                  ui: {
                    values: {
                      "bank.visible": { value: true, confidence: 0.98, presentation: { label: "Bank visible", anchor: { type: "bounds", bounds: { x: 20, y: 20, width: 180, height: 80 } } } }
                    }
                  }
                },
                presentation: {
                  defaultFrameId: "frame.one",
                  visualFrames: [{
                    id: "frame.one",
                    coordinateSpace: { width: 400, height: 240, unit: "px" },
                    layers: [
                      { id: "region", kind: "region", label: "Region label", bounds: { x: 20, y: 20, width: 120, height: 80 } },
                      { id: "element", kind: "element", label: "Element label", bounds: { x: 160, y: 20, width: 120, height: 80 } }
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
              id: "evidence.bank",
              nodeId: "node.deposit",
              fact: { namespace: "ui", path: "bank.visible" },
              role: "eligibility",
              comparator: { kind: "equals", value: true },
              confidence: 0.98
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

    expect(html).toContain('title="Region label"');
    expect(html).toContain('title="Element label"');
    expect(html).not.toContain('automation-state-layer-region"><span');
    expect(html).not.toContain('automation-state-layer-element"><span');
    expect(html).not.toContain('automation-state-overlay tone-positive"><span');
  });

  it("renders type-specific visual classes for state layers and overlays", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
        input={{
          selection: { kind: "editor-node", id: "node.search", node: { label: "Search", nodeType: "generated", family: "policy", description: "Search page", inputs: [], outputs: [], parameters: [], parameterValues: {} } },
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

    expect(html).toContain("automation-state-layer-region visual-input");
    expect(html).toContain("automation-state-overlay tone-positive visual-input");
  });

  it("uses frame coordinate space for the visual canvas and bbox percentages", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
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
                namespaces: { web: { values: {} } },
                presentation: {
                  defaultFrameId: "frame.one",
                  visualFrames: [{
                    id: "frame.one",
                    coordinateSpace: { width: 1600, height: 900, unit: "px" },
                    layers: [
                      { id: "screen", kind: "image", contentRef: "/api/programs/project.one/state-assets/screen", bounds: { x: 0, y: 0, width: 1600, height: 900 } },
                      { id: "button", kind: "element", label: "Button", bounds: { x: 800, y: 450, width: 160, height: 90 }, statePath: "web.elements.button.visible" }
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

    expect(html).toContain('class="automation-state-canvas surface-screenshot" style="aspect-ratio:1600 / 900;width:100%"');
    expect(html).toContain('class="automation-state-layer automation-state-layer-image"');
    expect(html).toContain("width:100%;height:100%");
    expect(html).toContain('aria-label="Button" class="automation-state-layer automation-state-layer-element visual-control interactive" style="left:50%;top:50%;width:10%;height:10%');
  });

  it("positions full-page bounding boxes against document coordinate space", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
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
                namespaces: { web: { values: {} } },
                presentation: {
                  defaultFrameId: "frame.one",
                  visualFrames: [{
                    id: "frame.one",
                    coordinateSpace: { width: 800, height: 1800, unit: "px" },
                    layers: [
                      { id: "screen", kind: "image", contentRef: "/api/programs/project.one/state-assets/screen", bounds: { x: 0, y: 0, width: 800, height: 1800 } },
                      { id: "button", kind: "element", label: "Button", bounds: { x: 400, y: 900, width: 80, height: 180 }, statePath: "web.elements.button.visible" }
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

    expect(html).toContain('class="automation-state-canvas surface-screenshot" style="aspect-ratio:800 / 1800;width:100%"');
    expect(html).toContain('aria-label="Button" class="automation-state-layer automation-state-layer-element visual-control interactive" style="left:50%;top:50%;width:10%;height:10%');
  });

  it("combines the viewport screenshot with document-space rendered elements", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
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
                      "viewport.bounds": { value: { x: 0, y: 0, width: 800, height: 450 }, observedAt: 100 },
                      "elements.outside.visible": {
                        value: { text: "Outside content", tagName: "button" },
                        observedAt: 100,
                        presentation: { label: "Outside element", anchor: { type: "bounds", boundsKind: "document", bounds: { x: 600, y: 1400, width: 120, height: 60 } } }
                      },
                      "elements.inside.visible": {
                        value: { text: "Inside document content", tagName: "button" },
                        observedAt: 100,
                        presentation: { label: "Inside document element", anchor: { type: "bounds", boundsKind: "document", bounds: { x: 120, y: 800, width: 120, height: 60 } } }
                      },
                      "elements.directFact.visible": {
                        value: { text: "Direct fact content", tagName: "button", renderKind: "direct-rendered" },
                        observedAt: 100,
                        presentation: { label: "Direct fact element", anchor: { type: "bounds", boundsKind: "document", bounds: { x: 780, y: 1500, width: 160, height: 60 } } }
                      }
                    }
                  }
                },
                presentation: {
                  defaultFrameId: "frame.one",
                  visualFrames: [{
                    id: "frame.one",
                    coordinateSpace: { width: 800, height: 450, unit: "px" },
                    metadata: { frameKind: "viewport-screenshot", scrollY: 700, documentWidth: 1200, documentHeight: 1800 },
                    layers: [
                      { id: "screen", kind: "image", contentRef: "/api/programs/project.one/state-assets/screen", bounds: { x: 0, y: 0, width: 800, height: 450 } },
                      { id: "button", kind: "element", label: "Button", boundsKind: "screenshot", renderKind: "screenshot-bbox", isVisibleOnViewport: true, bounds: { x: 400, y: 225, width: 80, height: 45 }, statePath: "web.elements.button.visible" },
                      { id: "direct-button", kind: "element", label: "Direct button", boundsKind: "document", renderKind: "direct-rendered", bounds: { x: 240, y: 1300, width: 160, height: 50 }, statePath: "web.elements.direct.visible", metadata: { text: "Direct content", tagName: "button" } }
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

    expect(html).not.toContain("automation-state-surface-tabs");
    expect(html).toContain('class="automation-state-canvas surface-document" style="aspect-ratio:1200 / 1800;width:100%"');
    expect(html).toContain('class="automation-state-layer automation-state-layer-image" src="/api/programs/project.one/state-assets/screen" style="left:0%;top:38.88888888888889%;width:66.66666666666666%;height:25%;z-index:1;opacity:1"');
    expect(html).toContain('aria-label="Button" class="automation-state-layer automation-state-layer-element visual-control interactive" style="left:33.33333333333333%;top:51.388888888888886%;width:6.666666666666667%;height:2.5%');
    expect(html).toContain('aria-label="Direct button" class="automation-state-layer automation-state-layer-element visual-control direct-rendered interactive"');
    expect(html).toContain("--state-direct-fit-width:");
    expect(html).toContain("<span>Direct content</span>");
    expect(html).toContain('aria-label="Outside element" class="automation-state-layer automation-state-layer-element visual-control direct-rendered interactive" style="left:50%;top:77.77777777777779%;width:10%;height:3.3333333333333335%');
    expect(html).toContain("<span>Outside content</span>");
    expect(html).toContain('aria-label="Inside document element" class="automation-state-layer automation-state-layer-element visual-control interactive"');
    expect(html).not.toContain("<span>Inside document content</span>");
    expect(html).toContain('aria-label="Direct fact element" class="automation-state-layer automation-state-layer-element visual-control direct-rendered interactive"');
    expect(html).toContain("<span>Direct fact content</span>");
    expect(html).not.toContain("<span>Button</span>");
  });

  it("renders a document map from document bounds without a screenshot", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
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
                      "elements.button.visible": {
                        value: { text: "Button content", tagName: "button" },
                        observedAt: 100,
                        presentation: { label: "Button fact", anchor: { type: "bounds", boundsKind: "document", bounds: { x: 600, y: 1200, width: 120, height: 60 }, metadata: { renderKind: "direct-rendered" } } }
                      }
                    }
                  }
                },
                presentation: {
                  defaultFrameId: "frame.one",
                  visualFrames: [{
                    id: "frame.one",
                    coordinateSpace: { width: 1200, height: 1800, unit: "px" },
                    metadata: { frameKind: "document-map", scrollY: 700, documentWidth: 1200, documentHeight: 1800, viewportWidth: 800, viewportHeight: 450 },
                    layers: [
                      { id: "button", kind: "element", label: "Button", boundsKind: "document", renderKind: "direct-rendered", bounds: { x: 400, y: 900, width: 80, height: 180 }, statePath: "web.elements.button.visible" }
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

    expect(html).not.toContain("automation-state-surface-tabs");
    expect(html).toContain('class="automation-state-canvas surface-document" style="aspect-ratio:1200 / 1800;width:100%"');
    expect(html).toContain('aria-label="Current viewport" class="automation-state-viewport-rect" style="left:0%;top:38.88888888888889%;width:66.66666666666666%;height:25%;z-index:30"');
    expect(html).toContain('aria-label="Button" class="automation-state-layer automation-state-layer-element visual-control direct-rendered interactive" style="left:33.33333333333333%;top:50%;width:6.666666666666667%;height:10%');
    expect(html).toContain('<span>Button content</span>');
  });

  it("does not render parent direct text when a contained child renders that text", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
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
                      "elements.parent.visible": {
                        value: { text: "Submit", tagName: "div" },
                        observedAt: 100,
                        presentation: { label: "Parent container", anchor: { type: "bounds", boundsKind: "document", bounds: { x: 100, y: 100, width: 220, height: 80 } } }
                      },
                      "elements.child.visible": {
                        value: { text: "Submit", tagName: "button" },
                        observedAt: 100,
                        presentation: { label: "Submit button", anchor: { type: "bounds", boundsKind: "document", bounds: { x: 140, y: 120, width: 80, height: 30 } } }
                      }
                    }
                  }
                },
                presentation: {
                  defaultFrameId: "frame.one",
                  visualFrames: [{
                    id: "frame.one",
                    coordinateSpace: { width: 500, height: 360, unit: "px" },
                    metadata: { frameKind: "document-map", documentWidth: 500, documentHeight: 360 },
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

    expect(html).toContain('aria-label="Parent container"');
    expect(html).toContain('aria-label="Submit button"');
    expect(html.match(/<span>Submit<\/span>/g)).toHaveLength(1);
  });

  it("assigns distinct visual colors for common direct-rendered element types", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
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
      <AutomationStateView
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
      <AutomationStateView
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
    expect(html).not.toContain("automation-state-evidence-list");
    expect(html).not.toContain("web.elements.search.value");
  });

  it("highlights a visual bounding box when the selected sidebar fact matches its bounds", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
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
    expect(html).not.toContain("automation-state-evidence-list");
  });

  it("keeps the selected visual element highlighted without a local evidence list", () => {
    const values = Object.fromEntries(Array.from({ length: 140 }, (_, index) => [
      `elements.item${index}.text`,
      {
        value: `Item ${index}`,
        observedAt: 100,
        presentation: { label: `Item ${index}`, anchor: { type: "bounds", bounds: { x: 10, y: 10 + index, width: 80, height: 20 } } }
      }
    ]));
    const html = renderToStaticMarkup(
      <AutomationStateView
        input={{
          selection: { kind: "state", id: "state:node.search", nodeId: "node.search", factPath: "web.elements.item139.text" },
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
                      { id: "late-item", kind: "element", label: "Item 139", bounds: { x: 10, y: 149, width: 80, height: 20 }, statePath: "web.elements.item139.text" }
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
              id: "evidence.item139",
              nodeId: "node.search",
              fact: { namespace: "web", path: "elements.item139.text" },
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

    expect(html).toContain('aria-label="Item 139" class="automation-state-layer automation-state-layer-element visual-text selected interactive"');
    expect(html).not.toContain("automation-state-evidence-list");
    expect(html).not.toContain("<strong>Item 138</strong>");
  });

  it("shows runtime comparison controls and mismatch summary", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
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

    expect(html).not.toContain("Compare");
    expect(html).not.toContain("1 mismatches");
    expect(html).toContain("tone-mismatch");
  });

  it("keeps Visual selected when no visual frame exists", () => {
    const html = renderToStaticMarkup(
      <AutomationStateView
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

    expect(html).not.toContain('title="Visual"');
    expect(html).toContain("No visual frame exists");
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
      <AutomationStateView
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

function stateWithImage(id: string, timestamp: number, contentRef: string) {
  return {
    id,
    timestamp,
    namespaces: {
      ui: {
        schemaId: "ui",
        schemaVersion: "0.1",
        values: {
          title: { type: "string", value: id, observedAt: timestamp }
        }
      }
    },
    presentation: {
      defaultFrameId: "screen",
      visualFrames: [{
        id: "screen",
        label: "Screen",
        coordinateSpace: { width: 100, height: 100, unit: "px" },
        layers: [{ id: `image.${id}`, kind: "image", contentRef, bounds: { x: 0, y: 0, width: 100, height: 100 } }]
      }]
    }
  };
}

function zIndexForLabel(html: string, label: string): number {
  const pattern = new RegExp(`aria-label="${label}"[^>]*style="[^"]*z-index:([^;"]+)`);
  const match = pattern.exec(html);
  if (!match?.[1]) throw new Error(`No z-index found for ${label}`);
  return Number(match[1]);
}

function zIndexForLabelIncludes(html: string, label: string): number {
  const pattern = new RegExp(`aria-label="[^"]*${label}[^"]*"[^>]*style="[^"]*z-index:([^;"]+)`);
  const match = pattern.exec(html);
  if (!match?.[1]) throw new Error(`No z-index found for ${label}`);
  return Number(match[1]);
}
