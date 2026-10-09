// A `repeat most:` written under any step of a `repeat while` span bounds that
// span (t378, lane C `run-mv0fuotv-805294d7` 0036), and is refused only where no
// span can take it or the span already has one -- naming its own line.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../../authoring/index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

/** Open a page, then a span from `more` to `check` repeated while `check` succeeds; `bounds` are extra lines by the step they go under. */
function script(bounds: { head?: string; middle?: string; last?: string; after?: string }): string {
  return [
    "step: open the list",                    // 1
    "  node: web.browser.navigate",           // 2
    "  url: https://shop.test/list",          // 3
    "step more: show more",                   // 4
    "  node: web.dom.click",                  // 5
    "  selector: .more",                      // 6
    "  consequences: none",                   // 7
    "  repeat while: check",                  // 8
    ...(bounds.head ? [bounds.head] : []),
    "step: wait for the rows",
    "  node: web.dom.wait_for_selector",
    "  selector: .row",
    ...(bounds.middle ? [bounds.middle] : []),
    "step check: check there is more",
    "  node: web.dom.wait_for_selector",
    "  selector: .more",
    ...(bounds.last ? [bounds.last] : []),
    "step: read the rows",
    "  node: web.dom.extract_list",
    "  extractList: {\"item\": \".row\", \"fields\": {\"name\": \".name\"}}",
    ...(bounds.after ? [bounds.after] : [])
  ].join("\n");
}

function accept(text: string) {
  return acceptAutomationStudioFlowBootstrapResult({ result: { flow: text }, registry, resolution });
}

function mostOf(text: string): unknown {
  const accepted = accept(text);
  if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
  return accepted.plan.subflows[0]!.nodes.find((node) => node.definitionId === "builtin.control.repeat")?.parameters?.most;
}

describe("a repeat most: line", () => {
  it("bounds its span beside repeat while:, as it always did", () => {
    expect(mostOf(script({ head: "  repeat most: 4" }))).toBe(4);
  });

  it("bounds the span it is written in, under the span's last step or any step inside it", () => {
    expect(mostOf(script({ last: "  repeat most: 6" }))).toBe(6);
    expect(mostOf(script({ middle: "  repeat most: 3" }))).toBe(3);
  });

  it("is refused at its own line under a step no repeat while span takes in", () => {
    // The span keeps its own bound, so the stray one is the only refusal.
    const text = script({ head: "  repeat most: 4", after: "  repeat most: 5" });
    const accepted = accept(text);
    expect(accepted.ok).toBe(false);
    const line = text.split("\n").indexOf("  repeat most: 5") + 1;
    expect(accepted.issues.filter((issue) => issue.severity === "error")).toEqual([
      expect.objectContaining({ code: "flow_script.repeat_most_misplaced", path: `flow.line.${line}`, message: expect.stringContaining(`at line ${line}`) })
    ]);
    expect(accepted.issues[0]!.message).toContain("beside the `repeat while:` line");
  });

  it("is refused when its span already gives a bound, naming both lines", () => {
    const text = script({ head: "  repeat most: 4", last: "  repeat most: 6" });
    const accepted = accept(text);
    expect(accepted.ok).toBe(false);
    const rows = text.split("\n");
    const member = rows.indexOf("  repeat most: 6") + 1;
    const head = rows.indexOf("  repeat most: 4") + 1;
    const refused = accepted.issues.filter((issue) => issue.severity === "error");
    expect(refused).toEqual([expect.objectContaining({ code: "flow_script.repeat_most_misplaced", path: `flow.line.${member}` })]);
    expect(refused[0]!.message).toContain(`already says \`repeat most:\` at line ${head}`);
  });
});
