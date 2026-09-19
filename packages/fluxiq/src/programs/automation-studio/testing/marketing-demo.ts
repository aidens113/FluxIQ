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
  const openDialog = events.find((event) => event.label === "Open Dialog");
  const confirm = events.find((event) => event.label === "Confirm");
  if (!openDialog || !confirm) throw new Error("Automation Studio marketing demo requires action events");

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
          { id: "start", label: "Start", kind: "control" },
          { id: openDialog.id, label: openDialog.label, kind: "action" },
          { id: confirm.id, label: confirm.label, kind: "action" },
          { id: "report-ready", label: "Report ready", kind: "state" },
        ],
        edges: [
          { id: "start-open-dialog", source: "start", target: openDialog.id },
          { id: "open-dialog-confirm", source: openDialog.id, target: confirm.id },
          { id: "confirm-report-ready", source: confirm.id, target: "report-ready" },
        ],
      },
    },
  };
}