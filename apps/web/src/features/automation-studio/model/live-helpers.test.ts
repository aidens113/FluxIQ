import { describe, expect, it } from "vitest";
import {
  automationFlowPreset,
  automationSelectionSame,
  automationStudioProjectOpenRequests,
  automationStudioRuntimeSummaryRequests,
  compactStateSelection,
  compactStateSelectionId,
  csv,
  digits,
  isAutomationSelection,
  parsePaneTabDragPayload,
  recordingIdFromStateSourceId,
  shortAutomationId,
  stateSelectionId
} from "./live-helpers";

describe("Automation Studio live helpers", () => {
  it("builds bounded project-open request policies", () => {
    expect(automationStudioProjectOpenRequests("project.one")).toEqual([{
      endpoint: "get-project-hierarchy",
      payload: { projectId: "project.one" },
      intent: "catalog"
    }]);
    expect(automationStudioRuntimeSummaryRequests("project.one")[0]).toMatchObject({
      endpoint: "get-project-workspace-summary",
      payload: { projectId: "project.one" }
    });
  });

  it("parses drag and selection payloads defensively", () => {
    expect(parsePaneTabDragPayload('{"paneId":"pane.one","viewId":"runtime-debug"}')).toEqual({ paneId: "pane.one", viewId: "runtime-debug" });
    expect(parsePaneTabDragPayload("{bad")).toBeNull();
    expect(isAutomationSelection({ kind: "flow", id: "flow.one" })).toBe(true);
    expect(isAutomationSelection({ kind: "flow" })).toBe(false);
  });

  it("creates compact state selections and stable state IDs", () => {
    expect(compactStateSelectionId({ nodeId: "node.one", flowId: undefined })).toEqual({ nodeId: "node.one" });
    expect(compactStateSelection({ kind: "state", id: "state.one", nodeId: undefined, sourceId: "observed:recording.one:entry.one" })).toEqual({
      kind: "state",
      id: "state.one",
      sourceId: "observed:recording.one:entry.one"
    });
    expect(stateSelectionId({ flowId: "flow.one", nodeId: "node.one" })).toBe("state:flow.one:node.one");
    expect(recordingIdFromStateSourceId("observed:recording.one:entry.one")).toBe("recording.one");
  });

  it("keeps small input and preset converters deterministic", () => {
    expect(digits("1a 2-3")).toBe("123");
    expect(csv("one, two, ,three")).toEqual(["one", "two", "three"]);
    expect(shortAutomationId("123456789012345678901")).toBe("12345678...678901");
    expect(automationSelectionSame({ kind: "flow", id: "flow.one" }, { kind: "flow", id: "flow.one" })).toBe(true);
    expect(automationFlowPreset({ flowId: "flow.one", metadata: {} }, "scheduled")).toMatchObject({
      flowId: "flow.one",
      metadata: { preset: "scheduled", trigger: "schedule" }
    });
  });
});
