// A carried proposal's script rewritten to fit the subflow it is carried onto
// (Lab `run-mvan7giv`, t671): a removed output's line taken out, its part
// renamed after a merge under another key, and unwrapped into the router's
// own steps when the subflow it was merged into is the one the router runs.
// Each rewrite is submitted through the real scope check of the subflow it now
// fits, which takes it whole. A lending library's catalogue.
import { describe, expect, it } from "vitest";
import { refusalTestSubmission } from "../../../flow-bootstrap/candidate/tests/refusal-domain-fixture.ts";
import type { AutomationStudioFlowBootstrapInterface } from "../../../flow-bootstrap/plan/index.ts";
import { AutomationStudioSubflowScopedSubmissionController } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioProjectCarriedScript as rewrite } from "../index.ts";

const BUILT = [
  "flow: Find the titles",
  "part find_titles: find the titles",
  "  output: titles = $step.rows.records",
  "  output: count = $step.rows.records",
  "  step rows: read the rows",
  "    node: web.dom.extract_list",
  "    extractList: extraction.1",
  "    extractList.minItems: 0",
  "end"
].join("\n");

const port = (id: string) => ({ id, name: id, valueType: { kind: "unknown" as const } });

/** Whether the scope check of `subflowKey`, with `contract` or as the subflow the router runs, takes `flow`; its refusal codes otherwise. */
async function taken(flow: string, subflowKey: string, contract?: AutomationStudioFlowBootstrapInterface): Promise<true | string[]> {
  const controller = new AutomationStudioSubflowScopedSubmissionController({
    scope: {
      buildId: "build.1", briefId: "brief-2", planDigest: "a".repeat(64), subflowKey,
      parts: [{ partId: "p1", sourceId: "instruction.1", text: "Find the three newest titles by Ada Hart" }],
      ...(contract ? { interface: contract } : {}),
      predecessors: []
    },
    siblings: contract ? ["main"] : [],
    submission: refusalTestSubmission()
  });
  const submitted = await controller.submit({ flow });
  return submitted.ok ? true : ((submitted.check.feedback.issues as Array<{ code: string }> | undefined) ?? []).map((issue) => issue.code);
}

describe("a carried proposal's script rewritten for the subflow it is carried onto", () => {
  it("takes out a removed output's line, its step left as it was", async () => {
    const narrowed = rewrite(BUILT, { removedOutputs: ["count"] }, "find_titles");
    expect(narrowed.split("\n")).toEqual(BUILT.split("\n").filter((line) => !line.includes("output: count")));
    expect(await taken(BUILT, "find_titles", { inputs: [], outputs: [port("titles")] })).not.toBe(true);
    expect(await taken(narrowed, "find_titles", { inputs: [], outputs: [port("titles")] })).toBe(true);
  });

  it("renames its part for the subflow it was merged into under another key", async () => {
    const renamed = rewrite(BUILT, { builtFor: "find_titles" }, "find_books");
    expect(renamed.split("\n")[1]).toBe("part find_books: find the titles");
    expect(renamed.split("\n").slice(2)).toEqual(BUILT.split("\n").slice(2));
    expect(await taken(renamed, "find_books", { inputs: [], outputs: [port("titles"), port("count")] })).toBe(true);
  });

  it("unwraps its part into the router's own steps when the subflow it was merged into is the one the router runs", async () => {
    const routed = rewrite(BUILT, { builtFor: "find_titles", routerRun: true }, "find_and_hold");
    expect(routed.split("\n")).toEqual(["flow: Find the titles", "step rows: read the rows", "  node: web.dom.extract_list", "  extractList: extraction.1", "  extractList.minItems: 0"]);
    expect(await taken(routed, "find_and_hold")).toBe(true);
  });

  it("leaves a script whose part it does not find, and every block but the part's own, as written", () => {
    expect(rewrite(BUILT, { builtFor: "place_hold", removedOutputs: ["count"] }, "find_titles")).toBe(BUILT);
    const helper = `${BUILT}\npart narrow: narrow them\n  output: count = $step.rows.records\nend`;
    expect(rewrite(helper, { removedOutputs: ["count"] }, "find_titles").split("\n").slice(-3)).toEqual(["part narrow: narrow them", "  output: count = $step.rows.records", "end"]);
  });
});
