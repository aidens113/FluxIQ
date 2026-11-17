import { appRouteIamContract } from "../../../../lib/app-route-iam";
import { withWorkspaceRouteStream } from "../../../../lib/workspaces/routes";
import { callerGatewayView } from "../snapshot/caller-view";
import { ChangeEventStream } from "./change-event-stream";

// Pushes a signal each time the client gateway's pairings or clients change
// (a pairing requested, expired, withdrawn, approved, denied or refused; a
// client paired, revoked, connected or disconnected), so the panel reads
// `GET /api/client-gateway/snapshot` when something changed instead of on a
// timer.
//
// Authorized as the snapshot is: the same IAM contract row, and
// `withWorkspaceRouteStream` holds the caller's selected workspace for the
// stream's life and re-checks the caller's authority around every chunk, so a
// signed-out or refused caller's stream ends at its next chunk. An event is
// sent only when THIS caller's own view (the snapshot as `callerGatewayView`
// filters it) changed, so a person or paired browser is not told about
// another's pairing or client. It carries only a per-stream sequence, never a
// kind, a gateway version, a pairing code, a credential or a client; what
// changed is read from the snapshot under the snapshot's own filtering.

const ROUTE = appRouteIamContract("GET", "/api/client-gateway/changes");

// A stream lives as long as the panel tab: never cached, never pre-rendered,
// and on Node, where the gateway runs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS: HeadersInit = {
  "content-type": "text/event-stream; charset=utf-8",
  // no-transform keeps compression off the stream, which would hold events back until a buffer filled.
  "cache-control": "private, no-store, no-transform",
  // A reverse proxy (nginx and its kin) would otherwise buffer the stream.
  "x-accel-buffering": "no"
};

export async function GET(request: Request) {
  return withWorkspaceRouteStream(request, ROUTE, {}, async (selected) => {
    const gateway = selected.fluxiq.programs.clientGateway;
    await gateway.ready();
    // What the stream fingerprints is exactly what the snapshot route would serve this caller.
    const view = async () => (await callerGatewayView(selected, request.url)).snapshot;
    return { ok: true, iterator: new ChangeEventStream(gateway.changes, view), headers: HEADERS, revalidateDomain: async () => null };
  });
}
