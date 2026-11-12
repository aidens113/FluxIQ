// @fluxiq-test-group real-sql
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fluxNodeSpecSchema, parseFluxNodeRunRequest } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { complete, RENEW_CARD, runNode } from "../../../answer-first/tests/fake-library.ts";
import { automationStudioAnswerFirstTaskMemoryOf } from "../../../answer-first/task-memory/index.ts";
import { findLoansSpec, fluxNodeLane, OWNER } from "../../tests/library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
const SAVE = "library.secret-source-save";
const secretSpec = () => fluxNodeSpecSchema.parse({
  name: SAVE, runtime: "library", start: "library://account", goal: "Renew the card, noting {note} and {token}.",
  inputs: { type: "object", properties: { note: { type: "string", format: "secret" }, token: { type: "string", format: "secret" } }, required: ["note", "token"] },
  scope: { acts: ["change"] }, options: { judge: "off" }
});
const mapping = { id: "save", kind: "map", target: { fluxNode: SAVE }, inputs: { note: { field: "note" }, token: { field: "token" } }, concurrency: 1, as: "saved" };

describe("secure source configuration", () => {
  it("rebinds declared input secrets after restart without storing them in task or snapshot JSON", async () => {
    const lane = await fluxNodeLane(cleanups);
    const secret = "fixture-equal-declared-secrets";
    await lane.run({ spec: secretSpec(), inputs: { note: secret, token: secret } }, { script: [runNode("save", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Saved.")] });
    const request = {
      pipeline: { name: "library.secret-source", source: { kind: "input", field: "rows" }, steps: [mapping] },
      inputs: { rows: [{ note: secret, token: secret }] }, idempotencyKey: "secret-source"
    };
    const first = await lane.run(request);
    expect(first.result.status).toBe("achieved");
    expect(lane.library.renewals.card).toBe(2);
    const { projects } = await lane.service.listProjects("library");
    const memory = automationStudioAnswerFirstTaskMemoryOf(lane.service, { paths: lane.service.projectPaths, projects: lane.service.projects });
    const parent = (await memory.list(projects[0]!.id)).find((task) => task.pipelineSourcesByScope !== undefined);
    const reference = Object.values(parent?.pipelineSourcesByScope ?? {})[0];
    expect(reference).toBeDefined();
    const snapshot = await lane.service.runDatasets.readImmutableSnapshotPage({ projectId: projects[0]!.id, snapshotId: reference!.snapshotId });
    expect(snapshot?.rows[0]?.row).toMatchObject({ kind: "input", pointer: "/rows/0" });
    expect(JSON.stringify([parent, snapshot, first.events, first.result])).not.toContain(secret);
    for (const file of (await readdir(lane.dataDir, { recursive: true })).filter((entry) => entry.endsWith(".json"))) expect(await readFile(path.join(lane.dataDir, file), "utf8")).not.toContain(secret);
    await lane.restartCore();
    const rotated = await lane.run({ ...request, inputs: { rows: [{ note: "fixture-rotated-note", token: "fixture-rotated-token" }] } });
    expect(rotated.result).toMatchObject({ status: "achieved", flowId: first.result.flowId, cost: { calls: 0 } });
    expect(rotated.asked).toHaveLength(0);
    expect(lane.library.renewals.card).toBe(2);
    expect(JSON.stringify([rotated.events, rotated.result])).not.toContain("fixture-rotated-note");
    expect(JSON.stringify([rotated.events, rotated.result])).not.toContain("fixture-rotated-token");
  });

  it("refuses a secret field from an ephemeral Flow before a parent or mapped act starts", async () => {
    const lane = await fluxNodeLane(cleanups);
    expect(await lane.fluxNodes.register(OWNER, { spec: secretSpec() })).toMatchObject({ ok: true });
    expect(await lane.fluxNodes.register(OWNER, { spec: fluxNodeSpecSchema.parse(findLoansSpec({ name: "library.ephemeral-source", hasCheck: false, options: { judge: "off" } })) })).toMatchObject({ ok: true });
    const request = parseFluxNodeRunRequest({
      pipeline: { name: "library.unsafe-source", source: { kind: "flow", target: { fluxNode: "library.ephemeral-source" }, inputs: { title: { value: "" } } }, steps: [mapping] }, inputs: {}
    });
    if (!request.ok) throw new Error("Invalid fixture request.");
    const before = lane.arm();
    const create = vi.spyOn(lane.service.runDatasets, "createImmutableSnapshot");
    const started = await lane.fluxNodes.start(OWNER, request.value);
    expect(started).toMatchObject({ ok: false, refusal: { code: "invalid_request", message: expect.stringContaining("immutable caller-input binding or a private source dataset") } });
    expect(lane.library.renewals.card ?? 0).toBe(0);
    expect(before.asked()).toHaveLength(0);
    expect(create).not.toHaveBeenCalled();
    const listed = await lane.fluxNodes.list(OWNER, { limit: 20 });
    expect(listed).toMatchObject({ ok: true, value: { runs: [] } });
  });
});
