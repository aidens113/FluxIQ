// Test support for the app route IAM tests (t803-H2): one call of every route
// and method in the app route IAM table, by a given caller, against the
// fixture's FluxIQ. Import it after mocking `next/headers` and `lib/fluxiq`
// with `app-route-fixture`, so the routes load against the fixture.

import { POST as approvePairing } from "../client-gateway/approve-pairing/route";
import { POST as setStudioContext } from "../client-gateway/automation-studio-context/route";
import { POST as dismissPairing } from "../client-gateway/dismiss-pairing/route";
import { GET as gatewaySnapshot } from "../client-gateway/snapshot/route";
import { PUT as putTraceArtifact } from "../client-gateway/trace-artifacts/[sha256]/route";
import { GET as inspectIo } from "../framework/io/route";
import { POST as validateIo } from "../framework/io/validate/route";
import { GET as inspectSetup, POST as runSetup } from "../framework/setup/route";
import { GET as streamRunDataset } from "../programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]/route";
import { GET as readStateAsset, PUT as writeStateAsset } from "../programs/automation-studio/state-assets/[projectId]/[sha256]/route";
import { GET as programDirectory } from "../programs/route";
import { GET as listRecordings } from "../recordings/route";
import { FIXTURE_SHA, routeRequest, type RouteCaller } from "./app-route-fixture";

/** The project-scoped calls name this project; `a-` projects are alice's, `b-` bob's. */
export type RouteProject = { projectId: string };

type RouteCall = (caller: RouteCaller, target: RouteProject) => Promise<Response>;

const PNG = new Uint8Array([137, 80, 78, 71]);
const HTML = new TextEncoder().encode("<!doctype html><p>snapshot</p>");

/** Keyed `METHOD path` (and ` (variant)`), as the IAM table names the route. */
export const APP_ROUTE_CALLS: Readonly<Record<string, RouteCall>> = {
  "POST /api/client-gateway/approve-pairing": (caller) => approvePairing(routeRequest(caller, "/api/client-gateway/approve-pairing", { method: "POST", json: { pairingCode: "123456" } })),
  "POST /api/client-gateway/dismiss-pairing": (caller) => dismissPairing(routeRequest(caller, "/api/client-gateway/dismiss-pairing", { method: "POST", json: { pairingCode: "123456" } })),
  "POST /api/client-gateway/automation-studio-context": (caller, target) =>
    setStudioContext(routeRequest(caller, "/api/client-gateway/automation-studio-context", { method: "POST", json: { activeProjectId: target.projectId, activeFlowId: `${target.projectId}-flow` } })),
  "GET /api/client-gateway/snapshot": (caller) => gatewaySnapshot(routeRequest(caller, "/api/client-gateway/snapshot")),
  "PUT /api/client-gateway/trace-artifacts/[sha256]": (caller) =>
    putTraceArtifact(routeRequest(caller, `/api/client-gateway/trace-artifacts/${FIXTURE_SHA}`, { method: "PUT", bytes: HTML, mediaType: "text/html" }), { params: Promise.resolve({ sha256: FIXTURE_SHA }) }),
  // Takes no request: building one sets the caller's cookie, which is all it reads.
  "GET /api/framework/setup": (caller) => {
    routeRequest(caller, "/api/framework/setup");
    return inspectSetup();
  },
  "POST /api/framework/setup (setup)": (caller) => runSetup(routeRequest(caller, "/api/framework/setup", { method: "POST", json: { action: "setup" } })),
  "POST /api/framework/setup (migrate)": (caller) => runSetup(routeRequest(caller, "/api/framework/setup", { method: "POST", json: { action: "migrate" } })),
  "POST /api/framework/setup (rollback-migration)": (caller) => runSetup(routeRequest(caller, "/api/framework/setup", { method: "POST", json: { action: "rollback-migration" } })),
  "GET /api/framework/io": (caller) => inspectIo(routeRequest(caller, "/api/framework/io")),
  "POST /api/framework/io/validate": (caller) => validateIo(routeRequest(caller, "/api/framework/io/validate", { method: "POST", json: {} })),
  "GET /api/programs": (caller) => programDirectory(routeRequest(caller, "/api/programs")),
  "GET /api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]": (caller, target) =>
    streamRunDataset(routeRequest(caller, `/api/programs/automation-studio/run-datasets/${target.projectId}/run-1/rows?format=csv`), {
      params: Promise.resolve({ projectId: target.projectId, runId: "run-1", datasetId: "rows" })
    }),
  "GET /api/programs/automation-studio/state-assets/[projectId]/[sha256]": (caller, target) =>
    readStateAsset(routeRequest(caller, `/api/programs/automation-studio/state-assets/${target.projectId}/${FIXTURE_SHA}`), { params: Promise.resolve({ projectId: target.projectId, sha256: FIXTURE_SHA }) }),
  "PUT /api/programs/automation-studio/state-assets/[projectId]/[sha256]": (caller, target) =>
    writeStateAsset(routeRequest(caller, `/api/programs/automation-studio/state-assets/${target.projectId}/${FIXTURE_SHA}`, { method: "PUT", bytes: PNG }), {
      params: Promise.resolve({ projectId: target.projectId, sha256: FIXTURE_SHA })
    }),
  "GET /api/recordings": (caller) => listRecordings(routeRequest(caller, "/api/recordings"))
};

