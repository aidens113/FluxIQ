// The browser's link to the run dataset streaming route, used when an inline
// export answers `tooLarge`. The ids are URL-encoded and `domainId` is appended
// exactly as every program request appends it (`programs/program-api.ts:120-127`),
// because the route resolves the project inside that domain and answers 404
// when the scope is missing. A link that drops `domainId` therefore 404s for a
// domain-scoped project.

import type { RunDatasetExportFormat } from "./types";

export type RunDatasetDownloadHrefInput = {
  projectId: string;
  runId: string;
  datasetId: string;
  format: RunDatasetExportFormat;
  domainId?: string | null;
};

export function runDatasetDownloadHref(input: RunDatasetDownloadHrefInput): string {
  const path = [
    "/api/programs/automation-studio/run-datasets",
    encodeURIComponent(input.projectId),
    encodeURIComponent(input.runId),
    encodeURIComponent(input.datasetId)
  ].join("/");
  const domainQuery = input.domainId ? `&domainId=${encodeURIComponent(input.domainId)}` : "";
  return `${path}?format=${encodeURIComponent(input.format)}${domainQuery}`;
}

/**
 * The domain the panel is open in, read when a download is started rather than
 * during render. `useSearchParams` belongs to `program-api.ts`, which is outside
 * this feature; reading it here would put a router hook inside a command set that
 * several tests build without one. This is program scope, not view state.
 */
export function currentProgramDomainId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URL(window.location.href).searchParams.get("domainId");
  } catch {
    return null;
  }
}
