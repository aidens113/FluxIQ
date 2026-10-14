import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioInstructionScope } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";

// A stored service lists instructions from project SQL, and falls back to the
// summary store's own index (the filters its in-memory branch applies too) when
// SQL has none. The same filters must list the same instructions from both
// (t544: the SQL listing once joined its Flow and Subflow filters with "or" and
// let one Flow's Subflow list another Flow's instructions). A service with no
// storage root cannot save an instruction at all, so the index is the
// reachable reference.
//
// Project SQL stores an `adaptation_review` scope as `flow` and an `on_error`
// scope as `error` (`service/flows/store.ts`); the summary index keeps the
// instruction's own kind. Both paths answer in one vocabulary at the listing
// boundary (`service/summaries/instruction-scope-kind.ts`): each kind is
// filtered, scoped and sorted as SQL stores it, and reported as SQL reads it
// back (t558). No stored row changes.

let tempRoot = "";
const services: AutomationStudioService[] = [];

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "automation-studio-instruction-parity-"));
});
afterEach(async () => {
  await Promise.all(services.splice(0).map(async (service) => await service.close?.()));
  await rm(tempRoot, { recursive: true, force: true });
});

type Filter = { flow?: "a" | "b"; subflow?: "a" | "b"; scopeKind?: string; status?: string };

type Listed = { instructionId: string; scopeKind: string };

