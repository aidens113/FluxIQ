// The act record beside a Flow (t861): taken once by the first run, kept apart per Flow,
// held in memory with no data root, and never read through something it cannot parse.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioAttemptActRecord, type AutomationStudioAttemptActCall } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { AutomationStudioAnswerFirstRunActStore } from "../store.ts";
import { AutomationStudioAnswerFirstRunActsUnreadable } from "../unreadable.ts";
import { automationStudioAnswerFirstRunActStoreOf } from "../store-of.ts";

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  vi.restoreAllMocks();
});

const WORDS = { what: "Made a thing", where: "On a page" };
const CALL: AutomationStudioAttemptActCall = { actionId: "press", parameters: { selector: "#save" }, consequences: ["create_new"], stage: "exploration" };

function memoryStore() {
  const noFiles = (): never => {
    throw new Error("no files without a root");
  };
  return new AutomationStudioAnswerFirstRunActStore({ root: undefined }, { flowDirectory: noFiles }, { ensureProjectStructure: async () => noFiles() });
}

async function fileStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-attempt-acts-"));
  dirs.push(dir);
  const ensured: string[] = [];
  const ensureProjectStructure = async (projectId: string): Promise<void> => {
    ensured.push(projectId);
  };
  await mkdir(path.join(dir, "p", "f"), { recursive: true });
  const store = new AutomationStudioAnswerFirstRunActStore({ root: dir }, { flowDirectory: (projectId, flowId) => path.join(dir, projectId, flowId) }, { ensureProjectStructure });
  return { dir, store, ensured, file: path.join(dir, "p", "f", "attempt-acts.json") };
}

function landed(now = 1) {
  const record = new AutomationStudioAttemptActRecord({ now: () => now });
  record.settled(CALL, { effectApplied: true, words: WORDS });
  return record;
}

describe.each([["with no data root, in memory", async () => ({ store: memoryStore() })], ["beside the Flow", fileStore]])("the store %s", (_name, make) => {
  it("has nothing to give where nothing was saved", async () => {
    const { store } = await make();
    await expect(store.get("p", "f")).resolves.toBeUndefined();
    await expect(store.forRun("p", "f", "run.1")).resolves.toBeUndefined();
  });

  it("gives the first run the acts, the same run again, and a later run nothing", async () => {
    const { store } = await make();
    await store.save("p", "f", landed().data());
    const first = await store.forRun("p", "f", "run.1");
    expect(first?.acts).toHaveLength(1);
    await expect(store.forRun("p", "f", "run.1")).resolves.toEqual(first);
    await expect(store.forRun("p", "f", "run.2")).resolves.toBeUndefined();
    expect((await store.get("p", "f"))?.acts).toHaveLength(1);
  });

  it("lets only one of two runs started at once take them", async () => {
    const { store } = await make();
    await store.save("p", "f", landed().data());
    const [one, two] = await Promise.all([store.forRun("p", "f", "run.1"), store.forRun("p", "f", "run.2")]);
    expect([one, two].filter((taken) => taken !== undefined)).toHaveLength(1);
  });

  it("keeps a carried act carried through a later save of the same record, and carries a new act on its own", async () => {
    const { store } = await make();
    const record = landed();
    await store.save("p", "f", record.data());
    await store.forRun("p", "f", "run.1");
    await store.save("p", "f", record.data());
    await expect(store.forRun("p", "f", "run.2")).resolves.toBeUndefined();
    record.settled({ ...CALL, actionId: "tap" }, { effectApplied: true, words: WORDS });
    await store.save("p", "f", record.data());
    const next = await store.forRun("p", "f", "run.3");
    expect(next?.acts).toHaveLength(1);
    expect(new AutomationStudioAttemptActRecord({ seed: next! }).carried(CALL)).toBeUndefined();
    expect(new AutomationStudioAttemptActRecord({ seed: next! }).carried({ ...CALL, actionId: "tap" })).toBeDefined();
  });

  it("carries a new landing of an act a run already carried: the person's new attempt did it again", async () => {
    const { store } = await make();
    await store.save("p", "f", landed(1).data());
    await store.forRun("p", "f", "run.1");
    await store.save("p", "f", landed(2).data());
    await expect(store.forRun("p", "f", "run.2")).resolves.toMatchObject({ acts: [{ state: "landed" }] });
  });

  it("gives a run what may have landed too, never an undeclared press or one that did not happen", async () => {
    const { store } = await make();
    const record = new AutomationStudioAttemptActRecord();
    record.settled({ ...CALL, actionId: "maybe" }, { effectApplied: false, uncertain: true, words: WORDS });
    record.settled({ ...CALL, actionId: "quiet", consequences: [] }, { effectApplied: true, words: WORDS });
    await store.save("p", "f", record.data());
    const taken = await store.forRun("p", "f", "run.1");
    expect(taken?.acts.map((act) => act.state)).toEqual(["may_have_landed"]);
  });

  it("takes back what an earlier run took when that run ended without success, and never from one that succeeded or is still going", async () => {
    const { store } = await make();
    await store.save("p", "f", landed().data());
    await store.forRun("p", "f", "run.1");
    const statuses = new Map<string, string>([["run.1", "running"]]);
    const status = async (runId: string) => statuses.get(runId);
    await expect(store.forRun("p", "f", "run.2", status)).resolves.toBeUndefined();
    statuses.set("run.1", "failed");
    await expect(store.forRun("p", "f", "run.3", status)).resolves.toMatchObject({ acts: [{ state: "landed" }] });
    statuses.set("run.3", "cancelled");
    await expect(store.forRun("p", "f", "run.4", status)).resolves.toMatchObject({ acts: [{ state: "landed" }] });
    statuses.set("run.4", "interrupted");
    await expect(store.forRun("p", "f", "run.5", status)).resolves.toMatchObject({ acts: [{ state: "landed" }] });
    statuses.set("run.5", "succeeded");
    await expect(store.forRun("p", "f", "run.6", status)).resolves.toBeUndefined();
    await expect(store.forRun("p", "f", "run.7", async () => undefined)).resolves.toBeUndefined();
  });

  it("keeps each Flow's record apart", async () => {
    const { store } = await make();
    await store.save("p", "f", landed().data());
    await expect(store.forRun("p", "other", "run.1")).resolves.toBeUndefined();
    await expect(store.forRun("q", "f", "run.1")).resolves.toBeUndefined();
    await expect(store.forRun("p", "f", "run.1")).resolves.toBeDefined();
  });
});

