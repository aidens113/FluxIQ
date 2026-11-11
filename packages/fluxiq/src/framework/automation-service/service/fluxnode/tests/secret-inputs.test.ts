// @fluxiq-test-group real-sql
// A secret input (`format: "secret"`) on the lending library (`./library-lane.ts`), a kind of site none
// of the Lab's scenarios is: the model is never sent its value; the build's test enters it through the
// binding the model wrote; the saved Flow and its export hold the binding with no default; a replay with
// another secret enters that one with no model call; and every event, the result, every step file and
// everything Core wrote to disk show `[withheld]` or nothing in its place.
//
// The secrets are lowercase stand-ins the library's search matches without case ("clockm" finds
// "Clockmaking"), so no row the site shows holds them: whatever still holds one was given it by Core.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseFluxNodeRunEvent, type FluxNodeEventAnswer, type FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { complete, toolCall } from "../../answer-first/tests/fake-library.ts";
import { LOANS_OUTPUT } from "../../answer-first/tests/fake-library-engine.ts";
import { FIND_LOANS, findLoans, findLoansSpec, fluxNodeLane, OWNER } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });

const FIRST = "clockm";
const SECOND = "rivers";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const passing = (event: FluxNodeRunEvent): FluxNodeEventAnswer | undefined => (event.type === "check_needed" ? { type: "check_answer", eventId: event.eventId, pass: true } : undefined);
const spec = () => findLoansSpec({ inputs: { type: "object", properties: { title: { type: "string", format: "secret" } }, required: ["title"] } });
/** The step the model writes: the secret by its binding, with a stand-in test value, run by the build's own test. */
const writtenFind = (): JsonObject => toolCall("find", "core.run_node", { node: FIND_LOANS, parameters: { title: { $input: "title", test: "stand-in" }, recordOutput: LOANS_OUTPUT }, consequences: [], write: true });

/** Every file under `root` whose bytes hold `text`, by its path below `root`. */
async function filesHolding(root: string, text: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    // A file Core removes between the listing and the read (a journal, a temp file) holds nothing to find.
    const bytes = await readFile(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return Buffer.alloc(0);
      throw error;
    });
    if (bytes.includes(text)) found.push(path.relative(root, file));
  }
  return found;
}

/** A step log for this test alone, as the Lab turns one on. */
async function stepLog(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-secret-steps-"));
  const before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
  cleanups.push(async () => {
    if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  return directory;
}

async function exportText(lane: Awaited<ReturnType<typeof fluxNodeLane>>): Promise<string> {
  const exported = await lane.fluxNodes.exportFlow(OWNER, "library.find-loans", { pin: false });
  if (!exported.ok) throw new Error(`export refused: ${JSON.stringify(exported.refusal)}`);
  return JSON.stringify(exported.value);
}

describe("a FluxNode's secret input", () => {
  it("is entered through its binding, never sent to the model, saved, exported or told, and a replay enters the new one", async () => {
    const steps = await stepLog();
    const lane = await fluxNodeLane(cleanups);
    const first = await lane.run({ spec: spec(), inputs: { title: FIRST } }, { script: [writtenFind(), toolCall("forward", "core.run_flow", { from: 2 }), complete("Found the loans.")], answers: passing });
    expect(first.result).toMatchObject({ status: "achieved", path: "explored" });
    expect(first.result.outputs).toEqual({ loans: [{ title: "Clockmaking", due: "2030-01-03" }] });
    // The build's test entered the secret itself, through the binding the model wrote.
    expect(lane.library.calls.filter((call) => call.value.replay === "step").map((call) => (call.value.parameters as JsonObject).title)).toEqual([FIRST]);
    // The model was told the input's name, never its value.
    expect(JSON.stringify(first.decisions[0]?.context)).toContain("the secret \\\"title\\\" (withheld from you");
    expect(JSON.stringify(first.asked)).not.toContain(FIRST);
    // The program's check got the inputs withheld, and nothing it was told holds the secret.
    expect(first.events.find((event) => event.type === "check_needed")).toMatchObject({ inputs: { title: "[withheld]" } });
    for (const event of first.events) expect(parseFluxNodeRunEvent(event).ok).toBe(true);
    expect(JSON.stringify([first.events, first.result, first.state])).not.toContain(FIRST);

    const exported = await exportText(lane);
    expect(exported).not.toContain(FIRST);
    expect(exported).toContain("{\"$state\":{\"path\":\"title\"}}");
    expect(exported).not.toMatch(/"path":"title","fallback"/u);

    const second = await lane.run({ name: "library.find-loans", inputs: { title: SECOND } }, { answers: passing });
    expect(second.asked).toHaveLength(0);
    expect(second.result).toMatchObject({ status: "achieved", path: "replayed", cost: { calls: 0 } });
    expect(second.result.outputs).toEqual({ loans: [{ title: "Atlas of Rivers", due: "2030-01-01" }] });
    expect(lane.engineFinds).toEqual([SECOND]);
    expect(JSON.stringify([second.events, second.result])).not.toContain(SECOND);

    // Nothing Core wrote holds either secret: the Flow, its drafts, the attempt's record, traces, saved commands, step files.
    expect(await filesHolding(lane.dataDir, FIRST)).toEqual([]);
    expect(await filesHolding(lane.dataDir, SECOND)).toEqual([]);
    expect(await filesHolding(steps, FIRST)).toEqual([]);
    expect(await filesHolding(steps, SECOND)).toEqual([]);
    // Not an empty log: the build's run of the bound step was written down, the secret it was sent with withheld (the model's stand-in was "stand-in").
    expect((await filesHolding(steps, "[withheld]")).filter((file) => file.endsWith("call.json"))).not.toEqual([]);
  });

  it("typed out by the model, is still bound with no default, and withheld from what the model is sent next", async () => {
    const lane = await fluxNodeLane(cleanups);
    const first = await lane.run({ spec: spec(), inputs: { title: FIRST } }, { script: [findLoans(FIRST), complete("Found the loans.")], answers: passing });
    expect(first.result).toMatchObject({ status: "achieved", path: "explored" });
    // The scripted model typed it, which a model never shown it cannot; every request after that call withholds it.
    expect(first.decisions.length).toBeGreaterThan(1);
    expect(JSON.stringify(first.asked)).not.toContain(FIRST);
    const exported = await exportText(lane);
    expect(exported).not.toContain(FIRST);
    expect(exported).toContain("{\"$state\":{\"path\":\"title\"}}");
    const second = await lane.run({ name: "library.find-loans", inputs: { title: SECOND } }, { answers: passing });
    expect(second.result).toMatchObject({ status: "achieved", path: "replayed" });
    expect(lane.engineFinds).toEqual([SECOND]);
  });
});
