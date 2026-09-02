import { describe, expect, it, vi } from "vitest";
import {
  classifyProgramApiEndpoint,
  estimateProgramApiPayloadBytes,
  normalizeProgramApiResponse,
  programApiMutationInvalidation
} from "./program-api";

describe("program API instrumentation helpers", () => {
  it("classifies summary, detail, mutation, and other endpoints", () => {
    expect(classifyProgramApiEndpoint("list-runtime-sessions", { summaries: true })).toBe("summary");
    expect(classifyProgramApiEndpoint("get-flow-run-detail")).toBe("detail");
    expect(classifyProgramApiEndpoint("save-flow")).toBe("mutation");
    expect(classifyProgramApiEndpoint("append-recording-note")).toBe("mutation");
    expect(classifyProgramApiEndpoint("normalize-recording")).toBe("mutation");
    expect(classifyProgramApiEndpoint("mine-recording-evidence")).toBe("mutation");
    expect(classifyProgramApiEndpoint("inspect-flow-dependencies")).toBe("other");
    expect(classifyProgramApiEndpoint("save-project-ui-cache", { projectId: "project.1" })).toBe("other");
    expect(classifyProgramApiEndpoint("delete-project-ui-cache", { projectId: "project.1" })).toBe("other");
  });

  it("estimates response size for development metrics without serializing payloads", () => {
    const stringify = vi.spyOn(JSON, "stringify");
    const bytes = estimateProgramApiPayloadBytes({ ok: true, payload: { items: [1, 2, 3] } });
    const stringifyCalls = stringify.mock.calls.length;
    stringify.mockRestore();
    expect(bytes).toBeGreaterThan(0);
    expect(stringifyCalls).toBe(0);
  });

  it("attaches scoped invalidation metadata for Automation Studio mutations", () => {
    expect(programApiMutationInvalidation("save-flow", { projectId: "project.1", flowId: "flow.1" })).toEqual({
      cacheScopes: ["flow", "subflow", "summary", "flow-metadata"],
      resourceIds: ["flow.1"]
    });
    expect(programApiMutationInvalidation("append-recording-note", { projectId: "project.1", recordingId: "recording.1" })).toEqual({
      cacheScopes: ["recording", "timeline", "summary"],
      resourceIds: ["recording.1"]
    });
    expect(programApiMutationInvalidation("save-flow", { projectId: "project.1", flow: { flowId: "flow.nested" } })).toEqual({
      cacheScopes: ["flow", "subflow", "summary", "flow-metadata"],
      resourceIds: ["flow.nested"]
    });
    expect(programApiMutationInvalidation("delete-proposal", { projectId: "project.1", proposalId: "proposal.1" })).toEqual({
      cacheScopes: ["proposal", "summary"],
      resourceIds: ["proposal.1"]
    });
    expect(programApiMutationInvalidation("save-project-hierarchy", { projectId: "project.1" })).toEqual({
      cacheScopes: [],
      resourceIds: []
    });
  });

  it("preserves actionable HTTP error details", () => {
    const headers = new Headers({ "x-request-id": "request.42" });
    expect(normalizeProgramApiResponse({
      ok: false,
      error: "Flow changed.",
      code: "flow_conflict",
      fieldErrors: { name: "Required" },
      conflictRevision: 9
    }, { ok: false, status: 409, headers })).toEqual({
      ok: false,
      error: "Flow changed.",
      status: 409,
      code: "flow_conflict",
      fieldErrors: { name: "Required" },
      conflictRevision: 9,
      requestId: "request.42",
      retryable: false
    });
  });

  it("classifies rate limits and server failures as retryable", () => {
    expect(normalizeProgramApiResponse(undefined, { ok: false, status: 429, headers: new Headers() })).toMatchObject({
      ok: false,
      status: 429,
      code: "rate_limited",
      retryable: true
    });
    expect(normalizeProgramApiResponse(undefined, { ok: false, status: 503, headers: new Headers() })).toMatchObject({
      code: "server_error",
      retryable: true
    });
  });
});
