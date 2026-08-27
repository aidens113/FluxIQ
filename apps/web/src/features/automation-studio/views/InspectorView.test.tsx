import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationInspector, automationInspectorIdentity, automationInspectorReferenceOptions } from "./InspectorView";

describe("AutomationInspector", () => {
  it("builds stable identity, breadcrumbs, and canonical detail destinations", () => {
    expect(automationInspectorIdentity(
      { kind: "flow", id: "flow.billing" },
      { flow: { flowId: "flow.billing", name: "Billing" } }
    )).toEqual({
      title: "Flow",
      label: "Billing",
      id: "flow.billing",
      breadcrumb: ["Billing"],
      href: "?view=flow-settings",
      openLabel: "Open Flow Settings"
    });

    expect(automationInspectorIdentity(
      { kind: "recording", id: "recording/one" },
      { flow: { name: "Billing" }, recording: { name: "Checkout capture" } }
    )).toMatchObject({
      title: "Recording",
      label: "Checkout capture",
      breadcrumb: ["Billing", "Checkout capture"],
      href: "?view=recording-timeline&recordingId=recording%2Fone"
    });

    expect(automationInspectorIdentity(
      { kind: "editor-node", id: "node.charge", node: { label: "Charge", nodeType: "action", family: "action", description: "", inputs: [], outputs: [], parameters: [], parameterValues: {} } },
      { flow: { name: "Billing" }, node: { id: "node.charge", label: "Charge" } }
    )).toMatchObject({ title: "Editor Node", label: "Charge", id: "node.charge", breadcrumb: ["Billing", "Charge"] });
  });
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
        policies={[]}
        flow={null}
        flowPublications={[]}
        flowDependencyInfo={{}}
        node={{ id: "node.search", label: "Search" }}
        nodeDefinitions={[]}
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

  it("builds deduplicated friendly reference options from studio data", () => {
    const options = automationInspectorReferenceOptions({
      flow: { variables: [{ id: "accountId", label: "Account ID" }] },
      nodeDefinitions: [{ id: "action.send", label: "Send message", outputAction: "send", description: "Sends a message" }],
      policies: [{ policyId: "policy.one", name: "Primary policy" }],
      pipelineArtifacts: {
        routines: [{ routineId: "routine.one", name: "Daily routine" }],
        policyGraphs: [{ policyId: "policy.one", name: "Duplicate policy" }],
        databaseCollections: [{ collectionId: "customers", label: "Customers" }]
      }
    });
    expect(options.action?.[0]?.label).toBe("Send message");
    expect(options.policy).toHaveLength(1);
    expect(options.routine?.[0]?.label).toBe("Daily routine");
    expect(options["database-collection"]?.[0]?.label).toBe("Customers");
    expect(options.variable?.[0]?.label).toBe("Account ID");
  });});
