import { vi } from "vitest";
import { resetRouteRuntime, runtime } from "../../../../../../../../../lib/workspaces/routes/tests/route-runtime";

function studio() {
  return { assertProjectDomainAccess: vi.fn(), runDatasets: { streamRunDataset: vi.fn() } };
}

export const studios = { a: studio(), b: studio(), primary: studio() };
export const BASE_URL = "https://panel.example.test/api/programs/automation-studio/run-datasets/project.one/run.one/listings";

export function params(overrides: Partial<{ projectId: string; runId: string; datasetId: string }> = {}) {
  return { params: Promise.resolve({ projectId: "project.one", runId: "run.one", datasetId: "listings", ...overrides }) };
}

export function datasetSource(chunks: string[], format: "csv" | "json" = "csv", fileName = `fluxiq-dataset-run.one-listings.${format}`) {
  const values = [...chunks];
  const next = vi.fn(async (): Promise<IteratorResult<string, unknown>> => values.length ? { done: false, value: values.shift()! } : { done: true, value: undefined });
  const retire = vi.fn(async (): Promise<IteratorResult<string, unknown>> => ({ done: true, value: undefined }));
  const source = { format, fileName, contentType: format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8", [Symbol.asyncIterator]: () => ({ next, return: retire }) };
  return { source, next, retire };
}

export async function resetDatasetRuntime() {
  await resetRouteRuntime();
  const sources = { a: datasetSource(["Name\r\n", "Tenant A\r\n"]), b: datasetSource(["Name\r\n", "Tenant B\r\n"]), primary: datasetSource(["Private primary rows\r\n"]) };
  for (const [key, instance] of [["a", runtime.tenantA], ["b", runtime.tenantB], ["primary", runtime.primary]] as const) {
    Object.assign(instance.programs, { automationStudio: studios[key] });
    studios[key].assertProjectDomainAccess.mockResolvedValue(undefined);
    studios[key].runDatasets.streamRunDataset.mockResolvedValue(sources[key].source);
  }
  return sources;
}

export async function changeAuthority(change: string) {
  if (change === "membership") runtime.memberships.set("person-a", []);
  if (change === "selection") runtime.memberships.set("person-a", [{ workspaceId: "tenant-b", userId: "person-a", status: "active", createdAtMs: 0 }]);
  if (change === "account") runtime.accounts.set("person-a", { status: "disabled", deletion: null });
  if (change === "session") await runtime.identity.revokeSession(runtime.sessions.a);
  if (change === "user") await runtime.identity.updateUser({ id: "person-a", enabled: false });
  if (change === "identity") runtime.primary.programs.identityAccess.validateSession.mockImplementation(() => runtime.identity.validateSession(runtime.sessions.b));
  if (change === "iam") runtime.policies.set("tenant-a", "none");
  if (change === "role") {
    await runtime.identity.upsertRole({ id: "no-access", permissions: [] });
    await runtime.identity.updateUser({ id: "person-a", roleId: "no-access" });
  }
}
