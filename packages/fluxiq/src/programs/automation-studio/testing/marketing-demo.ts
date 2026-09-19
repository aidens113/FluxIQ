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
    },
  };
}