describe("on disk", () => {
  it("writes the versioned record beside the Flow, and asks for the project's folders first", async () => {
    const { store, file, ensured } = await fileStore();
    await store.save("p", "f", landed().data());
    expect(ensured).toEqual(["p"]);
    const written = JSON.parse(await readFile(file, "utf8")) as { data: Record<string, unknown> };
    expect(written.data).toMatchObject({ kind: "attempt_run_acts", schemaVersion: 1, projectId: "p", flowId: "f", carried: [], record: { kind: "attempt_act_record", schemaVersion: 1 } });
  });

  it.each([
    ["is not JSON", "{ not json"],
    ["fails the strict read", JSON.stringify({ version: 1, data: { kind: "attempt_run_acts", schemaVersion: 1, projectId: "p", flowId: "f", carried: [], record: { kind: "attempt_act_record", schemaVersion: 9, acts: [], rows: [] } } })],
    ["was written for another Flow", JSON.stringify({ version: 1, data: { kind: "attempt_run_acts", schemaVersion: 1, projectId: "p", flowId: "another", carried: [], record: { kind: "attempt_act_record", schemaVersion: 1, acts: [], rows: [] } } })]
  ])("refuses the run once when the file %s, since it may hold what must not be repeated; the next run goes ahead", async (_why, content) => {
    const { store, file } = await fileStore();
    await writeFile(file, content);
    await expect(store.forRun("p", "f", "run.1")).rejects.toBeInstanceOf(AutomationStudioAnswerFirstRunActsUnreadable);
    await expect(store.forRun("p", "f", "run.2")).resolves.toBeUndefined();
    await expect(readFile(`${file}.unreadable`, "utf8")).resolves.toBe(content);
    await expect(store.get("p", "f")).resolves.toBeUndefined();
  });

  it("lets a new attempt write over an unreadable file", async () => {
    const { store, file } = await fileStore();
    await writeFile(file, "{ not json");
    await store.save("p", "f", landed().data());
    await expect(store.forRun("p", "f", "run.1")).resolves.toMatchObject({ acts: [{ state: "landed" }] });
  });

  it("refuses the run when it cannot mark the acts carried, rather than leave a later run to guess", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-attempt-acts-"));
    dirs.push(dir);
    let healthy = true;
    const ensureProjectStructure = async (): Promise<void> => {
      if (!healthy) throw new Error("disk gone");
    };
    const store = new AutomationStudioAnswerFirstRunActStore({ root: dir }, { flowDirectory: () => dir }, { ensureProjectStructure });
    await store.save("p", "f", landed().data());
    healthy = false;
    await expect(store.forRun("p", "f", "run.1")).rejects.toThrow("disk gone");
    healthy = true;
    await expect(store.forRun("p", "f", "run.1")).resolves.toMatchObject({ acts: [{ state: "landed" }] });
  });
});

describe("one store per service", () => {
  it("gives the same owner the same store, and another owner its own", () => {
    const ports = { paths: { root: undefined }, flows: { flowDirectory: () => "" }, projects: { ensureProjectStructure: async () => undefined } };
    const owner = {};
    expect(automationStudioAnswerFirstRunActStoreOf(owner, ports)).toBe(automationStudioAnswerFirstRunActStoreOf(owner, ports));
    expect(automationStudioAnswerFirstRunActStoreOf({}, ports)).not.toBe(automationStudioAnswerFirstRunActStoreOf(owner, ports));
  });
});
