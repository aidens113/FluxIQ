// @fluxiq-test-group real-sql
// Why a saved Flow's run stopped, in the step log (`../stopped-note.ts`): the step, its code and the node
// that failed, inside the repeat that ran it, and never a failure's words. On the lending library.

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { automationStudioAnswerFirstFlowRun } from "../index.ts";
import { flowRunFixture, LOANS_OUTPUT, savedStep } from "../../tests/fake-library-engine.ts";
import { READ_LOANS, RENEW_LOAN } from "../../tests/fake-library.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const STEPS = [
  savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }, { label: "the list of loans" }),
  savedStep(2, RENEW_LOAN, { control: "Renew" }, { consequences: ["modify_existing"], routing: { kind: "repeat", through: "saved.2", over: "saved.1" }, label: "Renew" })
];
const SECRET = "the card number 4111";

async function stepLog(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-stopped-note-"));
  const before = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
  cleanups.push(async () => {
    if (before === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
    else process.env.FLUXIQ_LLM_STEP_LOG_DIR = before;
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function notes(directory: string): Promise<string[]> {
  const folders = (await readdir(directory)).filter((name) => name.endsWith("-note"));
  return await Promise.all(folders.map(async (folder) => String((JSON.parse(await readFile(path.join(directory, folder, "meta.json"), "utf8")) as { line?: string }).line)));
}

describe("a saved Flow's run that stopped short", () => {
  it("says in the step log which step, its code, and the node inside the repeat that failed, with no words of the failure", async () => {
    const directory = await stepLog();
    const fixture = await flowRunFixture({ permittedConsequences: ["modify_existing"] }, cleanups);
    fixture.target.over = ({ nodeId }) => nodeId === RENEW_LOAN ? { status: "failed", route: "failed", message: SECRET, failure: { category: "graph_validation_or_unknown_node", code: "library.renew_refused", retryable: false } } : undefined;
    const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: STEPS, stepsDigest: "digest.stopped" });
    expect(outcome).toMatchObject({ kind: "ran", reachedEnd: false });
    const written = await notes(directory);
    expect(written, JSON.stringify(written)).toEqual([expect.stringMatching(/^The saved Flow's run stopped at step \d+: .*domain\.library\.renew_loan \(graph_validation_or_unknown_node\/library\.renew_refused\)/u)]);
    expect(written.join(" ")).not.toContain(SECRET);
  });

  it("writes nothing for a run that reached its end", async () => {
    const directory = await stepLog();
    const fixture = await flowRunFixture({ permittedConsequences: ["modify_existing"] }, cleanups);
    expect(await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: STEPS, stepsDigest: "digest.whole" })).toMatchObject({ kind: "ran", reachedEnd: true });
    expect(await notes(directory)).toEqual([]);
  });
});
