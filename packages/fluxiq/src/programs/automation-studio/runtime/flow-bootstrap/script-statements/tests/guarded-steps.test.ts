// Where an `only after:` line, or an optional step, cannot stand (t378): each
// refusal names the line that said it and what to write instead. The shapes
// that do build are `../../authoring/tests/guarded-loop.test.ts`'s.
import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../../authoring/index.ts";

const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const registry = new AutomationStudioNodeRegistry();
for (const definition of webDomainNodeDefinitionsFixture()) registry.register(definition);

function refusals(lines: string[]) {
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: lines.join("\n") }, registry, resolution });
  return accepted.issues.filter((issue) => issue.severity === "error").map((issue) => ({ code: issue.code, path: issue.path, message: issue.message }));
}

/** Lines 1-3: open the page. */
const OPEN = ["flow: Do it", "step: open the page", "  node: web.browser.navigate", "  url: https://shop.test/"];
/** A press, labelled, with any extra lines. */
const press = (label: string, extra: string[] = []) => [`step ${label}: press ${label}`, "  node: web.dom.click", `  selector: .${label}`, "  consequences: none", ...extra];
/** A wait, labelled, with any extra lines. */
const pause = (label: string, extra: string[] = []) => [`step ${label}: wait a little`, "  node: builtin.timing.wait", "  duration: 2", "  unit: seconds", ...extra];

describe("an only after line where it cannot stand", () => {
  it("refuses one naming a step that is not optional, naming the line and the fix", () => {
    // notice 5-8, cooldown 9-13 (only after at 13).
    const found = refusals([...OPEN, ...press("notice"), ...pause("cooldown", ["  only after: notice"])]);
    expect(found.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "flow_script.only_after_misplaced", path: "flow.line.13" }]);
    expect(found[0]!.message).toContain("which is not optional");
    expect(found[0]!.message).toContain("Write `optional: yes` on that step");
  });

  it("refuses one not written directly after the optional step it names", () => {
    // notice 5-9, other 10-13, cooldown 14-18 (only after at 18).
    const found = refusals([...OPEN, ...press("notice", ["  optional: yes"]), ...press("other"), ...pause("cooldown", ["  only after: notice"])]);
    expect(found.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "flow_script.only_after_misplaced", path: "flow.line.18" }]);
    expect(found[0]!.message).toContain("not written directly before it");
  });

  it("refuses one naming no step, and one naming a step of another block", () => {
    const nothing = refusals([...OPEN, ...press("notice", ["  optional: yes"]), ...pause("cooldown", ["  only after: ghost"])]);
    expect(nothing.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "flow_script.only_after_misplaced", path: "flow.line.14" }]);
    expect(nothing[0]!.message).toContain("which labels no step");
    const elsewhere = refusals([
      ...OPEN, ...pause("cooldown", ["  only after: notice"]),
      "subflow sale: The sale", "  when: state.page.url contains /sale", ...press("notice", ["  optional: yes"])
    ]);
    expect(elsewhere.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "flow_script.only_after_misplaced", path: "flow.line.9" }]);
    expect(elsewhere[0]!.message).toContain("a step in another block");
  });

  it("refuses one in another span than the optional step it names", () => {
    // rows 5-7; buy 8-13 spans only itself; notice 14-18; cooldown 19-23.
    const found = refusals([
      ...OPEN,
      "step rows: read the rows", "  node: web.dom.extract_list", "  extractList: {\"item\": \".row\", \"fields\": {\"name\": \".name\"}}",
      ...press("buy", ["  repeat over: rows", "  repeat through: notice"]),
      ...press("notice", ["  optional: yes"]),
      ...pause("cooldown", ["  only after: notice"])
    ]);
    expect(found.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "flow_script.only_after_misplaced", path: "flow.line.23" }]);
    expect(found[0]!.message).toContain("its `repeat through:` naming the last of them");
  });

  it("refuses a step that says both optional and only after", () => {
    // notice 5-9, cooldown 10-15 (only after 14, optional 15).
    const found = refusals([...OPEN, ...press("notice", ["  optional: yes"]), ...pause("cooldown", ["  only after: notice", "  optional: yes"])]);
    expect(found.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "flow_script.only_after_misplaced", path: "flow.line.15" }]);
    expect(found[0]!.message).toContain("take one of the two lines off");
  });

  it("refuses a step that runs only after another and branches", () => {
    const found = refusals([...OPEN, ...press("notice", ["  optional: yes"]), ...press("again", ["  only after: notice", "  on failed: go to done"]), ...press("done")]);
    expect(found.map(({ code, path }) => ({ code, path }))).toContainEqual({ code: "flow_script.only_after_misplaced", path: "flow.line.14" });
  });

  it("refuses the last step of a repeat while span running only after another, or being optional", () => {
    // more 5-10 (repeat while: notice); notice 11-15 (optional at 15).
    const optionalEnd = refusals([...OPEN, ...press("more", ["  repeat while: notice", "  repeat most: 3"]), ...press("notice", ["  optional: yes"])]);
    expect(optionalEnd.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "flow_script.optional_misplaced", path: "flow.line.15" }]);
    expect(optionalEnd[0]!.message).toContain("the step whose success repeats the span");
    // more 5-10 (repeat while: cooldown); notice 11-15; cooldown 16-20 (only after at 20).
    const guardedEnd = refusals([...OPEN, ...press("more", ["  repeat while: cooldown", "  repeat most: 3"]), ...press("notice", ["  optional: yes"]), ...pause("cooldown", ["  only after: notice"])]);
    expect(guardedEnd.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "flow_script.only_after_misplaced", path: "flow.line.20" }]);
  });

  it("adds nothing to the refusal of an optional step that was itself refused", () => {
    // notice 5-9 (optional: maybe at 9), cooldown 10-14.
    const found = refusals([...OPEN, ...press("notice", ["  optional: maybe"]), ...pause("cooldown", ["  only after: notice"])]);
    expect(found.map(({ code, path }) => ({ code, path }))).toEqual([{ code: "flow_script.optional_invalid", path: "flow.line.9" }]);
  });
});

describe("an only after line where it stands", () => {
  it("takes several steps after one optional step, each saying only after it, in one group", () => {
    const accepted = acceptAutomationStudioFlowBootstrapResult({
      result: { flow: [...OPEN, ...press("notice", ["  optional: yes"]), ...pause("first", ["  only after: notice"]), ...pause("second", ["  only after: notice"]), ...press("done")].join("\n") },
      registry, resolution
    });
    expect(accepted.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    if (!accepted.ok) return;
    const edges = accepted.plan.subflows[0]!.edges.map((edge) => `${edge.source.nodeKey}.${edge.source.portId} -> ${edge.target.nodeKey}.${edge.target.portId}`);
    expect(edges).toEqual(["s2.failed -> s5.in", "s1.success -> s2.in", "s2.success -> s3.in", "s3.success -> s4.in", "s4.success -> s5.branches", "s5.success -> s6.in"]);
  });
});
