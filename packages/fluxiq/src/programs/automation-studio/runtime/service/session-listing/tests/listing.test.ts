// Covers the runtime session listing (t604): a project that has run many large
// sessions lists them as bounded summaries, one filtered page at a time, with
// a cursor; a summary row written before the candidate trial was carried is
// rewritten from its session; and a service with no data directory pages the
// same way.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JsonObject } from "../../../../../../core/index.ts";
import { createRecord } from "../../../../../database-manager/storage/sqlite-repository.ts";
import type { AutomationStudioRuntimeSession } from "../../../../model/index.ts";
import type { AutomationStudioRuntimeRunSummary } from "../../../../storage/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioRuntimeSessionListingFilter, listAutomationStudioRuntimeSummaryMemoryPage } from "../index.ts";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let tempRoot: string;
const services = new Set<AutomationStudioService>();

/** About 200 KB of page evidence per session, the kind of content a listing must never carry. */
const EVIDENCE = "x".repeat(200_000);

type SessionWriter = { writeRuntimeSession(projectId: string, session: AutomationStudioRuntimeSession): Promise<void> };
type SummaryRows = { summaries: { runtimeSummaryRepository(projectId: string): { put(record: unknown): Promise<unknown> } } };

function open(dataDir?: string): AutomationStudioService {
  const service = new AutomationStudioService(dataDir ? { dataDir, seedFixture: false } : { seedFixture: false });
  services.add(service);
  return service;
}

function session(runId: string, flowId: string, queuedAt: number, candidateTrial?: JsonObject): AutomationStudioRuntimeSession {
  return {
    schemaVersion: "0.1", runId, projectId: null, targetKind: "flow", targetId: flowId, flowId, status: "succeeded", queuedAt, startedAt: queuedAt, finishedAt: queuedAt + 1,
    flow: { schemaVersion: "0.1", flowId, ownerKind: "task", ownerId: flowId, name: flowId, createdAt: 1, updatedAt: 1, nodes: [], edges: [], metadata: { evidence: EVIDENCE } },
    metadata: { pageView: EVIDENCE, ...(candidateTrial ? { candidateTrial } : {}) }
  };
}

async function write(service: AutomationStudioService, projectId: string, written: AutomationStudioRuntimeSession): Promise<void> {
  await (service as unknown as SessionWriter).writeRuntimeSession(projectId, { ...written, projectId });
}

/** Every page of a filtered listing, following `nextCursor`, with each page's serialised size. */
async function everyPage(service: AutomationStudioService, projectId: string, options: Record<string, unknown>) {
  const pages: Array<{ runs: AutomationStudioRuntimeRunSummary[]; bytes: number; total: number }> = [];
  let cursor: string | null = null;
  do {
    const page = await service.listRuntimeSessionSummaries(projectId, { ...options, ...(cursor ? { cursor } : {}) });
    pages.push({ runs: page.runs, bytes: Buffer.byteLength(JSON.stringify(page)), total: page.total });
    cursor = page.nextCursor;
  } while (cursor && pages.length < 50);
  return pages;
}

