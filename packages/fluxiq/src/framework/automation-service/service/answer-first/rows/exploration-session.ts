// The runtime session an exploration's rows sit under.
//
// Rows are stored under a run id, and a run id needs a session, so an
// exploration opens one as a build's trial does (`candidate-trial/run.ts`:
// open, write `running`, write the end), with `metadata.explorationAttempt`
// naming the attempt where a trial names `candidateTrial`. It is never marked
// `candidateTrial`: that marker means a candidate was tested, and listings
// and the judge read it so.
//
// Listing (`session-listing/`, read-only here): a session is listed whatever
// its metadata, and a run summary projects only `metadata.candidateTrial`
// (`summaries/conversions.ts`), so an exploration session is listed as a plain
// run of the Flow with its run id and status, as a build trial's is (without
// the trial marker). Nothing breaks, but nothing hides it either: it shows
// until the attempt's own ending is written. A session left `running` by a
// process that ended is swept to `interrupted` like any other.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstSession } from "./open-exploration-session.ts";
import type { AutomationStudioAnswerFirstSessionPorts } from "./store-session-ports.ts";

export async function automationStudioAnswerFirstSession(input: AutomationStudioAnswerFirstSessionPorts & {
  runId: string;
  attemptId: string;
  now?: () => number;
}): Promise<AutomationStudioAnswerFirstSession> {
  const now = input.now ?? Date.now;
  const marker = { attemptId: input.attemptId };
  const opened = await input.openSession({ runId: input.runId, metadata: { explorationAttempt: marker } });
  const startedAt = now();
  await input.writeSession({ ...opened, status: "running", startedAt });
  let ended = false;
  return {
    session: opened,
    async end(status) {
      if (ended) return;
      ended = true;
      const metadata: JsonObject = { ...(opened.metadata ?? {}), explorationAttempt: { ...marker, end: status } };
      await input.writeSession({ ...opened, status, startedAt, finishedAt: now(), metadata });
    }
  };
}
