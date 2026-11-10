import { readFileSync } from "node:fs";
import path from "node:path";
import { PANEL_ASSISTANT_FIXTURE_MARKER, PANEL_ASSISTANT_FIXTURE_MARKER_FILE } from "./fixture-host-constants.ts";

/** Whether `rootDir` is the e2e fixture host's data directory: its marker file holds the marker. */
export function isPanelAssistantFixtureHost(rootDir: string | undefined): boolean {
  if (!rootDir) return false;
  try {
    return readFileSync(path.join(rootDir, PANEL_ASSISTANT_FIXTURE_MARKER_FILE), "utf8").trim() === PANEL_ASSISTANT_FIXTURE_MARKER;
  } catch {
    return false; // no readable marker is the answer "not the fixture host", the safe one
  }
}
