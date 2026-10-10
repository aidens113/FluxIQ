// A page fact as a script writes it (t388, contract C9): each kind read into
// the condition the host evaluates, each malformed line refused with the shape
// it should have had, and the opposite a handler's derived check is made of.
import { describe, expect, it } from "vitest";
import { automationStudioFlowScriptFactGone, automationStudioFlowScriptFacts, readAutomationStudioFlowScriptFact } from "../index.ts";

describe("a page fact", () => {
  it.each([
    ["exists t5", { fact: "exists", op: "exists", target: { handle: "t5" } }],
    ["absent t5", { fact: "absent", op: "absent", target: { handle: "t5" } }],
    ["visible extraction.1", { fact: "visible", op: "visible", target: { handle: "extraction.1" } }],
    ["enabled t9", { fact: "enabled", op: "enabled", target: { handle: "t9" } }],
    ["text t7 contains \"Signed in\"", { fact: "text", op: "contains", value: "Signed in", target: { handle: "t7" } }],
    ["text t7 is Ready", { fact: "text", op: "equals", value: "Ready", target: { handle: "t7" } }],
    ["text t7 matches ^Due \\d+", { fact: "text", op: "matches", value: "^Due \\d+", target: { handle: "t7" } }],
    ["value t4 is $input.city", { fact: "value", op: "equals", value: { input: "city" }, target: { handle: "t4" } }],
    ["count t9 is 3", { fact: "count", op: "count", value: 3, target: { handle: "t9" } }],
    ["count t9 0", { fact: "count", op: "count", value: 0, target: { handle: "t9" } }],
    ["dialog alertdialog \"Please wait\"", { fact: "dialog", op: "visible", target: { kind: "dialog", role: "alertdialog", name: "Please wait" } }],
    ["dialog dialog \"Session expiring\" absent", { fact: "dialog", op: "absent", target: { kind: "dialog", role: "dialog", name: "Session expiring" } }]
  ])("reads %s", (text, fact) => {
    expect(readAutomationStudioFlowScriptFact(text)).toEqual({ ok: true, fact });
  });

  it.each([
    ["state.page.dialog exists", "a fact is"],
    ["exists", "takes one handle"],
    ["exists t5 now", "takes one handle"],
    ["exists \"Sign in\"", "takes one handle"],
    ["text t7", "takes a handle, `is`, `contains` or `matches`"],
    ["value t4 is $row.city", "takes a handle"],
    ["count t9 is many", "a whole number"],
    ["dialog alertdialog", "its name in quotes"],
    ["dialog alertdialog \"Wait", "a quote is not closed"]
  ])("refuses %s, saying how to write it", (text, reason) => {
    const reading = readAutomationStudioFlowScriptFact(text);
    expect(reading.ok).toBe(false);
    if (!reading.ok) expect(reading.reason).toContain(reason);
  });

  it("refuses each unreadable line and every `unless:` at its own line", () => {
    const issues: Parameters<typeof automationStudioFlowScriptFacts>[1] = [];
    expect(automationStudioFlowScriptFacts([{ text: "exists t1", line: 3 }, { text: "nonsense", line: 4 }, { text: "exists t2", negate: true, line: 5 }], issues)).toBeUndefined();
    expect(issues.map((issue) => [issue.code, issue.path])).toEqual([["flow_script.fact_invalid", "flow.line.4"], ["flow_script.fact_invalid", "flow.line.5"]]);
  });

  it("states the opposite of something showing, and of something gone, but not of a comparison", () => {
    expect(automationStudioFlowScriptFactGone({ fact: "visible", op: "visible", target: { handle: "t1" } })).toEqual({ fact: "absent", op: "absent", target: { handle: "t1" } });
    expect(automationStudioFlowScriptFactGone({ fact: "absent", op: "absent", target: { handle: "t1" } })).toEqual({ fact: "exists", op: "exists", target: { handle: "t1" } });
    expect(automationStudioFlowScriptFactGone({ fact: "dialog", op: "visible", target: { kind: "dialog", role: "dialog", name: "x" } }))
      .toEqual({ fact: "dialog", op: "absent", target: { kind: "dialog", role: "dialog", name: "x" } });
    expect(automationStudioFlowScriptFactGone({ fact: "text", op: "contains", value: "x", target: { handle: "t1" } })).toBeUndefined();
    expect(automationStudioFlowScriptFactGone({ fact: "enabled", op: "enabled", target: { handle: "t1" } })).toBeUndefined();
  });
});

// A hand-authored or test Flow has no evidence to copy a handle from, so it may
// name a fact's element by a locator the connected host interprets (t402).
describe("a page fact naming its element by `at`", () => {
  it.each([
    ["exists at \"#sign-in\"", { fact: "exists", op: "exists", target: { locator: "#sign-in" } }],
    ["absent at \".spinner\"", { fact: "absent", op: "absent", target: { locator: ".spinner" } }],
    ["visible at \"div[role='alertdialog']\"", { fact: "visible", op: "visible", target: { locator: "div[role='alertdialog']" } }],
    ["enabled AT \"form > button.submit\"", { fact: "enabled", op: "enabled", target: { locator: "form > button.submit" } }],
    ["text at \"h1, h2\" contains \"Signed in\"", { fact: "text", op: "contains", value: "Signed in", target: { locator: "h1, h2" } }],
    ["value at \"input[name='city']\" is $input.city", { fact: "value", op: "equals", value: { input: "city" }, target: { locator: "input[name='city']" } }],
    ["count at \"li:not(.done)\" is 3", { fact: "count", op: "count", value: 3, target: { locator: "li:not(.done)" } }]
  ])("reads %s", (text, fact) => {
    expect(readAutomationStudioFlowScriptFact(text)).toEqual({ ok: true, fact });
  });

  it("reads a handle fact as before, with no locator", () => {
    expect(readAutomationStudioFlowScriptFact("exists t5")).toEqual({ ok: true, fact: { fact: "exists", op: "exists", target: { handle: "t5" } } });
  });

  it.each([
    ["exists at \"\"", "empty"],
    ["exists at \"   \"", "empty"],
    ["exists at", "takes a locator in quotes"],
    ["exists at #sign-in", "takes a locator in quotes"],
    [`visible at "${"x".repeat(1_001)}"`, "longer than"],
    ["exists at \"#a\" now", "takes one handle"],
    ["text at \"#a\"", "takes a handle, `is`, `contains` or `matches`"],
    ["count at \"li\" is many", "a whole number"],
    ["exists at \"#a", "a quote is not closed"]
  ])("refuses %s, saying why", (text, reason) => {
    const reading = readAutomationStudioFlowScriptFact(text);
    expect(reading.ok).toBe(false);
    if (!reading.ok) expect(reading.reason).toContain(reason);
  });

  it("refuses an empty locator at its own script line", () => {
    const issues: Parameters<typeof automationStudioFlowScriptFacts>[1] = [];
    expect(automationStudioFlowScriptFacts([{ text: "exists at \"#ok\"", line: 3 }, { text: "exists at \"\"", line: 7 }], issues)).toBeUndefined();
    expect(issues.map((issue) => [issue.code, issue.path])).toEqual([["flow_script.fact_invalid", "flow.line.7"]]);
    expect(issues[0]!.message).toContain("line at 7");
  });
});
