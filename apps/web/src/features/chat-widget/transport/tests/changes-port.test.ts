// The chat hears a change to a conversation or a run as soon as the panel
// does, scoped to the project the chat is about.

import { describe, expect, it } from "vitest";
import { commitAutomationStudioMutation } from "../../../automation-studio/stores";
import { createChangesPort } from "../changes-port";

function hearing(project: string | undefined) {
  const heard: unknown[] = [];
  const stop = createChangesPort({ projectId: () => project }).subscribe((change) => heard.push(change));
  return { heard, stop };
}

describe("the change feed", () => {
  it("hears a conversation change and a run change of its project, naming the thread when it is one", () => {
    const { heard, stop } = hearing("p1");
    commitAutomationStudioMutation({ kind: "conversation.changed", projectId: "p1", conversationId: "conv-1" });
    commitAutomationStudioMutation({ kind: "runtime-run.changed", projectId: "p1", runId: "run-1" });
    stop();
    expect(heard).toEqual([{ conversationId: "conv-1" }, {}]);
  });

  it("ignores another project, and every other kind of change", () => {
    const { heard, stop } = hearing("p1");
    commitAutomationStudioMutation({ kind: "conversation.changed", projectId: "p2", conversationId: "conv-9" });
    commitAutomationStudioMutation({ kind: "router.changed", projectId: "p1", flowId: "flow-1" });
    stop();
    expect(heard).toEqual([]);
  });

  it("hears every project while none is open, because the list spans them all", () => {
    const { heard, stop } = hearing(undefined);
    commitAutomationStudioMutation({ kind: "conversation.changed", projectId: "p2", conversationId: "conv-9" });
    stop();
    expect(heard).toEqual([{ conversationId: "conv-9" }]);
  });

  it("follows the project of the thread on screen without being made again, and stops when it is told to", () => {
    let project: string | undefined = "p1";
    const heard: unknown[] = [];
    const stop = createChangesPort({ projectId: () => project }).subscribe((change) => heard.push(change));
    project = "p2";
    commitAutomationStudioMutation({ kind: "conversation.changed", projectId: "p1", conversationId: "old" });
    commitAutomationStudioMutation({ kind: "conversation.changed", projectId: "p2", conversationId: "new" });
    stop();
    commitAutomationStudioMutation({ kind: "conversation.changed", projectId: "p2", conversationId: "after" });
    expect(heard).toEqual([{ conversationId: "new" }]);
  });
});
