import { automationStudioActivityHub } from "fluxiq/automation";
import { programDomainScope } from "fluxiq/server";
import { appRouteIamContract } from "../../../../lib/app-route-iam";
import { authorizeWorkspaceRoute, withWorkspaceRouteStream } from "../../../../lib/workspaces/routes";
import { GatewaySnapshotRefusal, snapshotCaller } from "../../client-gateway/snapshot/authority";
import { callerGatewayView } from "../../client-gateway/snapshot/caller-view";
import { panelChangeReads } from "./caller-reads";
import { PanelChangeStream } from "./panel-change-stream";
import { activityChangeTopic, conversationChangeTopic, gatewayChangeTopic, modelAccessChangeTopic, panelModelAccessSource, type PanelChangeTopic } from "./topics";

// The panel's one push channel: each page holds one stream, and it tells the
// page when something it shows is worth reading again, so nothing in the
// panel reads on a timer.
//
// - `gateway`: THIS caller's own view of the client gateway's pairings and
//   clients changed; read `GET /api/client-gateway/snapshot`. Only for a
//   caller the snapshot route would serve, decided at open and again before
//   each look at the caller's view, so a caller who lost that authority hears
//   nothing more of it (the stream fails and reopens without it).
// - `conversation`: a thread the caller may read changed (a run wrote a turn,
//   a reply finished, an ask was answered); read it again through the
//   IAM-checked `get-conversation` or `get-panel-thread`.
// - `activity`: a project the selected workspace holds, and the caller may
//   read, has new live activity; read `get-activity` again. The activity hub
//   is process-wide, so another workspace's project is never named, whatever
//   the caller's policy grants.
// - `model-access`: someone's model access in this workspace may have changed
//   (a key added, removed, chosen or refused); read the Secret Keys snapshot
//   again, which answers the caller's own `modelAccess`. It names nothing, and
//   comes from the workspace's own runtime (`programs.modelAccessChanges`), never a
//   module-level hub: the panel server bundles Core more than once, so a hub
//   imported here is not the object the runtime signals.
//
// Authorized for the stream as a watch over the conversations the caller may
// read (`studio:ListConversations` on the workspace, the filtered list a
// person holds), re-checked around every chunk by `withWorkspaceRouteStream`;
// each topic then decides each change as the read it prompts is decided
// (`caller-reads.ts`). An event carries only a per-stream sequence and, for a
// thread or activity, the id the caller may already read, never content. A
// paired client is served the gateway topic alone, as the snapshot serves it.
//
// Signals are in-process: a deployment that serves one workspace from several
// processes needs a shared signal (hosted follow-up 7).

const ROUTE = appRouteIamContract("GET", "/api/panel/changes");
const SNAPSHOT = appRouteIamContract("GET", "/api/client-gateway/snapshot");

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
  return withWorkspaceRouteStream(request, ROUTE, {}, async (selected, caller) => {
    const topics: PanelChangeTopic[] = [];
    const gatewayRefusal = await authorizeWorkspaceRoute(selected.fluxiq, SNAPSHOT, caller, {});
    if (gatewayRefusal?.status === 503) return gatewayRefusal;
    if (gatewayRefusal === null) {
      const gateway = selected.fluxiq.programs.clientGateway;
      await gateway.ready();
      // What the topic fingerprints is exactly what the snapshot route would serve this caller, decided as it is.
      const view = async () => {
        const current = await snapshotCaller(selected);
        const refusal = await authorizeWorkspaceRoute(selected.fluxiq, SNAPSHOT, current, {});
        if (refusal) throw new GatewaySnapshotRefusal(refusal);
        return (await callerGatewayView(selected, request.url)).snapshot;
      };
      topics.push(gatewayChangeTopic(gateway.changes, view));
    }
    if (caller.channel === "panel") {
      const reads = panelChangeReads({ owner: selected, caller, domainId: programDomainScope(request.url).domainId });
      topics.push(conversationChangeTopic(selected.fluxiq.programs.automationStudio.conversations.signals, reads.conversation));
      topics.push(activityChangeTopic(automationStudioActivityHub, reads.activity));
      // The workspace runtime's own signal (`programs.modelAccessChanges`); an object without one streams the other topics.
      const modelAccess = panelModelAccessSource(selected.fluxiq.programs);
      if (modelAccess) topics.push(modelAccessChangeTopic(modelAccess));
      // The decisions stop listening for IAM changes when the stream ends.
      topics.push({ start: () => reads.stop });
    }
    // Nothing here is this caller's to hear: refused as the snapshot refused them.
    if (topics.length === 0) return gatewayRefusal ?? { ok: false, status: 403, error: "Not authorized: gateway:Snapshot" };
    return { ok: true, iterator: new PanelChangeStream(topics), headers: HEADERS, revalidateDomain: async () => null };
  });
}
