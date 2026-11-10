import { describe, expect, it } from "vitest";
import type { ProgramCommandTransport } from "../../../automation-studio/data/program-transport";
import type { ApiResponse } from "../../../programs/program-api";
import { findFlowProject, loadFlowFacts, loadFlowListing, loadOutline, loadStepNode } from "..";

type Answer = ApiResponse<unknown>;

/** A transport that answers each endpoint from a table, and records what it was asked. */
function transport(answers: Record<string, Answer | ((payload: Record<string, unknown>) => Answer)>) {
  const asked: Array<{ endpoint: string; payload?: Record<string, unknown> }> = [];
  const answer = (endpoint: string, payload?: Record<string, unknown>): Answer => {
    asked.push({ endpoint, ...(payload ? { payload } : {}) });
    const found = answers[endpoint];
    if (!found) return { ok: false, status: 404, error: `No ${endpoint}` };
    return typeof found === "function" ? found(payload ?? {}) : found;
  };
  const studio: ProgramCommandTransport = {
    get: async <T,>(endpoint: string) => answer(endpoint) as ApiResponse<T>,
    post: async <T,>(endpoint: string, payload: Record<string, unknown>) => answer(endpoint, payload) as ApiResponse<T>
  };
  return { studio, asked };
}

const signal = new AbortController().signal;
const flow = { projectId: "p1", flowId: "f1" };

describe("loadFlowListing", () => {
  it("lists the Flows with their runs", async () => {
    const { studio } = transport({
      "list-flow-summaries": { ok: true, payload: { flows: [{ flowId: "f1", name: "One", updatedAt: 1 }] } },
      "list-flow-runs": { ok: true, payload: { runs: [{ runId: "r", flowId: "f1", status: "failed", startedAt: 2 }] } }
    });
    expect(await loadFlowListing(studio, "p1", signal)).toEqual({ flows: [{ flowId: "f1", name: "One", description: "", updatedAt: 1 }], runs: [{ runId: "r", flowId: "f1", status: "failed", startedAt: 2 }] });
  });

  it("still lists the Flows when the runs cannot be read, and says so by leaving runs out", async () => {
    const { studio } = transport({ "list-flow-summaries": { ok: true, payload: { flows: [] } } });
    expect(await loadFlowListing(studio, "p1", signal)).toEqual({ flows: [] });
  });

  it("fails when the Flows cannot be read, rather than showing an empty project", async () => {
    const { studio } = transport({ "list-flow-summaries": { ok: false, status: 500, error: "The project could not be opened." } });
    await expect(loadFlowListing(studio, "p1", signal)).rejects.toThrow("The project could not be opened.");
  });
});

describe("loadFlowFacts", () => {
  it("reads the name, description, code declaration, last run and when the version was saved", async () => {
    const { studio, asked } = transport({
      "get-graph-viewport": { ok: true, payload: { flow: { name: "Cheapest listings", description: "Find the cheapest", source: { mode: "code", moduleId: "src/nodes/market.ts" }, executionDefaults: { authorizedDomainIds: ["market.example"] } }, page: { nodes: [] } } },
      "list-flow-runs": { ok: true, payload: { runs: [{ runId: "r", flowId: "f1", status: "succeeded", startedAt: 5 }] } },
      "list-graph-revisions": { ok: true, payload: { revisions: [{ revisionNumber: 14, createdAt: 4 }] } }
    });
    expect(await loadFlowFacts(studio, flow, signal)).toEqual({
      name: "Cheapest listings",
      whatItDoes: "Find the cheapest",
      fromCode: true,
      declaredIn: "src/nodes/market.ts",
      sites: ["market.example"],
      lastRun: { runId: "r", flowId: "f1", status: "succeeded", startedAt: 5 },
      runsRead: true,
      savedAt: 4
    });
    expect(asked.some((call) => call.endpoint === "list-flow-instructions")).toBe(false);
  });

  it("falls back to the instruction the Flow was built from", async () => {
    const { studio } = transport({
      "get-graph-viewport": { ok: true, payload: { flow: { name: "Built", source: { mode: "visual" } } } },
      "list-flow-runs": { ok: false, status: 500 },
      "list-graph-revisions": { ok: true, payload: { revisions: [] } },
      "list-flow-instructions": { ok: true, payload: { instructions: [{ instructionId: "other", title: "Evidence-guided generation goal", flowId: "f2" }, { instructionId: "goal", title: "Evidence-guided generation goal", flowId: "f1", status: "active" }] } },
      "get-flow-instruction": (payload) => ({ ok: true, payload: { instruction: { body: payload.instructionId === "goal" ? " Find a lamp under $20. " : "wrong" } } })
    });
    const facts = await loadFlowFacts(studio, flow, signal);
    expect(facts.whatItDoes).toBe("Find a lamp under $20.");
    expect(facts.fromCode).toBe(false);
    expect(facts.runsRead).toBe(false);
    expect(facts.lastRun).toBeUndefined();
  });

  it("fails when the Flow itself cannot be read", async () => {
    const { studio } = transport({ "get-graph-viewport": { ok: false, status: 404, error: "No such Flow." } });
    await expect(loadFlowFacts(studio, flow, signal)).rejects.toThrow("No such Flow.");
  });
});

describe("the other loaders", () => {
  it("loadOutline reads the list and fails plainly", async () => {
    const outline = { interface: { needs: [], gives: [] }, steps: [{ number: "1", nodeIds: ["a"], kind: "act", words: "Open the shop", lasting: [] }], issues: [] };
    expect((await loadOutline(transport({ "get-flow-outline": { ok: true, payload: { outline, revision: 2 } } }).studio, flow, signal)).revision).toBe(2);
    await expect(loadOutline(transport({}).studio, flow, signal)).rejects.toThrow("No get-flow-outline");
  });

  it("loadStepNode pins the node it reads", async () => {
    const { studio, asked } = transport({ "get-graph-viewport": { ok: true, payload: { page: { nodes: [{ nodeId: "other", definitionId: "x", parameterValues: {} }, { nodeId: "n2", definitionId: "builtin.data.limit", parameterValues: { count: 3 } }] } } } });
    expect(await loadStepNode(studio, flow, "n2", signal)).toEqual({ definitionId: "builtin.data.limit", parameterValues: { count: 3 } });
    expect(asked[0]?.payload?.pinnedNodeIds).toEqual(["n2"]);
  });

  it("findFlowProject finds the project that holds the Flow", async () => {
    const { studio } = transport({
      projects: { ok: true, payload: { projects: [{ id: "p1" }, { id: "p2" }] } },
      "list-flow-summaries": (payload) => ({ ok: true, payload: { flows: payload.projectId === "p2" ? [{ flowId: "f9", name: "Nine" }] : [] } })
    });
    expect(await findFlowProject(studio, "f9", signal)).toBe("p2");
    expect(await findFlowProject(studio, "missing", signal)).toBeUndefined();
    await expect(findFlowProject(transport({}).studio, "f9", signal)).rejects.toThrow("No projects");
  });
});
