// The client sessions a trace met, read from its events (traces and offline
// trials, P3), so a replay can stand up one session for each: by the trace's
// opaque session reference, with the session and client ids the original's
// messages named, whether the trace saw it connect, its public view when the
// trace recorded one as it first claimed the session (D23), and its
// capabilities when the trace says what they were (that view, else a hello it
// saw, else the manifest's snapshot).

import type { ClientGatewayClientHello } from "@fluxiq/contracts/client-gateway";
import { CLIENT_GATEWAY_TRACE_LIFECYCLE_EVENTS } from "../../service/index.ts";
import type { ClientGatewayTraceEvent, ClientGatewayTraceManifest } from "../../trace/index.ts";
import { readClientGatewayTraceHello } from "./hello.ts";
import type { ClientGatewayTraceRecordedSession } from "../types.ts";

type Draft = {
  ref: string;
  sessionId: string | null;
  clientId: string | null;
  connectedInTrace: boolean;
  capabilities: readonly unknown[] | null;
  claimedView: ClientGatewayClientHello | null;
};

export function readClientGatewayTraceSessions(manifest: ClientGatewayTraceManifest, events: readonly ClientGatewayTraceEvent[]): ClientGatewayTraceRecordedSession[] {
  const drafts = new Map<string, Draft>();
  const snapshot = Array.isArray(manifest.capabilities) ? manifest.capabilities : null;
  for (const event of events) {
    const ref = event.session;
    if (ref === undefined) continue;
    let draft = drafts.get(ref);
    if (draft === undefined) {
      const connected = event.kind === "lifecycle" && event.messageType === "session.connected";
      draft = { ref, sessionId: null, clientId: null, connectedInTrace: connected, capabilities: connected ? helloCapabilities(event) : snapshot, claimedView: null };
      drafts.set(ref, draft);
    }
    const claimed = draft.claimedView === null ? claimedView(event) : undefined;
    if (claimed !== undefined) {
      draft.claimedView = claimed;
      draft.capabilities = claimed.capabilities ?? [];
    }
    const named = namedIds(event);
    draft.sessionId ??= named.sessionId;
    draft.clientId ??= named.clientId;
  }
  return [...drafts.values()].map((draft) => Object.freeze({ ...draft }));
}

/** The session and client ids an outbound message's envelope, a lifecycle record or a hello names. */
function namedIds(event: ClientGatewayTraceEvent): { sessionId: string | null; clientId: string | null } {
  const value = event.payload.encoding === "json" ? event.payload.value : null;
  if (!isRecord(value)) return { sessionId: null, clientId: null };
  if (event.kind === "outbound" || event.kind === "lifecycle") return { sessionId: stringField(value, "sessionId"), clientId: stringField(value, "clientId") };
  if (event.kind === "inbound" && event.messageType === "client.hello" && isRecord(value.payload)) return { sessionId: null, clientId: stringField(value.payload, "clientId") };
  return { sessionId: null, clientId: null };
}

/** The view a `session.claimed` record kept, read field by field as a hello without client id or token; `undefined` for any other event. */
function claimedView(event: ClientGatewayTraceEvent): ClientGatewayClientHello | undefined {
  if (event.kind !== "lifecycle" || event.messageType !== CLIENT_GATEWAY_TRACE_LIFECYCLE_EVENTS.sessionClaimed) return undefined;
  const value = event.payload.encoding === "json" ? event.payload.value : null;
  const view = isRecord(value) ? readClientGatewayTraceHello(value.view) : undefined;
  if (view === undefined) return undefined;
  delete view.clientId;
  return view;
}

/** The capabilities a recorded connect's hello declared; none declared is none, which the replay reproduces. */
function helloCapabilities(event: ClientGatewayTraceEvent): readonly unknown[] {
  const value = event.payload.encoding === "json" ? event.payload.value : null;
  const hello = isRecord(value) ? value.hello : null;
  const capabilities = isRecord(hello) ? hello.capabilities : undefined;
  return Array.isArray(capabilities) ? capabilities : [];
}

function stringField(value: { readonly [key: string]: unknown }, key: string): string | null {
  const field = value[key];
  return typeof field === "string" ? field : null;
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
