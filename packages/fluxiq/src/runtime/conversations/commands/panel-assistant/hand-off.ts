// "Anything else in the panel": a project's chat, in the panel, handing a message to the panel assistant.
//
// Every chat belongs to a project (t1095), so the panel's chat is a project conversation, read by the
// panel and every client. Its reading of a message chooses among Core's own commands (build, run, describe,
// ...) and the panel's capabilities. Anything else a person can do in the panel (AI keys and models,
// settings, people and access, data, questions across it) is the panel assistant's: its model loop over
// every program endpoint open to it, its Allow cards, its per-message spending allowance and the page
// selection the message was written on. This command hands the message to it, through the assistant's own
// endpoint (`work-in-project-thread`), which runs that same loop into this project's thread. Nothing is
// copied: the endpoint reads the person's stored turn for their words and selection, and the assistant
// writes its steps where every reader sees them.
//
// Offered only to the panel (the program side adds it to a panel caller's vocabulary); a paired client
// never has it, and the endpoint refuses one anyway, so a client gains no authority from it.

import type { AutomationStudioConversationCommand, AutomationStudioConversationCommandOutcome } from "../command.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "../progress.ts";

const TITLE = "Anything else in the FluxIQ panel";

/** The assistant endpoint the command hands to (`programs/automation-studio/api/panel-assistant/`). */
const WORK_IN_PROJECT_THREAD = "work-in-project-thread";

/** How the assistant's work ended (`../../assistant/loop/types.ts`), as the quiet line after its steps. */
const ENDINGS: Readonly<Record<string, string>> = Object.freeze({
  replied: "Done.",
  asked: "Waiting for your answer above.",
  allowance: "Stopped: this message used up its spending allowance.",
  loop: "Stopped: it kept repeating the same step.",
  no_model: "Stopped: there is no AI model to use yet.",
  model_failed: "Stopped: the AI model could not be used.",
  stopped: "Stopped.",
  failed: "Stopped: something went wrong, as said above."
});

export const AUTOMATION_STUDIO_CONVERSATION_PANEL_ASSISTANT: AutomationStudioConversationCommand = {
  background: true,
  capability: {
    id: "panel.assistant",
    title: TITLE,
    summary: "Does or answers anything else the person can do in the FluxIQ panel that no other capability here covers, such as AI keys and models, settings, people and access, data, or questions about any of it, step by step with the panel's own tools, and asks before anything lasting.",
    group: "Panel",
    control: "The FluxIQ panel",
    arguments: [{ name: "request", describe: "What the person asked, in their own words.", required: false }],
    phrases: ["change a setting", "what can I do here", "show my keys", "who has access"],
    consequences: [],
    reauthorizes: false
  },
  announce: () => "I'll work on that with the panel's own tools here.",
  async run(context): Promise<AutomationStudioConversationCommandOutcome> {
    const progress = automationStudioConversationCommandProgress(TITLE);
    if (context.paired) return progress.failed("the panel's own tools are used from the FluxIQ panel");
    if (!context.answerTurnId) return progress.failed("there was no message of yours to work on");
    const handed = await context.port.call(WORK_IN_PROJECT_THREAD, { projectId: context.projectId, conversationId: context.conversationId, answerTurnId: context.answerTurnId });
    if (!handed.ok) return progress.failed(automationStudioConversationCallCause("handing it to the panel's tools", handed));
    const ending = (handed.payload as { ending?: unknown } | undefined)?.ending;
    return progress.succeeded(typeof ending === "string" && ENDINGS[ending] ? ENDINGS[ending] : ENDINGS.replied!);
  }
};