async function seeded(service: AutomationStudioService, options: { divergentKinds?: boolean } = {}) {
  services.push(service);
  const project = await service.createProject({ name: "Instruction parity" });
  const flows: Record<"a" | "b", string> = { a: "flow.parity-a", b: "flow.parity-b" };
  const subflows = {} as Record<"a" | "b", string>;
  for (const key of ["a", "b"] as const) {
    await service.createFlow({ projectId: project.id, flowId: flows[key], name: `Parity ${key}` });
    subflows[key] = (await service.createFlowSubflow({ projectId: project.id, flowId: flows[key], name: `Primary ${key}`, role: "primary" })).subflowId;
  }
  const now = Date.now();
  const scopes: Array<[string, AutomationStudioInstructionScope]> = [
    ["instruction.project", { kind: "project", projectId: project.id }],
    ["instruction.flow-a", { kind: "flow", projectId: project.id, flowId: flows.a }],
    ["instruction.flow-b", { kind: "flow", projectId: project.id, flowId: flows.b }],
    ["instruction.subflow-a", { kind: "subflow", projectId: project.id, flowId: flows.a, subflowId: subflows.a }],
    ["instruction.subflow-b", { kind: "subflow", projectId: project.id, flowId: flows.b, subflowId: subflows.b }],
    ...(options.divergentKinds ? [
      ["instruction.review-a", { kind: "adaptation_review", projectId: project.id, flowId: flows.a }],
      ["instruction.review-subflow-a", { kind: "adaptation_review", projectId: project.id, flowId: flows.a, subflowId: subflows.a }],
      ["instruction.review-subflow-b", { kind: "adaptation_review", projectId: project.id, flowId: flows.b, subflowId: subflows.b }],
      ["instruction.error-a", { kind: "on_error", projectId: project.id, flowId: flows.a }],
      ["instruction.error-subflow-a", { kind: "on_error", projectId: project.id, flowId: flows.a, subflowId: subflows.a }]
    ] satisfies Array<[string, AutomationStudioInstructionScope]> : [])
  ];
  for (const [instructionId, scope] of scopes) {
    await service.saveFlowInstruction(project.id, {
      schemaVersion: "0.1", instructionId, title: instructionId, body: "Read the listed records.", scope,
      priority: 100, status: "active", requirement: "required", tags: [], createdAt: now, updatedAt: now
    });
  }
  const page = async (filter: Filter, sort?: "scope"): Promise<Listed[]> => (await service.listFlowInstructionSummaries({
    projectId: project.id,
    ...(filter.flow ? { flowId: flows[filter.flow] } : {}),
    ...(filter.subflow ? { subflowId: subflows[filter.subflow] } : {}),
    ...(filter.scopeKind ? { scopeKind: filter.scopeKind } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(sort ? { sort, direction: "asc" as const } : {}),
    limit: 100, offset: 0
  })).instructions.map((item) => ({ instructionId: item.instructionId, scopeKind: item.scopeKind }));
  const list = async (filter: Filter): Promise<string[]> => (await page(filter)).map((item) => item.instructionId).sort();
  // The summary store's index, reached as it is when project SQL is unavailable.
  const flowStore = (service as unknown as { summaries: { flows: { tryWithFlowResourceRepository: unknown } } }).summaries.flows;
  const fromIndex = async <T>(read: () => Promise<T>): Promise<T> => {
    const sql = flowStore.tryWithFlowResourceRepository;
    flowStore.tryWithFlowResourceRepository = async () => null;
    try { return await read(); } finally { flowStore.tryWithFlowResourceRepository = sql; }
  };
  const indexed = async (filter: Filter): Promise<string[]> => await fromIndex(() => list(filter));
  const indexedPage = async (filter: Filter, sort?: "scope"): Promise<Listed[]> => await fromIndex(() => page(filter, sort));
  return { list, indexed, page, indexedPage };
}

// A Subflow alone and a Subflow with another Flow are here too: on both paths
// a Subflow admits only its own Flow's flow-scoped instructions.
const FILTERS: Filter[] = [
  {},
  { subflow: "a" },
  { subflow: "b" },
  { flow: "a", subflow: "b" },
  { flow: "a" },
  { flow: "a", subflow: "a" },
  { flow: "b", subflow: "b" },
  { flow: "a", subflow: "a", status: "active" },
  { flow: "a", scopeKind: "flow" },
  { flow: "a", subflow: "a", scopeKind: "subflow" },
  { flow: "a", subflow: "a", scopeKind: "project" },
  { scopeKind: "project" },
  { scopeKind: "flow" }
];

describe("instruction summary listing, from project SQL and from the summary index", () => {
  it("lists the same instructions for the same filters", { timeout: 60_000 }, async () => {
    const found = await seeded(new AutomationStudioService({ dataDir: tempRoot, seedFixture: false }));
    for (const filter of FILTERS) {
      expect({ filter, ids: await found.list(filter) }).toEqual({ filter, ids: await found.indexed(filter) });
    }
    expect(await found.list({ flow: "a", subflow: "a" })).toEqual(["instruction.flow-a", "instruction.project", "instruction.subflow-a"]);
    expect(await found.indexed({ subflow: "a" })).toEqual(["instruction.flow-a", "instruction.project", "instruction.subflow-a"]);
    expect(await found.indexed({ flow: "a", subflow: "b" })).toEqual(["instruction.project"]);
  });
});

// The kinds SQL stores under another name, under every filter that could tell
// the two vocabularies apart.
const DIVERGENT_FILTERS: Filter[] = [
  ...FILTERS,
  { scopeKind: "adaptation_review" },
  { scopeKind: "on_error" },
  { scopeKind: "error" },
  { flow: "a", scopeKind: "on_error" },
  { flow: "a", scopeKind: "adaptation_review" },
  { subflow: "a", scopeKind: "flow" },
  { subflow: "b", scopeKind: "flow" },
  { flow: "a", subflow: "a", scopeKind: "on_error" }
];

describe("instruction kinds SQL stores under another name", () => {
  it("answer the same from project SQL and from the summary index, kind and order included", { timeout: 60_000 }, async () => {
    const found = await seeded(new AutomationStudioService({ dataDir: tempRoot, seedFixture: false }), { divergentKinds: true });
    const byId = (items: Listed[]) => [...items].sort((left, right) => left.instructionId.localeCompare(right.instructionId));
    for (const filter of DIVERGENT_FILTERS) {
      expect({ filter, items: byId(await found.page(filter)) }).toEqual({ filter, items: byId(await found.indexedPage(filter)) });
    }
    // Sorted by scope, both paths order by the stored kind.
    const sqlKinds = (await found.page({}, "scope")).map((item) => item.scopeKind);
    expect(sqlKinds).toEqual((await found.indexedPage({}, "scope")).map((item) => item.scopeKind));
    // Reported kinds: a review scope reads back as the Flow scope SQL stores; an error scope keeps its name.
    const reported = Object.fromEntries((await found.indexedPage({ flow: "a" })).map((item) => [item.instructionId, item.scopeKind]));
    expect(reported).toMatchObject({ "instruction.review-a": "flow", "instruction.review-subflow-a": "flow", "instruction.error-a": "on_error", "instruction.error-subflow-a": "on_error" });
    // "error" and "on_error" name the same scopes on both paths.
    expect(await found.indexed({ scopeKind: "error" })).toEqual(["instruction.error-a", "instruction.error-subflow-a"]);
    expect(await found.indexed({ scopeKind: "on_error" })).toEqual(["instruction.error-a", "instruction.error-subflow-a"]);
  });
});
