import { describe, expect, it } from "vitest";
import { resolveObservedStateEntryId } from "./AutomationStudioLive";

describe("AutomationStudioLive state opening", () => {
  it("resolves action timeline entries to the exact action-adjacent state snapshot", () => {
    const recording = {
      timeline: [{
        id: "entry.state.first",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 100,
        payload: { metadata: { eventTimestampMs: 100 } }
      }, {
        id: "entry.action.target",
        type: "action",
        actionType: "web.dom.click",
        startedAt: 500,
        timestamp: 540
      }, {
        id: "entry.state.target",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 500,
        payload: { metadata: { eventTimestampMs: 500 } }
      }, {
        id: "entry.state.later",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 900,
        payload: { metadata: { eventTimestampMs: 900 } }
      }]
    };

    expect(resolveObservedStateEntryId(recording, "entry.action.target")).toBe("entry.state.target");
  });

  it("resolves state timeline entries to themselves", () => {
    const recording = {
      timeline: [{
        id: "entry.state.target",
        type: "observation",
        observationType: "client.state_snapshot",
        timestamp: 500
      }]
    };

    expect(resolveObservedStateEntryId(recording, "entry.state.target")).toBe("entry.state.target");
  });
});
