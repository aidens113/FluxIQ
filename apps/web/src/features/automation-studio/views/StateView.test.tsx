import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationStateView } from "./StateView";

describe("AutomationStateView", () => {
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

    expect(html).toContain("Node State: Deposit");
    expect(html).toContain("Visual");
    expect(html).toContain("Eligibility: Ui / Bank / Visible");
    expect(html).toContain("automation-state-overlay");
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

    expect(html).toContain("Compare");
    expect(html).toContain("1 mismatches");
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

    expect(html).toContain('class="selected" title="Visual"');
    expect(html).toContain("No visual frame exists");
  });
});
