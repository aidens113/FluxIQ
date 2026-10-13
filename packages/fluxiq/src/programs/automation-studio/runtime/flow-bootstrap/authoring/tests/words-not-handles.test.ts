// A plain word in a Flow script is never turned into a handle (t514).
//
// Social gate run `run-mv6v2jh4-69244ffb` (step 0083) wrote a wait step with
// `target: t846` and `state: absent`. `state` names no parameter, so the
// near-name fallback took it for `expectedState`, an object parameter, and the
// object reader turned the bare word `absent` into `{ handle: "absent" }`. No
// view had printed such a handle, so plan resolution refused the step with a
// bare `bootstrap.handle_unresolved` naming no key, and the model sent the same
// script until the build ended.
//
// Three things hold that shut: a bare word is a handle only under a parameter
// that takes one (its example is a handle reference); a text value never
// matches an object parameter by name; and the refusal of the unknown key says
// what to write instead, read from the node's own schema.

import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";
import { automationStudioFlowBootstrapIssueFeedback } from "../../plan/index.ts";
import { waitNodeDefinitionFixture } from "../../plan/tests/index.ts";

const registry = new AutomationStudioNodeRegistry([...canonicalBuiltinAutomationNodeDefinitions, waitNodeDefinitionFixture()]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [] as string[], permissions: [] as string[] };

function accept(...lines: string[]) {
  return acceptAutomationStudioFlowBootstrapResult({
    result: { summary: "s", flow: ["flow: Wait for the composer to close", "step: wait for the composer to close", "  node: domain.demo.wait", ...lines].join("\n") },
    registry,
    resolution
  });
}

describe("a bare word under a parameter that takes no handle", () => {
  it("never becomes a handle: `state: absent` is not read as `expectedState: {handle: absent}`", () => {
    const accepted = accept("  target: t846", "  state: absent");
    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    const node = accepted.refusedPlan?.subflows[0]?.nodes.find((candidate) => candidate.definitionId === "domain.demo.wait");
    expect(node?.parameters?.expectedState).toBeUndefined();
    expect(JSON.stringify(accepted.refusedPlan)).not.toContain("\"handle\":\"absent\"");
    const unknown = accepted.issues.find((issue) => issue.code === "bootstrap.unknown_parameter");
    expect(unknown?.path).toMatch(/\.parameters\.state$/u);
  });

  it("is refused as a value the parameter does not take, when written under the object parameter itself", () => {
    const accepted = accept("  target: t846", "  expectedState: absent");
    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    expect(accepted.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "bootstrap.invalid_parameter_value", path: expect.stringMatching(/\.parameters\.expectedState$/u) })
    ]));
  });

  it("is still the handle it names under a parameter that takes one", () => {
    const accepted = accept("  target: t846", "  wait: condition=absent");
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const node = accepted.plan.subflows[0]?.nodes.find((candidate) => candidate.definitionId === "domain.demo.wait");
    expect(node?.parameters).toMatchObject({ target: { handle: "t846" }, wait: { condition: "absent" } });
  });

  it("is still a handle under a misspelled name for the parameter that takes one", () => {
    const accepted = accept("  targt: t846", "  wait: condition=absent");
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.plan.subflows[0]?.nodes.find((candidate) => candidate.definitionId === "domain.demo.wait")?.parameters).toMatchObject({ target: { handle: "t846" } });
  });
});

describe("the refusal of a key no parameter is called", () => {
  it("says what to write instead, from the node's own schema: `wait: condition=absent`", () => {
    const accepted = accept("  target: t846", "  state: absent");
    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    const unknown = accepted.issues.find((issue) => issue.code === "bootstrap.unknown_parameter");
    expect(unknown?.instead).toContain("wait: condition=absent");
    expect(unknown?.instead).toContain("state: absent");
    // And the model is told it: the feedback carries the sentence and the node to describe.
    const feedback = automationStudioFlowBootstrapIssueFeedback({ issues: accepted.issues, plan: accepted.refusedPlan, registry, resolution });
    expect(feedback).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "bootstrap.unknown_parameter", instead: expect.stringContaining("wait: condition=absent"), node: "domain.demo.wait" })
    ]));
  });

  it("says nothing it cannot read from the schema: a word no parameter takes gets no form", () => {
    const accepted = accept("  target: t846", "  state: sideways");
    expect(accepted.ok).toBe(false);
    if (accepted.ok) return;
    const unknown = accepted.issues.find((issue) => issue.code === "bootstrap.unknown_parameter");
    expect(unknown).toBeDefined();
    expect(unknown?.instead).toBeUndefined();
  });
});
