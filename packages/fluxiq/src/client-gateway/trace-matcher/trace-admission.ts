// Reads a trace and decides whether the matcher may answer from it (traces and
// offline trials, P4b; source plan 7.1, source test T14). The trace must
// evaluate complete -- closed, every sequence present, every artifact held and
// intact, every correlation whole -- under contracts the reader speaks
// (`./contract-compatibility.ts`). A legacy trace whose events name no session
// is read with its one session attached when the trace shows it held one
// (`trace-replay/session-references/`), and refused otherwise. The matcher
// stands in for one session: the one named, else the one the recorded
// operations went to; operations sent to several sessions with none named are
// `ambiguous_context`. A refused trace answers every command with its gap and
// never with a recorded answer.

import { CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS, clientGatewayTraceEventsWithOnlySession, evaluateClientGatewayTraceSessionReferences, readClientGatewayTraceSessions } from "../trace-replay/index.ts";
import { evaluateClientGatewayTraceCompleteness, type ClientGatewayTraceCompletenessIssue, type ClientGatewayTraceEvent, type ClientGatewayTraceManifest, type ClientGatewayTraceStore } from "../trace/index.ts";
import { clientGatewayTraceContractCompatibility } from "./contract-compatibility.ts";
import { readClientGatewayTraceOperation } from "./operation/index.ts";
import { clientGatewayTraceRecordedDeliveries } from "./recorded-deliveries.ts";
import type { ClientGatewayTraceMatcherAdmission, ClientGatewayTraceMatcherGapReason, ClientGatewayTraceRecordedOperation } from "./types.ts";

const ARTIFACT_ISSUES: ReadonlySet<string> = new Set(["missing_artifact", "artifact_integrity"]);

export async function admitClientGatewayTraceForMatching(input: {
  store: ClientGatewayTraceStore;
  traceId: string;
  contractVersions: Readonly<Record<string, string>>;
  sessionRef?: string | undefined;
}): Promise<ClientGatewayTraceMatcherAdmission> {
  const manifest = await input.store.readManifest(input.traceId);
  if (manifest === undefined) return refused(null, "incomplete_capture", "the store holds no manifest for this trace");
  const stored = await input.store.readEventRange(input.traceId, 1, Number.MAX_SAFE_INTEGER);
  const completeness = evaluateClientGatewayTraceCompleteness({
    manifest,
    events: stored,
    availableArtifacts: await input.store.listArtifacts(input.traceId),
    compatibility: clientGatewayTraceContractCompatibility(manifest.contractVersions, input.contractVersions),
    recorderActive: false
  });
  if (completeness.status !== "complete") return refused(manifest, issueReason(completeness.issues), issueDetail(completeness.issues));
  const references = evaluateClientGatewayTraceSessionReferences(stored);
  if (references.status === "refused") return refused(manifest, "incomplete_capture", `the trace's events do not say which session they belong to: ${references.reason}`);
  const events = references.status === "single_session" ? clientGatewayTraceEventsWithOnlySession(stored) : stored;
  const all = recordedOperations(events);
  if ("unreadable" in all) return refused(manifest, "incomplete_capture", all.unreadable);
  const sessionRef = input.sessionRef ?? servedSession(events, all);
  if (sessionRef === undefined) return refused(manifest, "ambiguous_context", "the trace's operations went to more than one session and none was named");
  const operations = all.filter((operation) => operation.session === sessionRef);
  const claimedView = sessionRef === null ? null : readClientGatewayTraceSessions(manifest, events).find((session) => session.ref === sessionRef)?.claimedView ?? null;
  return { manifest, refusal: null, sessionRef, claimedView, operations, deliveries: clientGatewayTraceRecordedDeliveries(events, operations, sessionRef) };
}

function refused(manifest: ClientGatewayTraceManifest | null, reason: ClientGatewayTraceMatcherGapReason, detail: string): ClientGatewayTraceMatcherAdmission {
  return { manifest, refusal: { reason, detail }, sessionRef: null, claimedView: null, operations: [], deliveries: { opening: [], segments: [] } };
}

function issueReason(issues: readonly ClientGatewayTraceCompletenessIssue[]): ClientGatewayTraceMatcherGapReason {
  if (issues.some((issue) => issue.code === "incompatible_contract")) return "incompatible_contract";
  if (issues.length > 0 && issues.every((issue) => ARTIFACT_ISSUES.has(issue.code))) return "missing_artifact";
  return "incomplete_capture";
}

function issueDetail(issues: readonly ClientGatewayTraceCompletenessIssue[]): string {
  if (issues.length === 0) return "the trace is still open";
  return issues.map((issue) => `${issue.code}: ${issue.detail}`).join("; ");
}

/** Every recorded `server.execute_action`, in delivery order, or why one cannot be read. */
function recordedOperations(events: readonly ClientGatewayTraceEvent[]): ClientGatewayTraceRecordedOperation[] | { readonly unreadable: string } {
  const operations: ClientGatewayTraceRecordedOperation[] = [];
  for (const event of events) {
    if (event.kind !== "outbound" || event.messageType !== "server.execute_action") continue;
    const message = event.payload.encoding === "json" ? event.payload.value : null;
    const payload = isRecord(message) ? message.payload : null;
    const commandId = isRecord(payload) ? payload.commandId : undefined;
    const operation = readClientGatewayTraceOperation(payload);
    if (typeof commandId !== "string" || operation.actionType === "") return { unreadable: `the action command recorded at sequence ${event.sequence} cannot be read back` };
    operations.push({ ...operation, sequence: event.sequence, logicalMs: event.time.logicalMs, commandId, session: event.session, redacted: event.redactions.length > 0 });
  }
  return operations;
}

/** The one session the operations went to; with none, the trace's one session (or `null`); `undefined` when there are several. */
function servedSession(events: readonly ClientGatewayTraceEvent[], operations: readonly ClientGatewayTraceRecordedOperation[]): string | null | undefined {
  const targeted = new Set(operations.map((operation) => operation.session));
  if (targeted.size > 1) return undefined;
  const [only] = targeted;
  if (only !== undefined) return only;
  const sessions = new Set(events.filter((event) => CLIENT_GATEWAY_TRACE_SESSION_BOUND_KINDS.has(event.kind)).map((event) => event.session));
  const [single] = sessions;
  return sessions.size === 1 && single !== undefined ? single : null;
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
