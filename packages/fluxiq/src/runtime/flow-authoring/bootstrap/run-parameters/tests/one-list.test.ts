// t1075: every reader that tells one step from another by its parameters leaves out the same run parameters, the one
// list the assembly writes from (`../step-run-parameters.ts`). In run-mwynbry2-f3c88dc7 the act record counted
// `requiresChosen` as identity while the assembly wrote it; the build's other identity readers stripped only
// `ensureState`, a subset of their own, and would tie no pace or toggle to such a step. This holds each reader to the
// list by behaviour, and the source to one rule: no file strips a run parameter from parameters by its own name.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioAttemptActTargetKeys } from "../../../../answer-first/act-record/index.ts";
import { AutomationStudioExploredToggles } from "../../explored-toggles.ts";
import { AutomationStudioLearnedPaces } from "../../learned-paces.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { automationStudioExploredToggleTie } from "../../script-statements/index.ts";
import { AUTOMATION_STUDIO_STEP_RUN_PARAMETERS, automationStudioIsStepRunParameter, automationStudioStepWithoutRunParameters } from "../index.ts";

const NAMES: readonly string[] = Object.values(AUTOMATION_STUDIO_STEP_RUN_PARAMETERS);
const NODE = "domain.demo.press";
/** A step as a trial or a press ran it: no run parameter. A notes list's "Pin", unrelated to any realistic scenario. */
const RAN = { target: { selector: "#note-3 .pin" }, element: { tagName: "button", accessibleName: "Pin" } };
/** The value each run parameter is given on the saved step. */
const VALUE: Readonly<Record<string, JsonValue>> = { requiresChosen: [{ at: { selector: "#all" }, words: "All notes" }], ensureState: { via: "name", gains: ["unpin"] }, expectedState: { facts: [] }, routeSignatures: { effect: {} }, timeoutMs: 9000, paceMs: 400, retry: { most: 3 }, recordOutput: "notes" };
const saved = (name: string): JsonObject => ({ ...RAN, [name]: VALUE[name] ?? "set" });

