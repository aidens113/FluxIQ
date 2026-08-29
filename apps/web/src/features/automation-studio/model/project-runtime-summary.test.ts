import { describe, expect, it } from "vitest";
import {
  projectRuntimeSummaryFlowState,
  projectRuntimeSummaryProjection,
  projectRuntimeSummaryRecordingState
} from "./project-runtime-summary";

describe("project runtime summary projection", () => {
  const summary = {
    flows: [{ flowId: "flow.1", name: "Summary", updatedAt: 1 }],
    recordings: [{ recordingId: "recording.1", name: "Run" }],
    runtime: [{ runId: "run.1", status: "completed" }],
    proposals: []
  };

  it("projects summary publication slices", () => {
    const projection = projectRuntimeSummaryProjection(summary);
    expect(projection.recordings?.[0]?.recordingId).toBe("recording.1");
    expect(projection.runtimeSessions?.[0]?.runId).toBe("run.1");
    expect(projection.flows?.[0]?.flow.flowId).toBe("flow.1");
  });

  it("retains loaded Flow and Recording detail during summary merges", () => {
    const loadedFlow = {
      source: "canonical",
      readOnly: false,
      flow: { flowId: "flow.1", name: "Loaded", updatedAt: 2, metadata: { summaryOnly: false } }
    };
    const loadedRecording = {
      recordingId: "recording.1",
      name: "Loaded recording",
      metadata: { summaryOnly: false }
    };

    expect(projectRuntimeSummaryFlowState(summary, [loadedFlow])[0]?.flow.name).toBe("Loaded");
    expect(projectRuntimeSummaryRecordingState(summary, [loadedRecording])[0]?.name).toBe("Loaded recording");
  });

  it("returns explicit empty publication for an unavailable summary", () => {
    expect(projectRuntimeSummaryProjection(null)).toEqual({
      workspaceSummary: null,
      recordings: null,
      timelines: null,
      runtimeSessions: null,
      pipelineArtifacts: null,
      projectArtifacts: null,
      flows: null,
      domains: null
    });
  });
});
