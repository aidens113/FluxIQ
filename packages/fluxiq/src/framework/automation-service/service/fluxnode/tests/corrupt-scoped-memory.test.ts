// @fluxiq-test-group real-sql
import { parseFluxNodeRunRequest } from "@fluxiq/contracts/fluxnode";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ProgramJsonStore } from "../../../../persistence/program-state/storage.ts";
import { automationStudioAnswerFirstTaskKey } from "../../answer-first/task-key/index.ts";
import { complete, RENEW_CARD, runNode } from "../../answer-first/tests/fake-library.ts";
import { fluxNodeLane, OWNER } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

it("refuses unreadable scoped execution state before admitting a keyed retry across restart", async () => {
  const lane = await fluxNodeLane(cleanups);
  const spec = { name: "library.corrupt-scope", runtime: "library", start: "library://account", goal: "Renew the card.", scope: { acts: ["change"] }, options: { judge: "off" } };
  const script = [runNode("save", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Saved.")];
  const body = { spec, inputs: {}, idempotencyKey: "before-corruption" };
  const first = await lane.run(body, { script });
  await lane.run({ name: spec.name, inputs: {} });
  expect(lane.library.renewals.card).toBe(2);
  const { projects } = await lane.service.listProjects("library");
  const taskId = automationStudioAnswerFirstTaskKey({ instructionText: "", callerKey: `fluxnode:${spec.name}:${first.result.specHash}` });
  const taskFile = lane.service.projectPaths.projectFile(projects[0]!.id, "task-memory", `${taskId}.json`);
  await new ProgramJsonStore(taskFile, () => ({})).write({ unreadable: true });
  await lane.restartCore();
  lane.arm({ script });
  const request = parseFluxNodeRunRequest(body);
  if (!request.ok) throw new Error("Invalid fixture request.");
  const started = await lane.fluxNodes.start(OWNER, request.value);
  if (started.ok) {
    const stream = await lane.fluxNodes.events(OWNER, started.value.runId, 0, new AbortController().signal);
    if (!stream.ok) throw new Error(stream.refusal.code);
    for await (const _event of stream.value) { /* Observe an incorrectly admitted execution to its natural ending. */ }
  }
  expect(lane.library.renewals.card).toBe(2);
  expect(started).toMatchObject({ ok: false, refusal: { code: "invalid_request", message: expect.stringContaining("stored execution state") } });
  const listed = await lane.fluxNodes.list(OWNER, { limit: 20 });
  expect(listed).toMatchObject({ ok: true, value: { runs: [] } });
  expect((await readdir(lane.dataDir, { recursive: true })).filter((file) => file.endsWith(".owner"))).toHaveLength(0);
  expect(await new ProgramJsonStore(taskFile, () => ({})).read()).toEqual({ unreadable: true });
});

it("refuses a corrupt execution/task binding before admission and releases its owner", async () => {
  const lane = await fluxNodeLane(cleanups);
  const spec = { name: "library.corrupt-binding", runtime: "library", start: "library://account", goal: "Renew the card.", scope: { acts: ["change"] }, options: { judge: "off" } };
  const body = { spec, inputs: {}, idempotencyKey: "binding-corruption" };
  await lane.run(body, { script: [runNode("save", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Saved.")] });
  const { projects } = await lane.service.listProjects("library");
  const folder = lane.service.projectPaths.projectFile(projects[0]!.id, "fluxnode", "executions");
  const name = (await readdir(folder)).find((entry) => entry.endsWith(".json"));
  expect(name).toBeDefined();
  const store = new ProgramJsonStore(path.join(folder, name!), () => ({}));
  await store.write({ ...await store.read(), taskKey: "unrelated-task" });
  await lane.restartCore();
  const request = parseFluxNodeRunRequest(body);
  if (!request.ok) throw new Error("Invalid fixture request.");
  const started = await lane.fluxNodes.start(OWNER, request.value);
  expect(started).toMatchObject({ ok: false, refusal: { code: "invalid_request", message: expect.stringContaining("original task or resolved target identity") } });
  expect(lane.library.renewals.card).toBe(1);
  expect((await readdir(lane.dataDir, { recursive: true })).filter((file) => file.endsWith(".owner"))).toHaveLength(0);
  expect(await store.read()).toMatchObject({ taskKey: "unrelated-task" });
  expect(await lane.fluxNodes.list(OWNER, { limit: 20 })).toMatchObject({ ok: true, value: { runs: [] } });
});