describe("the one list of run parameters, as every identity reader reads it", () => {
  it("gives every name on the list a value in this test", () => {
    for (const name of NAMES) expect(VALUE).toHaveProperty(name);
  });

  it.each(NAMES)("the act record (target keys): %s leaves a step's keys as they are", (name) => {
    expect(automationStudioAttemptActTargetKeys(NODE, saved(name)).keys).toEqual(automationStudioAttemptActTargetKeys(NODE, RAN).keys);
  });

  it.each(NAMES)("a learned pace: a trial without %s paces the saved step that carries it", (name) => {
    const paces = new AutomationStudioLearnedPaces();
    paces.trial([{ attemptId: "a1", nodeId: "n1", definitionId: NODE, startedAt: 1, status: "failed", inputs: {}, outputs: {}, effects: [], pace: { inForceMs: 0, waitedMs: 0, raisedToMs: 1_200 } } as unknown as Parameters<AutomationStudioLearnedPaces["trial"]>[0][number]], { nodes: [{ id: "n1", parameterValues: RAN }] });
    const plan = { schemaVersion: "0.1", router: { name: "R", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", edges: [], nodes: [{ key: "s1", definitionId: NODE, definitionVersion: "1.0.0", parameters: saved(name) }] }] } as unknown as AutomationStudioFlowBootstrapPlan;
    expect(paces.lower(plan).subflows[0]!.nodes[0]!.paceMs).toBe(1_200);
  });

  it.each(NAMES)("an explored toggle: a trial node that carries %s is recorded by its parameters without it", (name) => {
    const toggles = new AutomationStudioExploredToggles();
    const attempt = { attemptId: "a1", nodeId: "node.bootstrap.b1.primary.s1", definitionId: NODE, startedAt: 0, status: "succeeded", inputs: {}, outputs: { toggle: { signature: { state: "s.on" } } }, effects: [] } as unknown as Parameters<AutomationStudioExploredToggles["trial"]>[0][number];
    toggles.trial([attempt], { nodes: [{ id: "node.bootstrap.b1.primary.s1", parameterValues: saved(name) }] });
    expect(toggles.list()[0]?.trialParameters).toEqual(RAN);
  });

  it.each(NAMES)("a toggle tie: a trial press without %s ties the saved step that carries it", (name) => {
    const press = { node: NODE, handles: [], trialNodes: ["node.bootstrap.b1.primary.s1"], trialParameters: RAN, signature: { state: "s.on" } };
    expect(automationStudioExploredToggleTie({ node: NODE, handles: new Set(), step: { ref: "primary.s1", parameters: saved(name), others: [] } }, [press])).toEqual([press]);
  });

  it("takes off every run parameter and nothing else", () => {
    const all = Object.fromEntries(NAMES.map((name) => [name, VALUE[name]!])) as JsonObject;
    expect(automationStudioStepWithoutRunParameters({ ...RAN, ...all })).toEqual(RAN);
    expect(automationStudioStepWithoutRunParameters(undefined)).toEqual({});
    for (const name of NAMES) expect(automationStudioIsStepRunParameter(name)).toBe(true);
    expect(automationStudioIsStepRunParameter("selector")).toBe(false);
  });
});

/**
 * Files that take a run parameter off parameters by name and are no identity reader, each with why. A new entry needs
 * the same: a reader of a step's identity reads `automationStudioStepWithoutRunParameters` instead.
 */
const NOT_READERS: Readonly<Record<string, string>> = {
  // Takes the model's submitted `ensureState` off a plan node so Core can ground it again from the step's own evidence: a writer.
  "runtime/flow-authoring/bootstrap/script-statements/toggle/idempotent.ts": "writer"
};

describe("no source strips a run parameter by its own name", () => {
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
  const own = path.join("runtime", "flow-authoring", "bootstrap", "run-parameters");

  /** Every source file under `src`, tests and the list's own folder left out, relative and with forward slashes. */
  function sources(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "tests" && entry.name !== "node_modules" && path.relative(src, full) !== own) sources(full, found);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) found.push(full);
    }
    return found;
  }

  /**
   * Whether `text` takes a run parameter off an object by its own spelling of the name: a rest destructuring, or a delete
   * by a computed key. A field of a draft step deleted by property (`delete step.routeSignatures`) is not a parameter.
   */
  function strips(text: string): boolean {
    const names = NAMES.join("|");
    const aliases = [...text.matchAll(new RegExp(`const\\s+(\\w+)\\s*=\\s*"(?:${names})"`, "gu"))].map((match) => match[1]!);
    const keys = [names, ...aliases.map((alias) => `\\[${alias}\\]`)].join("|");
    const computed = [...aliases, ...NAMES.map((name) => `"${name}"`)].join("|");
    const removed = new RegExp(`\\{\\s*(?:${keys})\\s*:\\s*_\\w*\\s*,\\s*\\.\\.\\.|delete\\s+[\\w.]+\\[(?:${computed})\\]`, "u");
    return removed.test(text);
  }

  it("finds only the named writer", () => {
    const stripping = sources(src).filter((file) => strips(readFileSync(file, "utf8"))).map((file) => path.relative(src, file).split(path.sep).join("/")).sort();
    expect(stripping).toEqual(Object.keys(NOT_READERS).sort());
  });

  it("catches a reader that keeps a subset of its own", () => {
    expect(strips("const ENSURE_STATE = \"ensureState\";\nconst { [ENSURE_STATE]: _core, ...rest } = parameters;")).toBe(true);
    expect(strips("delete parameters[\"requiresChosen\"];")).toBe(true);
    expect(strips("const rest = automationStudioStepWithoutRunParameters(parameters);")).toBe(false);
    expect(strips("delete step.routeSignatures;")).toBe(false);
  });
});
