// A value written inside quote marks is the text inside them (t464).
//
// Lane B round 8 (`run-mv5jnc62-01c3609a`) wrote `value: "2"` for a quantity
// select, and the string parameter was sent with its quote marks, so no option
// matched and four trials of an otherwise correct Flow failed on it. The rule
// is held here once (`../quoted-value.ts`), then through the two readers that
// use it: a step's parameter (`../values.ts`, via the acceptor) and a route
// condition (`../condition.ts`).

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { readAutomationStudioRouteCondition } from "../condition.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";
import { authoringQuotedValue } from "../quoted-value.ts";

const registry = new AutomationStudioNodeRegistry([...webDomainNodeDefinitionsFixture(), ...canonicalBuiltinAutomationNodeDefinitions]);
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };

/** The parameters of the one node a one-step script builds. */
function parametersOf(...lines: string[]): JsonObject | undefined {
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { summary: "s", flow: ["flow: One step", "step: the step", ...lines.map((line) => `  ${line}`)].join("\n") }, registry, resolution });
  expect(accepted.ok, JSON.stringify(accepted)).toBe(true);
  return accepted.ok ? accepted.plan.subflows[0]?.nodes[0]?.parameters : undefined;
}

describe("the quoted-value reader", () => {
  it("reads a value inside one matching pair of quote marks as the text inside", () => {
    expect(authoringQuotedValue("\"2\"")).toBe("2");
    expect(authoringQuotedValue("'blue shirt'")).toBe("blue shirt");
    expect(authoringQuotedValue("`/cart`")).toBe("/cart");
    expect(authoringQuotedValue("  \"2\"  ")).toBe("2");
    expect(authoringQuotedValue("\"\"")).toBe("");
  });

  it("keeps a quote mark inside the value", () => {
    expect(authoringQuotedValue("'a \"b\" c'")).toBe("a \"b\" c");
    expect(authoringQuotedValue("'What's new'")).toBe("What's new");
    expect(authoringQuotedValue("\"say \"hi\"\"")).toBe("say \"hi\"");
  });

  it("reads escapes: JSON's inside double quotes, the mark and the backslash inside the others", () => {
    expect(authoringQuotedValue("\"a \\\"b\\\" c\"")).toBe("a \"b\" c");
    expect(authoringQuotedValue("\"line\\nbreak\"")).toBe("line\nbreak");
    expect(authoringQuotedValue("'it\\'s'")).toBe("it's");
    expect(authoringQuotedValue("'C:\\temp'")).toBe("C:\\temp");
    expect(authoringQuotedValue("'a\\\\b'")).toBe("a\\b");
  });

  it("is no quoted value without a matching pair", () => {
    expect(authoringQuotedValue("2")).toBeUndefined();
    expect(authoringQuotedValue("\"2")).toBeUndefined();
    expect(authoringQuotedValue("2\"")).toBeUndefined();
    expect(authoringQuotedValue("\"2'")).toBeUndefined();
    expect(authoringQuotedValue("\"")).toBeUndefined();
    expect(authoringQuotedValue("say \"hi\"")).toBeUndefined();
    // The closing mark is escaped, so the value never closed.
    expect(authoringQuotedValue("'it\\'")).toBeUndefined();
  });
});

describe("a step's quoted parameter value", () => {
  it("sends the text inside the quotes to a string parameter, as the select of run-mv5jnc62 needed", () => {
    expect(parametersOf("node: web.dom.select", "target: t1661", "value: \"2\"")?.value).toBe("2");
    expect(parametersOf("node: web.dom.select", "target: t1661", "value: '2'")?.value).toBe("2");
    expect(parametersOf("node: web.dom.type", "target: t5", "text: \"blue shirt\"")?.text).toBe("blue shirt");
  });

  it("keeps an unquoted value, and a quote inside one, exactly as written", () => {
    expect(parametersOf("node: web.dom.select", "target: t1661", "value: 2")?.value).toBe("2");
    expect(parametersOf("node: web.dom.type", "target: t5", "text: say \"hi\"")?.text).toBe("say \"hi\"");
    expect(parametersOf("node: web.dom.type", "target: t5", "text: 'a \"b\" c'")?.text).toBe("a \"b\" c");
  });

  it("reads a quoted number as the number for a number parameter", () => {
    expect(parametersOf("node: web.dom.type", "target: t5", "text: x", "timeoutMs: \"2000\"")?.timeoutMs).toBe(2000);
  });

  it("leaves a state binding as written", () => {
    expect(parametersOf("node: web.dom.type", "target: t5", "text: {\"$state\":{\"path\":\"inputs.query\"}}")?.text).toEqual({ $state: { path: "inputs.query" } });
  });
});

describe("a route condition's quoted value", () => {
  it("is read by the same rule", () => {
    const read = readAutomationStudioRouteCondition("page.path contains \"/cart\"");
    expect(read).toEqual({ ok: true, condition: { signalPath: "state.page.path", operator: "contains", expected: "/cart" } });
    const escaped = readAutomationStudioRouteCondition("page.title is \"a \\\"b\\\"\"");
    expect(escaped).toEqual({ ok: true, condition: { signalPath: "state.page.title", operator: "equals", expected: "a \"b\"" } });
    const apostrophe = readAutomationStudioRouteCondition("page.title is 'What's new'");
    expect(apostrophe).toEqual({ ok: true, condition: { signalPath: "state.page.title", operator: "equals", expected: "What's new" } });
  });
});
