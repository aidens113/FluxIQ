import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FLUXIQ_SESSION_COOKIE } from "../../../../../../../../lib/auth";
import { getFluxIQ } from "../../../../../../../../lib/fluxiq";
import { programDomainScope } from "../../../../../../../../lib/program-route";

// Streams one run dataset as CSV or JSON, for an export past the inline caps.
//
// It authenticates like the state-assets GET route — session cookie, then
// `programs.read`, no bearer token — and then goes further: dataset rows are
// stored raw (CD16), so the project's domain access is asserted before a single
// row is read, and a mismatch answers 404 rather than disclosing that the
// project exists. The body is never cached: a `replace` write changes a
// dataset's content under the same URL.

type RouteParams = {
  params: Promise<{
    projectId: string;
    runId: string;
    datasetId: string;
  }>;
};

// The id rule shared with the run dataset store (`runtime-stream-store.ts:620`).
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/u;
const EXPORT_FORMATS = new Set(["csv", "json"]);

// Cookies are read on every request, so the route is dynamic regardless; this
// states it, so no build-time or route-level caching can be introduced later.
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteParams) {
  const { projectId, runId, datasetId } = await context.params;
  const fluxiq = getFluxIQ();

  const sessionId = await readSessionId();
  if (!sessionId) return authenticationRequired();
  const auth = await fluxiq.programs.identityAccess.validateSession(sessionId);
  if (!auth) return authenticationRequired();
  if (!auth.role.permissions.includes("programs.read")) {
    return NextResponse.json({ ok: false, error: "Permission required: programs.read" }, { status: 403 });
  }

  const decodedProjectId = decodeURIComponent(projectId);
  const decodedRunId = decodeURIComponent(runId);
  const decodedDatasetId = decodeURIComponent(datasetId);
  if (!ID_PATTERN.test(decodedProjectId) || !ID_PATTERN.test(decodedRunId) || !ID_PATTERN.test(decodedDatasetId)) {
    return NextResponse.json({ ok: false, error: "Invalid run dataset identifier." }, { status: 400 });
  }
  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  if (!EXPORT_FORMATS.has(format)) {
    return NextResponse.json({ ok: false, error: "Run dataset export format must be csv or json." }, { status: 400 });
  }

  const automationStudio = fluxiq.programs.automationStudio;
  try {
    await automationStudio.assertProjectDomainAccess(decodedProjectId, programDomainScope(request.url).domainId);
  } catch {
    return runDatasetNotFound();
  }

  const stream = await automationStudio.runDatasets.streamRunDataset({
    projectId: decodedProjectId,
    runId: decodedRunId,
    datasetId: decodedDatasetId,
    format: format as "csv" | "json",
    actorId: auth.user.id
  });
  if (!stream) return runDatasetNotFound();

  // The collaborator's stream is single-use and opens nothing until the first
  // pull. `cancel` runs when the client goes away: without the `return()` the
  // store lease and the export's audit row would both be lost.
  const iterator = stream[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const step = await iterator.next();
        if (step.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(step.value));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    }
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": stream.contentType,
      "Content-Disposition": `attachment; filename="${attachmentFileName(stream.fileName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

async function readSessionId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
}

function authenticationRequired() {
  return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
}

// A domain mismatch and an unknown dataset answer alike, so neither confirms
// that a project or dataset outside the caller's domain exists.
function runDatasetNotFound() {
  return NextResponse.json({ ok: false, error: "Run dataset was not found or is not available." }, { status: 404 });
}

// The collaborator already sanitizes its file name; this repeats the reduction
// so no quote or newline can reach the header even if that changes.
function attachmentFileName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]/gu, "_");
}
