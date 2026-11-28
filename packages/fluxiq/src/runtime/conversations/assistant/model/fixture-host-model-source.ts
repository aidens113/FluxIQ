// The scripted model, bound only on the e2e fixture host.
//
// Two things must both hold: the engine's data directory carries the marker the
// fixture seed writes, and `FLUXIQ_E2E_SCRIPTED_ASSISTANT` is set. Either one
// missing leaves the normal key binding in place, so a panel on a person's own
// data can never answer from a script, whatever its environment says.

import path from "node:path";
import type { PanelAssistantModelSource } from "../types.ts";
import { PANEL_ASSISTANT_SCRIPT_ENV, PANEL_ASSISTANT_SCRIPT_FILE } from "./fixture-host-constants.ts";
import { isPanelAssistantFixtureHost } from "./is-fixture-host.ts";
import { panelAssistantScriptedModel, readPanelAssistantScript } from "./scripted/index.ts";

/** `fallback` (the key-chosen model) unless this is the fixture host and the variable is set; then the script in the data directory. */
export function panelAssistantFixtureHostModelSource(input: { rootDir: string | undefined; env: Readonly<Record<string, string | undefined>>; fallback: PanelAssistantModelSource }): PanelAssistantModelSource {
  const asked = input.env[PANEL_ASSISTANT_SCRIPT_ENV];
  if ((asked !== "1" && asked !== "true") || !input.rootDir || !isPanelAssistantFixtureHost(input.rootDir)) return input.fallback;
  const scriptPath = path.join(input.rootDir, PANEL_ASSISTANT_SCRIPT_FILE);
  const model = panelAssistantScriptedModel(() => readPanelAssistantScript(scriptPath));
  return async () => ({ ok: true, model });
}
