import type { RunClient } from "./types";

/** A client's name as a person says it. */
export function clientLabel(client: RunClient): string {
  switch (client) {
    case "extension": return "Browser extension";
    case "program": return "Your program";
    case "panel": return "This panel";
  }
}
