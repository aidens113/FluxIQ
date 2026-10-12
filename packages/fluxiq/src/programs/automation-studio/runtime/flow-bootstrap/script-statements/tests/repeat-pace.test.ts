// `repeat pace: <time>` on a span's first step becomes that step's plan node
// `paceMs` (t378), which the adaptation writes to the Flow node's
// `metadata.paceMs` (`../../tests/pace.test.ts`). Refused, naming its line,
// where no span takes it, where its span already has one, or where the time
// cannot be read.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../../authoring/index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

function accept(lines: string[]) {
  return acceptAutomationStudioFlowBootstrapResult({ result: { flow: lines.join("\n") }, registry, resolution });
}

function errors(accepted: ReturnType<typeof accept>) {
  return accepted.issues.filter((issue) => issue.severity === "error").map((issue) => ({ code: issue.code, path: issue.path }));
}

/** Lines 1-7: open the page, read the rows (label `rows`). Then the press (8-11) and its repeat lines from 12. */
function rowsLoop(pressLines: string[], after: string[] = []): string[] {
  return [
    "flow: Press every row",
    "step: open the page",
    "  node: web.browser.navigate",
    "  url: https://shop.test/",
    "step rows: read the rows",
    "  node: web.dom.extract_list",
    "  extractList: {\"item\": \".row\", \"fields\": {\"name\": \".name\"}}",
    "step press: press the row",
    "  node: web.dom.click",
    "  selector: .press",
    "  consequences: none",
    ...pressLines,
    ...after
  ];
}

/** Each node with a pace, as `key paceMs`. */
function paces(accepted: ReturnType<typeof accept>): string[] {
  return accepted.ok ? accepted.plan.subflows[0]!.nodes.flatMap((node) => node.paceMs === undefined ? [] : [`${node.key} ${node.paceMs}`]) : [];
}

describe("a span's repeat pace", () => {
  it.each([
    ["6 s", 6_000], ["6s", 6_000], ["6", 6_000], ["6 seconds", 6_000], ["1.5 s", 1_500],
    ["1500 ms", 1_500], ["1500ms", 1_500], ["2 min", 120_000], ["1 minute", 60_000]
  ] as const)("reads %s as %i ms on the span's first step", (written, paceMs) => {
    const accepted = accept(rowsLoop(["  repeat over: rows", `  repeat pace: ${written}`]));
    expect(errors(accepted)).toEqual([]);
    expect(paces(accepted)).toEqual([`s5 ${paceMs}`]);
  });

  it("leaves a span with no pace line, and every other step, without one", () => {
    expect(paces(accept(rowsLoop(["  repeat over: rows"])))).toEqual([]);
  });

  it("refuses a time it cannot read, or one outside 1 ms to 10 min, naming the line", () => {
    for (const written of ["soon", "0 s", "11 min", "6 hours", ""]) {
      const accepted = accept(rowsLoop(["  repeat over: rows", `  repeat pace: ${written}`]));
      expect(errors(accepted), written).toEqual([{ code: "flow_script.repeat_pace_invalid", path: "flow.line.13" }]);
    }
  });

  it("reads a pace written under another step of the span as the span's own", () => {
    const accepted = accept(rowsLoop(["  repeat over: rows", "  repeat through: check"], ["step check: wait for the row to go", "  node: web.dom.wait_for_selector", "  selector: .gone", "  repeat pace: 4 s"]));
    expect(errors(accepted)).toEqual([]);
    expect(paces(accepted)).toEqual(["s5 4000"]);
  });

  it("refuses a pace no span takes in, and a second pace for one span, each naming its own line", () => {
    const loose = accept([...rowsLoop([]), "  repeat pace: 6 s"]);
    expect(errors(loose)).toEqual([{ code: "flow_script.repeat_pace_misplaced", path: "flow.line.12" }]);
    const twice = accept(rowsLoop(["  repeat over: rows", "  repeat through: check", "  repeat pace: 6 s"], ["step check: wait for the row to go", "  node: web.dom.wait_for_selector", "  selector: .gone", "  repeat pace: 4 s"]));
    expect(errors(twice)).toEqual([{ code: "flow_script.repeat_pace_misplaced", path: "flow.line.18" }]);
  });

  it("paces a repeat while span on its first step, beside repeat most", () => {
    const accepted = accept(rowsLoop(["  repeat while: press", "  repeat most: 5", "  repeat pace: 2 s"]));
    expect(errors(accepted)).toEqual([]);
    expect(accepted.ok && accepted.plan.subflows[0]!.nodes.find((node) => node.definitionId === "web.output.dom-click")?.paceMs).toBe(2_000);
  });
});
