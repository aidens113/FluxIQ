// The project chat's reading of a message, replayed from the same script the scripted assistant replays,
// for browser tests on the e2e fixture host only (`../chat-model-binding.ts` is the only way it is
// bound). Every chat belongs to a project (t1095), so a message typed into the panel's chat is read by the
// project chat first, which hands anything else in the panel to the assistant (`panel.assistant`). A scenario
// whose words the message contains is read as that hand-off, or as the capability its `chat` names; any other
// message is answered with the script's `otherwise`. It never costs anything.

import type { AutomationStudioConversationModel } from "../../../instructions/index.ts";
import type { PanelAssistantScript } from "./script.ts";

/** The capability a scripted message is handed to when its scenario names none. */
const HAND_OFF = "panel.assistant";

export function automationStudioScriptedChatModel(readScript: () => Promise<PanelAssistantScript>): AutomationStudioConversationModel {
  return {
    name: "scripted",
    decide: async (request) => {
      const script = await readScript();
      const said = request.message.toLowerCase();
      const scenario = script.scenarios.find((candidate) => said.includes(candidate.when.toLowerCase()));
      if (!scenario) return { reply: script.otherwise ?? "Nothing is scripted for that." };
      return { do: scenario.chat ?? HAND_OFF, with: { request: request.message } };
    }
  };
}
