// The project chat's model, scripted, on the e2e fixture host alone: the same two conditions as the scripted
// assistant (`./fixture-host-model-source.ts`), the fixture marker in the data directory and
// `FLUXIQ_E2E_SCRIPTED_ASSISTANT`. Either missing leaves `fallback`, the key-chosen chat model, so a panel on a
// person's own data never reads a message from a script, whatever its environment says.

import path from "node:path";
import type { AutomationStudioConversationModel } from "../../instructions/index.ts";
import { PANEL_ASSISTANT_SCRIPT_ENV, PANEL_ASSISTANT_SCRIPT_FILE } from "./fixture-host-constants.ts";
import { isPanelAssistantFixtureHost } from "./is-fixture-host.ts";
import { automationStudioScriptedChatModel, readPanelAssistantScript } from "./scripted/index.ts";

export function automationStudioFixtureHostChatModel(input: { rootDir: string | undefined; env: Readonly<Record<string, string | undefined>>; fallback: AutomationStudioConversationModel }): AutomationStudioConversationModel {
  const asked = input.env[PANEL_ASSISTANT_SCRIPT_ENV];
  if ((asked !== "1" && asked !== "true") || !input.rootDir || !isPanelAssistantFixtureHost(input.rootDir)) return input.fallback;
  const scriptPath = path.join(input.rootDir, PANEL_ASSISTANT_SCRIPT_FILE);
  return automationStudioScriptedChatModel(() => readPanelAssistantScript(scriptPath));
}
