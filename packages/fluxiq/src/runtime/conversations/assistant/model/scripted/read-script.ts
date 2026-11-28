import { readFile } from "node:fs/promises";
import { PANEL_ASSISTANT_SCRIPT_FILE } from "../fixture-host-constants.ts";
import type { PanelAssistantScript } from "./script.ts";

/** The script a browser test wrote at `scriptPath`, read for every decision; refused in plain words when it cannot be read. */
export async function readPanelAssistantScript(scriptPath: string): Promise<PanelAssistantScript> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(scriptPath, "utf8"));
  } catch (error) {
    throw new Error(`The scripted assistant could not read its script at ${PANEL_ASSISTANT_SCRIPT_FILE}.`, { cause: error });
  }
  const scenarios = (parsed as { scenarios?: unknown } | null)?.scenarios;
  if (!Array.isArray(scenarios)) throw new Error(`The scripted assistant's script ${PANEL_ASSISTANT_SCRIPT_FILE} has no scenarios.`);
  return parsed as PanelAssistantScript;
}
