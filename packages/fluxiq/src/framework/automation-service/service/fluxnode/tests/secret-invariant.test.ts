// @fluxiq-test-group real-sql
// The invariant behind a FluxNode's secret input (`format: "secret"`): its value never reaches the attempt
// through the caller options' `inputs` (where the attempt records it and where a saved Flow's input-valued steps
// copy it into fallbacks), and so appears in nothing the attempt keeps. Run through exploration and replay on the
// scripted lending library (`./library-lane.ts`): the caller options each attempt was handed are captured at the
// service seam, and every file the service wrote (the attempt store's records, its steps each round, the Flow and
// its drafts) is read as text. If a secret is ever put back into `caller.inputs`, this test fails.
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FluxNodeEventAnswer, FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioAnswerFirstCallerOptions } from "../../flow-bootstrap-commands/index.ts";
import { complete, toolCall } from "../../answer-first/tests/fake-library.ts";
import { LOANS_OUTPUT } from "../../answer-first/tests/fake-library-engine.ts";
import { FIND_LOANS, findLoans, findLoansSpec, fluxNodeLane } from "./library-lane.ts";

vi.setConfig({ testTimeout: 180_000 });

const FIRST = "clockm";
const SECOND = "rivers";
const OPEN = "birds";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const passing = (event: FluxNodeRunEvent): FluxNodeEventAnswer | undefined => (event.type === "check_needed" ? { type: "check_answer", eventId: event.eventId, pass: true } : undefined);
const secretSpec = () => findLoansSpec({ inputs: { type: "object", properties: { title: { type: "string", format: "secret" }, note: { type: "string" } }, required: ["title"] }, goal: "List my loans whose title has {title} in it." });
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

async function stepLog(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-secret-invariant-"));
  const before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
  cleanups.push(async () => {
    if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });
  return directory;
}

describe("a FluxNode's secret input is never in the caller options' inputs, nor in anything the attempt keeps", () => {
  it.each([
    ["written by its binding", () => [writtenFind(), toolCall("forward", "core.run_flow", { from: 2 }), complete("Found the loans.")]],
    ["typed out by the model", () => [findLoans(FIRST), complete("Found the loans.")]]
  ])("through exploration and a replay, %s", async (_how, script) => {
    const steps = await stepLog();
    const lane = await fluxNodeLane(cleanups);
    // The caller options each attempt is handed, at the one seam every attempt goes through.
    // Everything the attempt can write down: the function-valued options are the caller's process and are never kept.
    const received: Omit<AutomationStudioAnswerFirstCallerOptions, "check" | "personAsk">[] = [];
    const generate = lane.service.generateFlowBootstrapAdaptation.bind(lane.service);
    vi.spyOn(lane.service, "generateFlowBootstrapAdaptation").mockImplementation(async (input, caller) => {
      if (caller) {
        const { check: _check, personAsk: _personAsk, ...kept } = caller;
        received.push(structuredClone(kept));
      }
      return await generate(input, caller);
    });

    const first = await lane.run({ spec: secretSpec(), inputs: { title: FIRST, note: OPEN } }, { script: script(), answers: passing });
    expect(first.result).toMatchObject({ status: "achieved", path: "explored" });
    const second = await lane.run({ name: "library.find-loans", inputs: { title: SECOND, note: OPEN } }, { answers: passing });
    expect(second.result).toMatchObject({ status: "achieved", path: "replayed" });

    // (a) Both attempts got the inputs without the secret: the plain input is there, the secret's name and value are not.
    expect(received).toHaveLength(2);
    for (const options of received) {
      expect(options.inputs).toEqual({ note: OPEN });
      const text = JSON.stringify(options);
      expect(text).not.toContain(FIRST);
      expect(text).not.toContain(SECOND);
    }

    // (b) Nothing the attempt store or anything else under the service's data directory holds, nor the step files, has either value.
    const files = await readdir(lane.dataDir, { recursive: true });
    expect(files.some((file) => /attempt/iu.test(String(file)))).toBe(true);
    for (const secret of [FIRST, SECOND]) {
      expect(await filesHolding(lane.dataDir, secret)).toEqual([]);
      expect(await filesHolding(steps, secret)).toEqual([]);
    }
    // The scan reads something: the plain input the attempt carried is in the store, so a leak would be found the same way.
    expect((await filesHolding(lane.dataDir, OPEN)).length).toBeGreaterThan(0);
  });
});
