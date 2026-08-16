import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationInspector } from "./InspectorView";

describe("AutomationInspector", () => {
  it("renders selected state fact and evidence details in the global inspector", () => {
    const recording = {
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
                  presentation: {
                    label: "Search value",
                    anchor: { type: "bounds", bounds: { x: 20, y: 20, width: 160, height: 32 } }
                  }
                }
              }
            }
          }
        }
      }]
    };
    const html = renderToStaticMarkup(
      <AutomationInspector
        entries={recording.timeline}
        selection={{ kind: "state", id: "state:node.search", nodeId: "node.search", sourceId: "observed:recording.one:entry.state", evidenceId: "evidence.search", factPath: "web.elements.search.value" }}
        policy={null}
        flow={null}
        flowPublications={[]}
        flowDependencyInfo={{}}
        node={{ id: "node.search", label: "Search" }}
        recording={recording}
        entry={recording.timeline[0]}
        signal={null}
        pipelineArtifacts={{
          nodeEvidenceBindings: [{
            id: "evidence.search",
            nodeId: "node.search",
            fact: { namespace: "web", path: "elements.search.value" },
            role: "eligibility",
            comparator: { kind: "exists" },
            confidence: 0.9
          }]
        }}
        selectedTimeline={null}
        recordings={[recording]}
        timelines={[]}
        runtimeSessions={[]}
        signals={[]}
        onOpenState={() => undefined}
        setSelection={() => undefined}
      />
    );

    expect(html).toContain("State Detail");
    expect(html.indexOf("Selected State Entity")).toBeGreaterThan(-1);
    expect(html.indexOf("Selected State Fact")).toBeGreaterThan(html.indexOf("Selected State Entity"));
    expect(html.indexOf("Selected Node Evidence")).toBeGreaterThan(html.indexOf("Selected State Fact"));
    expect(html.indexOf("State Selection")).toBeGreaterThan(html.indexOf("Selected Node Evidence"));
    expect(html).toContain("Entity path");
    expect(html).toContain("web.elements.search");
    expect(html).toContain("Fact path");
    expect(html).toContain("Selected Node Evidence");
    expect(html).toContain("Eligibility: Web / Elements / Search / Value");
    expect(html).toContain("Search value");
    expect(html).toContain("web.elements.search.value");
  });
});