describe("the runtime session listing", () => {
  beforeEach(async () => { tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-t604-listing-")); });
  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("lists many large sessions as bounded summaries, filtered to one build's trials and paged by cursor", async () => {
    const service = open(tempRoot);
    const project = await service.createProject({ name: "Listing" });
    for (const flowId of ["flow.one", "flow.two"]) await service.createFlow({ projectId: project.id, flowId, name: flowId });
    // 36 sessions, about 7 MB on disk: a build's twelve trials of one candidate, another
    // candidate's trials, and plain runs of two Flows, interleaved in time.
    for (let index = 0; index < 36; index += 1) {
      const kind = index % 3;
      const trial = kind === 0 ? { candidateId: "candidate.wanted", revision: index, digest: `digest.${index}`, start: "reset", execution: "succeeded", evidence: EVIDENCE } : kind === 1 ? { candidateId: "candidate.other", revision: index } : undefined;
      await write(service, project.id, session(`run.${String(index).padStart(2, "0")}`, kind === 2 && index % 2 === 0 ? "flow.two" : "flow.one", 1_000 + index, trial));
    }

    const pages = await everyPage(service, project.id, { flowId: "flow.one", candidateId: "candidate.wanted", limit: 5 });

    expect(pages.map((page) => page.runs.length)).toEqual([5, 5, 2]);
    expect(pages.every((page) => page.total === 12)).toBe(true);
    const runs = pages.flatMap((page) => page.runs);
    // Newest queued first, each once, and only the wanted candidate's trials.
    expect(runs.map((run) => run.runId)).toEqual(Array.from({ length: 12 }, (_, step) => `run.${String(33 - step * 3).padStart(2, "0")}`));
    expect(runs[0]).toMatchObject({ flowId: "flow.one", status: "succeeded", queuedAt: 1_033, candidateTrial: { candidateId: "candidate.wanted", revision: 33, digest: "digest.33", start: "reset", execution: "succeeded" } });
    for (const run of runs) {
      expect(run).not.toHaveProperty("trace");
      expect(run).not.toHaveProperty("flow");
      expect(run).not.toHaveProperty("metadata");
      expect(run.candidateTrial).not.toHaveProperty("evidence");
    }
    // A page of summaries is a few kilobytes, against the 7 MB the sessions hold.
    expect(Math.max(...pages.map((page) => page.bytes))).toBeLessThan(4_000);

    // The full session is read by id.
    const full = await service.getRuntimeSession(project.id, runs[0]!.runId);
    expect(full?.metadata?.pageView).toBe(EVIDENCE);
  });

  it("filters by run ids and status, and refuses a cursor or filter it cannot read", async () => {
    const service = open(tempRoot);
    const project = await service.createProject({ name: "Listing filters" });
    await service.createFlow({ projectId: project.id, flowId: "flow.one", name: "One" });
    for (let index = 0; index < 4; index += 1) await write(service, project.id, session(`run.${index}`, "flow.one", 2_000 + index));

    const byIds = await service.listRuntimeSessionSummaries(project.id, { runIds: ["run.1", "run.3", "run.missing"] });
    expect(byIds.runs.map((run) => run.runId)).toEqual(["run.3", "run.1"]);
    expect(byIds).toMatchObject({ total: 2, nextCursor: null });
    expect((await service.listRuntimeSessionSummaries(project.id, { statuses: ["running"] })).runs).toEqual([]);

    await expect(service.listRuntimeSessionSummaries(project.id, { cursor: "not-a-cursor!" })).rejects.toMatchObject({ diagnostic: { code: "runtime_sessions.cursor_invalid" } });
    await expect(service.listRuntimeSessionSummaries(project.id, { cursor: Buffer.from("{}").toString("base64url") })).rejects.toMatchObject({ diagnostic: { code: "runtime_sessions.cursor_invalid" } });
    await expect(service.listRuntimeSessionSummaries(project.id, { flowId: 42 })).rejects.toMatchObject({ diagnostic: { code: "runtime_sessions.filter_invalid" } });
    await expect(service.listRuntimeSessionSummaries(project.id, { runIds: Array.from({ length: 101 }, (_, index) => `run.${index}`) })).rejects.toMatchObject({ diagnostic: { code: "runtime_sessions.filter_invalid" } });
  });

  it("rewrites a summary row written before the candidate trial was carried", async () => {
    const service = open(tempRoot);
    const project = await service.createProject({ name: "Listing migration" });
    await service.createFlow({ projectId: project.id, flowId: "flow.one", name: "One" });
    await write(service, project.id, session("run.old", "flow.one", 3_000, { candidateId: "candidate.old", revision: 1 }));
    // The row as Core wrote it before t604: no candidate trial, no summary version.
    const repository = (service as unknown as SummaryRows).summaries.runtimeSummaryRepository(project.id);
    await repository.put(createRecord({ id: "run.old", kind: "runtime.sessions", data: { runId: "run.old", targetKind: "flow", targetId: "flow.one", status: "succeeded", queuedAt: 3_000, flowId: "flow.one", updatedAt: 3_001 }, nowMs: 3_001 }));

    const page = await service.listRuntimeSessionSummaries(project.id, { candidateId: "candidate.old" });

    expect(page.runs).toHaveLength(1);
    expect(page.runs[0]).toMatchObject({ runId: "run.old", candidateTrial: { candidateId: "candidate.old", revision: 1 }, summaryVersion: 2 });
  });

  it("pages a service with no data directory in the same order and by the same cursor", () => {
    const summaries: AutomationStudioRuntimeRunSummary[] = Array.from({ length: 7 }, (_, index) => ({
      runId: `run.${index}`, targetKind: "flow", targetId: "flow.one", flowId: "flow.one", status: "succeeded", queuedAt: 4_000 + (index % 4), updatedAt: 1,
      ...(index % 2 === 0 ? { candidateTrial: { candidateId: "candidate.mem" } } : {})
    }));
    const pages: string[][] = [];
    let cursor: string | null = null;
    do {
      const page = listAutomationStudioRuntimeSummaryMemoryPage(summaries, automationStudioRuntimeSessionListingFilter({ candidateId: "candidate.mem", limit: 3, ...(cursor ? { cursor } : {}) }));
      expect(page.total).toBe(4);
      pages.push(page.runs.map((run) => run.runId));
      cursor = page.nextCursor;
    } while (cursor && pages.length < 10);
    // Queued 4002 (run.2, run.6 -- the later id first), 4000 (run.4, run.0).
    expect(pages).toEqual([["run.6", "run.2", "run.4"], ["run.0"]]);
  });
});
