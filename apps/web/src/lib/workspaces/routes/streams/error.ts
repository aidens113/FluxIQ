import type { WorkspaceStreamRefusal } from "./types";

type Code = "workspace_stream.aborted" | "workspace_stream.authority_lost" | "workspace_stream.setup_failed" | "workspace_stream.read_failed" | "workspace_stream.cleanup_failed";

const MESSAGES: Record<Code, string> = {
  "workspace_stream.aborted": "The stream request ended.",
  "workspace_stream.authority_lost": "Stream authority could not be verified.",
  "workspace_stream.setup_failed": "The stream could not be prepared.",
  "workspace_stream.read_failed": "The stream could not be read.",
  "workspace_stream.cleanup_failed": "The stream could not be closed."
};

/** Only fixed safe failures enter a controller, response or cleanup observer. */
export class WorkspaceStreamError extends Error {
  cleanupFailureCode?: "workspace_stream.cleanup_failed";

  constructor(readonly code: Code, readonly refusal?: WorkspaceStreamRefusal) {
    super(MESSAGES[code]);
    this.name = "WorkspaceStreamError";
  }
}
