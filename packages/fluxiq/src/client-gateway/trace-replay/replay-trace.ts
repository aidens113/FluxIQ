// Replays a stored trace through Core's own client-gateway intake and reports
// parity (traces and offline trials, P3; source plan section 3.3 and phase 3).
// The trace is read through the store API; a fresh gateway whose own tap
// records into a memory store is walked through it (`walk/`); the
// replay's capture is compared with the recording at every delivery point
// (`comparison/`). Nothing else is run: no second intake path, no
// replay-only state. A legacy trace, captured before events named their
// session, is read with its one session attached when the trace shows it held
// one (`session-references/`), declared in the report; otherwise every event
// without a reference is a capture gap that says why it was refused.

import type { ClientGatewayTraceEvent } from "../trace/index.ts";
import { writeClientGatewayTraceParityReport } from "./comparison/index.ts";
import { clientGatewayTraceEventsWithOnlySession, evaluateClientGatewayTraceSessionReferences } from "./session-references/index.ts";
import { ClientGatewayTraceReplayWalk } from "./walk/index.ts";
import type { ClientGatewayTraceParityReport, ClientGatewayTraceReplayInput } from "./types.ts";

const DEFAULT_QUIET_TURNS = 3;

export async function replayClientGatewayTrace(input: ClientGatewayTraceReplayInput): Promise<ClientGatewayTraceParityReport> {
  const manifest = await input.store.readManifest(input.traceId);
  if (manifest === undefined) throw new Error(`trace ${input.traceId} has no manifest in this store`);
  const stored = await input.store.readEventRange(input.traceId, 1, Number.MAX_SAFE_INTEGER);
  const sessionReferences = evaluateClientGatewayTraceSessionReferences(stored);
  const events = sessionReferences.status === "single_session" ? clientGatewayTraceEventsWithOnlySession(stored) : stored;
  const lastSequence = Math.max(manifest.completeness.lastSequence, events.at(-1)?.sequence ?? 0);
  const walk = new ClientGatewayTraceReplayWalk({
    manifest,
    events,
    store: input.store,
    commandTimeoutMs: input.commandTimeoutMs ?? recordedAnswerWait(events),
    quietTurns: input.quietTurns ?? DEFAULT_QUIET_TURNS,
    unreferencedGap: sessionReferences.status === "refused" ? `the event does not say which session it belongs to, and the trace cannot be shown to hold one session: ${sessionReferences.reason}` : undefined
  });
  const outcome = await walk.run();
  return writeClientGatewayTraceParityReport({ manifest, events, lastSequence, outcome, sessionReferences });
}

/**
 * The answer wait the original gateway was configured with, as an
 * answer-never-came outcome recorded it for a command that named no timeout
 * of its own; `undefined` when the trace shows none.
 */
function recordedAnswerWait(events: readonly ClientGatewayTraceEvent[]): number | undefined {
  const unbounded = new Set<string>();
  for (const event of events) {
    const message = event.kind === "outbound" && event.messageType === "server.execute_action" && event.payload.encoding === "json" ? event.payload.value : null;
    const payload = isRecord(message) ? message.payload : null;
    if (isRecord(payload) && typeof payload.commandId === "string" && payload.timeoutMs === undefined) unbounded.add(payload.commandId);
  }
  for (const event of events) {
    const outcome = event.kind === "synthesized" && event.payload.encoding === "json" ? event.payload.value : null;
    const waited = isRecord(outcome) && outcome.outcome === "answer_never_came" ? outcome.waitMs : undefined;
    if (typeof waited === "number" && event.correlation.commandId !== null && unbounded.has(event.correlation.commandId)) return waited;
  }
  return undefined;
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
