import { createAutomationStudioFixture, createAutomationStudioFlowExpansionFixture } from "../model/fixtures";

export type AutomationStudioMarketingDemo = {
  schemaVersion: "0.1";
  source: "automation-studio-fixtures";
  recording: {
    recordingId: string;
    taskId: string;
    events: Array<{ id: string; kind: string; label: string }>;
  };
  flow: {
    flowId: string;
    name: string;
    router: string;
    subflows: Array<{ id: string; name: string; role: string }>;
    graph: {
      nodes: Array<{ id: string; label: string; kind: string }>;
      edges: Array<{ id: string; source: string; target: string }>;
    };
  };
};

export function createAutomationStudioMarketingDemo(nowMs = 1_000): AutomationStudioMarketingDemo {
  const recordingFixture = createAutomationStudioFixture(nowMs);
  const flowFixture = createAutomationStudioFlowExpansionFixture(nowMs);
  const taskId = recordingFixture.recording.taskId;
  if (!taskId) throw new Error("Automation Studio marketing demo requires a task ID");
  const events = recordingFixture.recording.timeline.map((entry) => {
    const candidate = entry as typeof entry & {
      actionType?: string;
      noteId?: string;
      target?: { label?: string };
    };
    return {
      id: entry.id,
      kind: entry.type,
      label: candidate.target?.label ?? candidate.actionType ?? candidate.noteId ?? entry.type,
    };
  });
  return {
    schemaVersion: "0.1",
    source: "automation-studio-fixtures",
    recording: {
      recordingId: recordingFixture.recording.recordingId,
      taskId,
      events,
    },
    flow: {
      flowId: flowFixture.flow.flowId,
      name: flowFixture.flow.name,
      router: flowFixture.router.name,
      subflows: flowFixture.subflows.map(({ subflowId, name, role }) => ({ id: subflowId, name, role })),
      graph: {
        nodes: [
          { id: "start", label: "Start catalog read", kind: "control" },
          { id: "find-product-cards", label: "Find product cards", kind: "extract" },
          { id: "read-fields", label: "Read name, price, rating", kind: "extract" },
          { id: "follow-next", label: "Follow pagination", kind: "control" },
          { id: "validate-records", label: "Validate records", kind: "policy" },
          { id: "save-dataset", label: "Save dataset", kind: "state" },
        ],
        edges: [
          { id: "start-find-cards", source: "start", target: "find-product-cards" },
          { id: "find-cards-read-fields", source: "find-product-cards", target: "read-fields" },
          { id: "read-fields-follow-next", source: "read-fields", target: "follow-next" },
          { id: "follow-next-validate", source: "follow-next", target: "validate-records" },
          { id: "validate-save", source: "validate-records", target: "save-dataset" },
        ],
      },
    },
  };
}