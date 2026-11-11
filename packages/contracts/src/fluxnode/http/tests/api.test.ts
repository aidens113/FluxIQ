// The HTTP API: paths, the event stream framing, and the bodies with rules of their own.
import { describe, expect, it } from "vitest";
import {
  FLUXNODE_API_PATHS,
  FLUXNODE_ERROR_HTTP_STATUS,
  fluxNodeApiPath,
  fluxNodeExportFlowRequestSchema,
  fluxNodeFlowExportSchema,
  fluxNodeListRunsQuerySchema,
  fluxNodeRunStateSchema,
  formatFluxNodeEventFrame,
  parseFluxNodeEventFrame
} from "../index.ts";
import { FLUXNODE_ERROR_CODES, type FluxNodeRunEvent } from "../../run/index.ts";

const RESULT = {
  runId: "run_1",
  name: "market.cheapest-listings",
  flowId: "flow_9",
  flowPath: "market/cheapest-listings",
  status: "stopped",
  verdict: { label: "unverified" },
  path: "explored",
  cost: { calls: 3, tokens: 1200, usd: 0.02 },
  timings: { startedAt: 1, endedAt: 2, durationMs: 1 }
};

describe("paths", () => {
  it("are versioned, and fill and encode their parameters", () => {
    expect(FLUXNODE_API_PATHS.runs).toBe("/api/fluxnode/v1/runs");
    expect(fluxNodeApiPath("runEvents", { runId: "run 1/2" })).toBe("/api/fluxnode/v1/runs/run%201%2F2/events");
    expect(fluxNodeApiPath("fluxNodeExport", { name: "market.cheapest-listings" })).toBe("/api/fluxnode/v1/fluxnodes/market.cheapest-listings/export");
    expect(() => fluxNodeApiPath("run")).toThrow(TypeError);
  });

  it("give every error code a status", () => {
    for (const code of FLUXNODE_ERROR_CODES) expect(FLUXNODE_ERROR_HTTP_STATUS[code], code).toBeGreaterThanOrEqual(400);
  });

  it("names only codes the engine or the SDK can meet", () => {
    for (const gone of ["no_host", "rate_limited", "unavailable"]) expect(FLUXNODE_ERROR_CODES as readonly string[], gone).not.toContain(gone);
    expect(FLUXNODE_ERROR_HTTP_STATUS.invalid_spec).toBe(400);
    expect(FLUXNODE_ERROR_HTTP_STATUS.unauthenticated).toBe(401);
  });
});

describe("the event stream", () => {
  const event: FluxNodeRunEvent = { runId: "run_1", seq: 7, at: 5, type: "cost", cost: { calls: 1, tokens: 10, usd: 0 }, budgetUsd: 5 };

  it("round-trips a frame", () => {
    const frame = formatFluxNodeEventFrame(event);
    expect(frame.startsWith("id: 7\nevent: cost\ndata: ")).toBe(true);
    expect(frame.endsWith("\n\n")).toBe(true);
    expect(parseFluxNodeEventFrame(frame)).toEqual({ ok: true, value: event });
  });

  it("ignores comments, joins data lines and checks id and event", () => {
    const json = JSON.stringify(event);
    // Data lines join with a newline, so split where JSON allows whitespace.
    const cut = json.indexOf(",") + 1;
    expect(parseFluxNodeEventFrame(`: keep-alive\r\ndata: ${json.slice(0, cut)}\r\ndata:${json.slice(cut)}`).ok).toBe(true);
    expect(parseFluxNodeEventFrame(`id: 8\ndata: ${json}`)).toMatchObject({ ok: false, issues: [{ code: "event_frame.id_mismatch" }] });
    expect(parseFluxNodeEventFrame(`event: step\ndata: ${json}`)).toMatchObject({ ok: false, issues: [{ code: "event_frame.type_mismatch" }] });
    expect(parseFluxNodeEventFrame("id: 1")).toMatchObject({ ok: false, issues: [{ code: "event_frame.no_data" }] });
    expect(parseFluxNodeEventFrame("data: {nope")).toMatchObject({ ok: false, issues: [{ code: "event_frame.not_json" }] });
  });
});

describe("bodies", () => {
  it("give a run a result exactly when it has ended, with the same status", () => {
    const running = { runId: "run_1", name: "market.cheapest-listings", state: "running", startedAt: 1, eventsPath: "/api/fluxnode/v1/runs/run_1/events", cost: { calls: 0, tokens: 0, usd: 0 } };
    expect(fluxNodeRunStateSchema.safeParse(running).success).toBe(true);
    expect(fluxNodeRunStateSchema.safeParse({ ...running, result: RESULT }).success).toBe(false);
    expect(fluxNodeRunStateSchema.safeParse({ ...running, state: "stopped", result: RESULT }).success).toBe(true);
    expect(fluxNodeRunStateSchema.safeParse({ ...running, state: "achieved", result: RESULT }).success).toBe(false);
  });

  it("read the list query from text, with a default limit", () => {
    expect(fluxNodeListRunsQuerySchema.parse({ limit: "20", state: "running" })).toEqual({ limit: 20, state: "running" });
    expect(fluxNodeListRunsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(fluxNodeListRunsQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });

  it("describe an export and its pin request", () => {
    expect(fluxNodeExportFlowRequestSchema.parse({})).toEqual({ pin: false });
    const exported = {
      format: "fluxiq.fluxnode-flow",
      formatVersion: 1,
      name: "market.cheapest-listings",
      specHash: "c".repeat(64),
      flowId: "flow_9",
      flowPath: "market/cheapest-listings",
      flowVersion: 4,
      pinned: true,
      exportedAt: 10,
      flow: { nodes: [] }
    };
    expect(fluxNodeFlowExportSchema.safeParse(exported).success).toBe(true);
    expect(fluxNodeFlowExportSchema.safeParse({ ...exported, formatVersion: 2 }).success).toBe(false);
    const proposal = { proposalId: "proposal.0123456789abcdef", flowId: "flow_10", stepsDigest: "d".repeat(64), runId: "run_1", path: "explored", proposedAt: 9 };
    expect(fluxNodeFlowExportSchema.safeParse({ ...exported, stepsDigest: "e".repeat(64), proposals: [proposal] }).success).toBe(true);
    expect(fluxNodeFlowExportSchema.safeParse({ ...exported, proposals: [{ ...proposal, saved: {} }] }).success).toBe(false);
    expect(fluxNodeExportFlowRequestSchema.parse({ pin: true, proposal: "proposal.0123456789abcdef" })).toEqual({ pin: true, proposal: "proposal.0123456789abcdef" });
    expect(fluxNodeExportFlowRequestSchema.safeParse({ pin: true, proposal: "not an id" }).success).toBe(false);
  });
});
