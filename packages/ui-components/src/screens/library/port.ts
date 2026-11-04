// What the subflow library asks of its client. The client reads its project's saved subflows and runs
// one; the screen holds nothing of its own. Requests never throw through a port: a failed read is a
// failed `ChatResult`, and a refusal is an ordinary value with a closed code (`types.ts`).

import type { ChatResult } from "../../chat/ports/index.ts";
import type { SubflowListing, SubflowReading, SubflowRefusal, SubflowRunOutcome } from "./types.ts";

export type SubflowListQuery = { projectId: string; text?: string; limit?: number; cursor?: string | null };

export type SubflowReadQuery = { projectId: string; partId: string; version?: number };

export type SubflowRunQuery = {
  projectId: string;
  partId: string;
  version?: number;
  /** What it is given, by input id. */
  inputs: Readonly<Record<string, string>>;
  /** The lasting classes the person allowed for this run. Left out, nothing lasting may happen. */
  permitted?: readonly string[];
  /** The person was told it does its acts again, and said go ahead. */
  acknowledgedRepeat?: boolean;
};

/** The library a client supplies. */
export type SubflowLibraryPort = {
  list(query: SubflowListQuery): Promise<ChatResult<SubflowListing | SubflowRefusal>>;
  read(query: SubflowReadQuery): Promise<ChatResult<SubflowReading | SubflowRefusal>>;
  run(query: SubflowRunQuery): Promise<ChatResult<SubflowRunOutcome | SubflowRefusal>>;
};
