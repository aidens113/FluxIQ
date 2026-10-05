// Which row each pass of a repeat was on, in the step log (t195 w43).
//
// Live run `run-musp474o-e0ed7432`: the build's test ran a repeated Confirm once
// per kept row (`dryrun.<n>.<k>.pass.<p>`), and no pass folder said which row
// it was on: `call.json` writes the row by field names only, and only a judged
// test's judge request named the rows. Two of the run's three tests were never
// judged. Now each pass's `meta.json` carries `pass`, `of` and, where the list
// read answered `readRows.rows`, that pass's row label, screened as the judge's
// are (`../../../result-verification/build-test/read-rows.ts`).
// The llm barrel first, as `../../decision-context/tests/recorded-runs.ts` says why.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { automationStudioLlmStepLogTool, replayAutomationStudioFlowDraft, type AutomationStudioLlmEvidenceToolExecutionResult } from "../../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftReplayNode } from "../replay-span.ts";

const NODES: Record<string, AutomationStudioFlowDraftReplayNode> = {
  "node.list": { inputs: [], outputs: [{ id: "records", type: "array" }] },
  "node.press": { inputs: [{ id: "item" }], outputs: [] }
};
const nodeOf = (id: string) => NODES[id];

const ROWS: JsonObject[] = [{ name: "Amara Osei", mutual: "23 mutual friends" }, { name: "Lin Zhao", mutual: "9 mutual friends" }];

const step = (position: number, node: string, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId: node,
  toolId: "core.run_node",
  input: { node, parameters: { target: `#s${position}` }, consequences: [] },
  ranWith: { node, parameters: { target: `#s${position}` }, consequences: [] },
  effect: node === "node.list" ? "observe" : "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  replay: { from: { location: `https://site.test/${position}` }, produced: { at: position } },
  ...over
});

/** A list, a press repeated over its rows, and a press after the loop. */
const draft = () => [step(1, "node.list"), step(2, "node.press", { routing: { kind: "repeat", over: "d1", through: "d2" } }), step(3, "node.press")];

/** The list answers `ROWS` under `outputs`, and `readRows` in its evidence when given. */
function executeTool(readRows?: JsonValue) {
  return async ({ value }: { callId: string; toolId: string; value: JsonObject }): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => ({
    kind: "llm_evidence_tool_execution",
    evidence: value.node === "node.list" && readRows !== undefined ? { ok: true, readRows } : { ok: true },
    effectApplied: true,
    resultCode: "core.replay.replayed",
    ...(value.node === "node.list" ? { outputs: { records: ROWS } } : {})
  });
}

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-pass-row-"));
  vi.stubEnv("FLUXIQ_LLM_STEP_LOG_DIR", directory);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

/** Every step folder's meta.json, by its call id. */
function metas(): Map<string, Record<string, unknown>> {
  const found = new Map<string, Record<string, unknown>>();
  for (const folder of readdirSync(directory).filter((name) => /^\d{4}-/u.test(name))) {
    const meta = JSON.parse(readFileSync(path.join(directory, folder, "meta.json"), "utf8")) as Record<string, unknown>;
    found.set(meta.callId as string, meta);
  }
  return found;
}

async function test(readRows?: JsonValue): Promise<Map<string, Record<string, unknown>>> {
  const replayed = await replayAutomationStudioFlowDraft({ steps: draft(), attempt: 1, executeTool: automationStudioLlmStepLogTool(executeTool(readRows)), nodeOf });
  expect(replayed.verdict.ok).toBe(true);
  return metas();
}

describe("a pass of a repeat in the step log", () => {
  it("writes each pass's number, the pass count and the row's label, in the list's order", async () => {
    const written = await test({ rows: [{ name: "Amara Osei" }, { name: "Lin Zhao" }] });
    expect(written.get("dryrun.1.2.pass.1")).toMatchObject({ pass: 1, of: 2, row: "Amara Osei" });
    expect(written.get("dryrun.1.2.pass.2")).toMatchObject({ pass: 2, of: 2, row: "Lin Zhao" });
  });

  it("writes a label the screen withholds as withheld, never the text", async () => {
    const secret = "sk-proj-abcdefghijklmnopqrstuvwxyz0123";
    const written = await test({ rows: [{ name: secret }, { name: "Lin Zhao" }] });
    expect(written.get("dryrun.1.2.pass.1")).toMatchObject({ pass: 1, of: 2, row: "(withheld)" });
    expect(readFileSync(path.join(directory, readdirSync(directory).find((name) => name.startsWith("0003-"))!, "meta.json"), "utf8")).not.toContain(secret);
  });

  it("writes the pass and count and no row when the list named no rows", async () => {
    const written = await test();
    for (const [callId, pass] of [["dryrun.1.2.pass.1", 1], ["dryrun.1.2.pass.2", 2]] as const) {
      expect(written.get(callId)).toMatchObject({ pass, of: 2 });
      expect(written.get(callId)).not.toHaveProperty("row");
    }
  });

  it("writes none of them on a call that is not a pass", async () => {
    const written = await test({ rows: [{ name: "Amara Osei" }, { name: "Lin Zhao" }] });
    for (const callId of ["dryrun.1.reset", "dryrun.1.1", "dryrun.1.3"]) {
      expect(written.has(callId)).toBe(true);
      for (const key of ["pass", "of", "row"]) expect(written.get(callId)).not.toHaveProperty(key);
    }
  });
});
