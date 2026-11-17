import { appRouteIamContract, routeParamId } from "../../../../../../../../lib/app-route-iam";
import { programDomainScope } from "../../../../../../../../lib/program-route";
import { withWorkspaceRouteStream, type WorkspaceStreamRefusal } from "../../../../../../../../lib/workspaces/routes";

// Streams one run dataset as CSV or JSON, for an export past the inline caps.
//
// One proved panel workspace owns the export through EOF/cancel/error/abort.
// Dataset rows are raw (CD16): domain access is checked around each lazy read,
// and a mismatch reveals neither project existence nor rows. Never cache it.

type RouteParams = {
  params: Promise<{
    projectId: string;
    runId: string;
    datasetId: string;
  }>;
};

const ROUTE = appRouteIamContract("GET", "/api/programs/automation-studio/run-datasets/[projectId]/[runId]/[datasetId]");

// The id rule shared with the run dataset store (`runtime-stream-store.ts:620`).
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/u;
const EXPORT_FORMATS = new Set(["csv", "json"]);

// Cookies are read on every request, so the route is dynamic regardless; this
// states it, so no build-time or route-level caching can be introduced later.
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteParams) {
  const { projectId, runId, datasetId } = await context.params;
  return withWorkspaceRouteStream(request, ROUTE, { projectId: routeParamId(projectId), datasetId: routeParamId(datasetId) }, async (selected) => {
    let decodedProjectId: string;
    let decodedRunId: string;
    let decodedDatasetId: string;
    try {
      decodedProjectId = decodeURIComponent(projectId);
      decodedRunId = decodeURIComponent(runId);
      decodedDatasetId = decodeURIComponent(datasetId);
    } catch {
      return { ok: false, status: 400, error: "Invalid run dataset identifier." };
    }
    if (!ID_PATTERN.test(decodedProjectId) || !ID_PATTERN.test(decodedRunId) || !ID_PATTERN.test(decodedDatasetId)) {
      return { ok: false, status: 400, error: "Invalid run dataset identifier." };
    }
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    if (!EXPORT_FORMATS.has(format)) return { ok: false, status: 400, error: "Run dataset export format must be csv or json." };
    const domainId = programDomainScope(request.url).domainId;
    const automationStudio = selected.fluxiq.programs.automationStudio;
    const revalidateDomain = async (): Promise<WorkspaceStreamRefusal | null> => {
      try {
        await automationStudio.assertProjectDomainAccess(decodedProjectId, domainId);
        return null;
      } catch {
        return runDatasetNotFound();
      }
    };
    const domainRefusal = await revalidateDomain();
    const current = await selected.revalidate();
    if (!current.ok) return current;
    if (domainRefusal) return domainRefusal;
    const stream = await automationStudio.runDatasets.streamRunDataset({
      projectId: decodedProjectId, runId: decodedRunId, datasetId: decodedDatasetId,
      format: format as "csv" | "json", actorId: current.caller.actor.userId
    });
    if (!stream) return runDatasetNotFound();
    // Return immediately: the owner adopts this iterator before the next
    // authorization await and retires it even if response handoff fails.
    return {
      ok: true,
      iterator: stream[Symbol.asyncIterator](),
      revalidateDomain,
      headers: {
        "Content-Type": stream.contentType,
        "Content-Disposition": `attachment; filename="${attachmentFileName(stream.fileName)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    };
  });
}

// A domain mismatch and an unknown dataset answer alike, so neither confirms
// that a project or dataset outside the caller's domain exists.
function runDatasetNotFound(): WorkspaceStreamRefusal {
  return { ok: false, status: 404, error: "Run dataset was not found or is not available." };
}

// The collaborator already sanitizes its file name; this repeats the reduction
// so no quote or newline can reach the header even if that changes.
function attachmentFileName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/gu, "_");
}
