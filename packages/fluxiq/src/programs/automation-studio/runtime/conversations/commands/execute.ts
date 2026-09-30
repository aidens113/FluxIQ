// Running one conversation command and saying what it came to.
//
// The "Doing ..." turn is already in the thread when this runs
// (`instructions/respond.ts`), so what is left is the work and its result.
// Quick commands run in the request and answer `done` or `failed`. Long ones
// -- create-here, explore, improve, a run -- are started and answered
// `started` at once; their result arrives later as an automation turn with a
// `panel-capability-result` attachment naming the capability, which is how a
// client knows the thing it asked for has finished.
//
// Every command runs inside the thread's ambient context (`../context/`), so a
// question the build or run raises lands in the thread the person is typing
// in, and its activity is stamped with that thread.
//
// A command that throws is not a lost message: the throw becomes a failed
// result, in the thread, saying what broke.

import { runInAutomationStudioConversation } from "../context/index.ts";
import { AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT } from "../instructions/index.ts";
import type {
  AutomationStudioConversationCommand,
  AutomationStudioConversationCommandContext,
  AutomationStudioConversationCommandExecution,
  AutomationStudioConversationCommandOutcome
} from "./command.ts";
import { askToConfirmAutomationStudioConversationCommand } from "./confirmation.ts";
import { automationStudioConversationCommandProgress } from "./progress.ts";
import { automationStudioConversationCommandWork } from "./work.ts";

export async function executeAutomationStudioConversationCommand(input: {
  command: AutomationStudioConversationCommand;
  context: AutomationStudioConversationCommandContext;
  arguments: Record<string, unknown>;
}): Promise<AutomationStudioConversationCommandExecution> {
  const { command, context } = input;
  const capabilityId = command.capability.id;
  const work = () => runInAutomationStudioConversation({ projectId: context.projectId, conversationId: context.conversationId }, () => settle(command, context, input.arguments));
  if (command.background) {
    automationStudioConversationCommandWork.track(work());
    return { capabilityId, status: "started", summary: `Started "${command.capability.title}". I will say here when it has finished.` };
  }
  const outcome = await work();
  return {
    capabilityId,
    status: outcome.status,
    summary: outcome.summary,
    ...(outcome.error === undefined ? {} : { error: outcome.error }),
    ...(outcome.flowId === undefined ? {} : { flowId: outcome.flowId }),
    ...(outcome.runId === undefined ? {} : { runId: outcome.runId }),
    ...(outcome.adaptationId === undefined ? {} : { adaptationId: outcome.adaptationId })
  };
}

/** Runs the command, writes its result into the thread, and asks its follow-up question if it has one. */
async function settle(command: AutomationStudioConversationCommand, context: AutomationStudioConversationCommandContext, args: Record<string, unknown>): Promise<AutomationStudioConversationCommandOutcome> {
  let outcome: AutomationStudioConversationCommandOutcome;
  try {
    outcome = await command.run(context, args);
  } catch (error) {
    outcome = automationStudioConversationCommandProgress(command.capability.title, context.keyLocked).failed(`something broke while doing it: ${error instanceof Error ? error.message : String(error)}`);
  }
  await context.host.appendAutomationTurn({
    projectId: context.projectId,
    conversationId: context.conversationId,
    text: outcome.summary,
    ask: null,
    attachment: { kind: AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT, ref: command.capability.id }
  });
  if (outcome.status === "done" && outcome.confirm) {
    const askId = await askToConfirmAutomationStudioConversationCommand(context, outcome.confirm);
    if (!askId) {
      await context.host.appendAutomationTurn({
        projectId: context.projectId,
        conversationId: context.conversationId,
        text: "I could not set up the question to apply it, because what it would apply is too large to carry on one question. Open the Flow's suggested changes to apply it there.",
        ask: null,
        attachment: null
      });
    }
  }
  return outcome;
}
