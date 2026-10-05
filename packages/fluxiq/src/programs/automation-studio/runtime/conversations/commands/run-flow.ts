// "Run it": running a saved Flow for real.
//
// The panel's `run.execute`, run by Core: one `run-runtime-session` call with
// the Flow, which answers when the run has ended. That can take minutes, so it
// runs in the background and the thread gets the ending when there is one.

import { automationStudioConversationCommandText } from "./argument.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Run a Flow";

type RunAnswer = {
  runtimeSession?: { runId?: unknown; status?: unknown };
  terminalReason?: unknown;
};

export const AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW: AutomationStudioConversationCommand = {
  background: true,
  capability: {
    id: "run.execute",
    title: TITLE,
    summary: "Runs the Flow for real and reports what came back.",
    group: "Running",
    control: "Run",
    arguments: [{ name: "flowId", describe: "The Flow to run.", required: true }],
    phrases: ["run it", "run the flow", "go", "start it", "execute the flow", "try it"],
    consequences: ["create_new"],
    reauthorizes: false
  },
  announce: ({ flowName }) => `Running ${flowName ? `"${flowName}"` : "the Flow"} now. I'll say here how it went.`,
  async run(context, args) {
    const progress = automationStudioConversationCommandProgress(TITLE, context.keyLocked);
    const flowId = automationStudioConversationCommandText(args, "flowId");
    if (!flowId) return progress.failed("I could not tell which Flow to run");
    progress.carry({ flowId });
    const response = await context.port.call("run-runtime-session", { projectId: context.projectId, flowId });
    const answer = (response.payload ?? {}) as RunAnswer;
    const runId = typeof answer.runtimeSession?.runId === "string" ? answer.runtimeSession.runId : undefined;
    if (runId) progress.carry({ runId });
    if (!response.ok) {
      if (runId) progress.landed(`started run ${runId}`);
      return progress.failed(automationStudioConversationCallCause("the run", response));
    }
    const status = typeof answer.runtimeSession?.status === "string" ? answer.runtimeSession.status : "ended";
    const reason = typeof answer.terminalReason === "string" && answer.terminalReason && answer.terminalReason !== status ? `: ${answer.terminalReason.replace(/\.$/u, "")}` : "";
    const summary = `The run${runId ? ` ${runId}` : ""} ended ${status}${reason}.`;
    if (status === "failed" || status === "cancelled") return { ...progress.failed(`it ended ${status}${reason}`), summary };
    return progress.succeeded(summary);
  }
};
