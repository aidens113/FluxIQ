import { beforeEach, describe, expect, it, vi } from "vitest";

const validateSession = vi.fn();
const assertProjectDomainAccess = vi.fn();
const streamRunDataset = vi.fn();

let sessionCookie: string | undefined;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => (sessionCookie === undefined ? undefined : { value: sessionCookie })),
  })),
}));

vi.mock("../../../../../../../../../lib/fluxiq", () => ({
  getFluxIQ: () => ({
    programs: {
      identityAccess: { validateSession },
      automationStudio: { assertProjectDomainAccess, runDatasets: { streamRunDataset } },
    },
  }),
  getFluxIQWebRuntimeStatus: vi.fn(),
}));

import { GET } from "../route";

const BASE_URL = "http://127.0.0.1/api/programs/automation-studio/run-datasets/project.one/run.one/listings";

function params(overrides: Partial<{ projectId: string; runId: string; datasetId: string }> = {}) {
  return { params: Promise.resolve({ projectId: "project.one", runId: "run.one", datasetId: "listings", ...overrides }) };
}

function csvStream(chunks: string[]) {
  return {
    format: "csv",
    fileName: "fluxiq-dataset-run.one-listings.csv",
    contentType: "text/csv; charset=utf-8",
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) yield chunk;
    },
  };
}

describe("run dataset streaming route", () => {
  beforeEach(() => {
    validateSession.mockReset();
    assertProjectDomainAccess.mockReset();
    streamRunDataset.mockReset();
    sessionCookie = "authenticated-session";
    validateSession.mockResolvedValue({ user: { id: "user:test" }, role: { id: "role:test", permissions: ["programs.read"] } });
    assertProjectDomainAccess.mockResolvedValue(undefined);
    streamRunDataset.mockResolvedValue(csvStream(["Title\r\n", "'=SUM(A1)\r\n"]));
  });

  it("answers 401 without a session cookie, reading nothing", async () => {
    sessionCookie = undefined;
    const response = await GET(new Request(`${BASE_URL}?format=csv`), params());
    expect(response.status).toBe(401);
    expect(streamRunDataset).not.toHaveBeenCalled();
    expect(assertProjectDomainAccess).not.toHaveBeenCalled();
  });

  it("answers 401 for an invalid session", async () => {
    validateSession.mockResolvedValue(null);
    const response = await GET(new Request(`${BASE_URL}?format=csv`), params());
    expect(response.status).toBe(401);
    expect(streamRunDataset).not.toHaveBeenCalled();
  });

  it("answers 403 without programs.read", async () => {
    validateSession.mockResolvedValue({ user: { id: "user:test" }, role: { id: "role:test", permissions: ["programs.write"] } });
    const response = await GET(new Request(`${BASE_URL}?format=csv`), params());
    expect(response.status).toBe(403);
    expect(streamRunDataset).not.toHaveBeenCalled();
    expect(assertProjectDomainAccess).not.toHaveBeenCalled();
  });

  it("answers 400 for an identifier outside the id rule", async () => {
    const response = await GET(new Request(`${BASE_URL}?format=csv`), params({ datasetId: "listings/../secrets" }));
    expect(response.status).toBe(400);
    expect(streamRunDataset).not.toHaveBeenCalled();
  });

  it("answers 400 for an unsupported format", async () => {
    const response = await GET(new Request(`${BASE_URL}?format=xlsx`), params());
    expect(response.status).toBe(400);
    expect(streamRunDataset).not.toHaveBeenCalled();
  });

  it("answers 404 for a domain mismatch, before any row is read", async () => {
    assertProjectDomainAccess.mockRejectedValue(new Error("Automation Studio project is unavailable in this domain scope."));
    const response = await GET(new Request(`${BASE_URL}?format=csv&domainId=other-domain`), params());
    expect(response.status).toBe(404);
    expect(assertProjectDomainAccess).toHaveBeenCalledWith("project.one", "other-domain");
    expect(streamRunDataset).not.toHaveBeenCalled();
  });

  it("answers 404 when the run stored no such dataset", async () => {
    streamRunDataset.mockResolvedValue(null);
    const response = await GET(new Request(`${BASE_URL}?format=csv`), params());
    expect(response.status).toBe(404);
  });

  it("streams the body with no-store caching, nosniff, and a sanitized attachment name", async () => {
    const response = await GET(new Request(`${BASE_URL}?format=csv&domainId=web-automation`), params());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="fluxiq-dataset-run.one-listings.csv"');
    // The formula-escaped cell reaches the client byte for byte: the route never re-encodes the body.
    expect(await response.text()).toBe("Title\r\n'=SUM(A1)\r\n");
    expect(streamRunDataset).toHaveBeenCalledWith({
      projectId: "project.one",
      runId: "run.one",
      datasetId: "listings",
      format: "csv",
      actorId: "user:test",
    });
  });

  it("strips a quote or newline a file name should never carry", async () => {
    streamRunDataset.mockResolvedValue({ ...csvStream(["Title\r\n"]), fileName: 'evil".csv\r\nX-Injected: 1' });
    const response = await GET(new Request(`${BASE_URL}?format=csv`), params());
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="evil_.csv__X-Injected__1"');
    expect(response.headers.get("X-Injected")).toBeNull();
  });

  it("releases the stream when the client goes away, so the lease and audit row are not lost", async () => {
    const iteratorReturn = vi.fn(async () => ({ done: true as const, value: undefined }));
    streamRunDataset.mockResolvedValue({
      format: "csv",
      fileName: "fluxiq-dataset-run.one-listings.csv",
      contentType: "text/csv; charset=utf-8",
      [Symbol.asyncIterator]: () => ({ next: async () => ({ done: false as const, value: "Title\r\n" }), return: iteratorReturn }),
    });

    const response = await GET(new Request(`${BASE_URL}?format=csv`), params());
    await response.body!.cancel();

    expect(iteratorReturn).toHaveBeenCalledTimes(1);
  });
});
