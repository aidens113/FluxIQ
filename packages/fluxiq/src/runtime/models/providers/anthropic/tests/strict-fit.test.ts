// t1093: the web panel's first decision (2026-11-27), 12 tools of which 8 strict, was refused by Anthropic for its
// compiled grammar. Here the platform's refusal is simulated, one per demotion, on that request's own tools: the strict
// set ends where the simulated platform accepts it, in a deterministic order, with stable bytes; and t1087's recorded
// tools (run-mwz2jc4w 0088), never refused, are untouched.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_ANTHROPIC_STRICT_FITS,
  automationStudioAnthropicDecisionToolsWire,
  automationStudioAnthropicDemoteStrictTool,
  automationStudioAnthropicGrammar,
  automationStudioAnthropicRefusedForGrammar,
  automationStudioAnthropicStrictToolNamedByRefusal,
  type AutomationStudioAnthropicToolDefinition
} from "../index.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as AutomationStudioAnthropicToolDefinition[];
/** A recorded request's tools as they were offered: the schema each was sent with (a strict one's grammar form reads back to itself). */
const offered = (tools: readonly AutomationStudioAnthropicToolDefinition[]) => tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.input_schema }));
const strictNames = (tools: readonly AutomationStudioAnthropicToolDefinition[]) => tools.filter((tool) => tool.strict === true).map((tool) => tool.name);
const strictBytes = (tools: readonly AutomationStudioAnthropicToolDefinition[]) => tools.filter((tool) => tool.strict === true).reduce((total, tool) => total + JSON.stringify(tool.input_schema).length, 0);

const PANEL = fixture("panel-2026-11-27-0003-tools.json");
const T1087 = fixture("run-mwz2jc4w-0088-tools.json");
const GRAMMAR = { type: "invalid_request_error", message: "The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools." };

beforeEach(() => AUTOMATION_STUDIO_ANTHROPIC_STRICT_FITS.forgetForTests());
afterEach(() => AUTOMATION_STUDIO_ANTHROPIC_STRICT_FITS.forgetForTests());

describe("strict tools fitted to the platform's compiled grammar", () => {
  it("rebuilds both recorded requests' tools byte for byte while nothing was refused", () => {
    expect(JSON.stringify(automationStudioAnthropicDecisionToolsWire(offered(PANEL)).tools)).toBe(JSON.stringify(PANEL));
    expect(JSON.stringify(automationStudioAnthropicDecisionToolsWire(offered(T1087)).tools)).toBe(JSON.stringify(T1087));
    expect(strictNames(PANEL)).toHaveLength(8);
  });

  it("demotes the panel's strict tools one refusal at a time, costliest schema first and complete last, until the platform accepts", () => {
    // The simulated platform's grammar limit: it accepts strict schemas of at most 3,000 bytes in all. The real limit has no number.
    const accepts = (tools: readonly AutomationStudioAnthropicToolDefinition[]) => strictBytes(tools) <= 3000;
    const tools = offered(PANEL);
    const demoted: string[] = [];
    let wire = automationStudioAnthropicDecisionToolsWire(tools);
    while (!accepts(wire.tools)) {
      expect(automationStudioAnthropicRefusedForGrammar(400, GRAMMAR)).toBe(true);
      const before = strictNames(wire.tools).length;
      const name = automationStudioAnthropicDemoteStrictTool(tools, wire.tools);
      expect(name).toBeDefined();
      demoted.push(name!);
      wire = automationStudioAnthropicDecisionToolsWire(tools);
      // One refusal, one strict tool fewer.
      expect(strictNames(wire.tools)).toHaveLength(before - 1);
    }
    expect(demoted).toEqual(["project_write_plan", "core_describe_nodes", "core_recall_result"]);
    expect(strictNames(wire.tools)).toEqual(["complete", "web_detect_repeating_structure", "web_describe_element", "project_assemble", "core_test_candidate"]);
    // A demoted tool goes as its schema was offered, and the tool list keeps its order.
    const plan = wire.tools.find((tool) => tool.name === "project_write_plan")!;
    expect(plan.strict).toBeUndefined();
    expect(plan.input_schema).toEqual(PANEL.find((tool) => tool.name === "project_write_plan")!.input_schema);
    expect(wire.tools.map((tool) => tool.name)).toEqual(PANEL.map((tool) => tool.name));
    // Every later request of the same offer is the same bytes.
    const accepted = JSON.stringify(wire);
    expect(JSON.stringify(automationStudioAnthropicDecisionToolsWire(offered(PANEL)))).toBe(accepted);
    expect(JSON.stringify(automationStudioAnthropicDecisionToolsWire(offered(PANEL)))).toBe(accepted);
  });

  it("keeps complete strict until it is the last strict tool, and stops when none is left", () => {
    const tools = offered(PANEL);
    const order: string[] = [];
    for (;;) {
      const name = automationStudioAnthropicDemoteStrictTool(tools, automationStudioAnthropicDecisionToolsWire(tools).tools);
      if (name === undefined) break;
      order.push(name);
    }
    expect(order).toHaveLength(8);
    expect(order.at(-1)).toBe("complete");
    expect(strictNames(automationStudioAnthropicDecisionToolsWire(tools).tools)).toEqual([]);
  });

  it("leaves another offer untouched: the 0088 tools are the same bytes after the panel's demotions", () => {
    const tools = offered(PANEL);
    automationStudioAnthropicDemoteStrictTool(tools, automationStudioAnthropicDecisionToolsWire(tools).tools);
    automationStudioAnthropicDemoteStrictTool(tools, automationStudioAnthropicDecisionToolsWire(tools).tools);
    expect(JSON.stringify(automationStudioAnthropicDecisionToolsWire(offered(T1087)).tools)).toBe(JSON.stringify(T1087));
  });

  it("names a tool another refused request already demoted without demoting a second one", () => {
    const tools = offered(PANEL);
    const refused = automationStudioAnthropicDecisionToolsWire(tools).tools;
    expect(automationStudioAnthropicDemoteStrictTool(tools, refused)).toBe("project_write_plan");
    // A second request built before that demotion, refused too, sees its tool already demoted.
    expect(automationStudioAnthropicDemoteStrictTool(tools, refused)).toBe("project_write_plan");
    expect(strictNames(automationStudioAnthropicDecisionToolsWire(tools).tools)).toHaveLength(7);
  });

  it("reads only a grammar refusal as one", () => {
    expect(automationStudioAnthropicRefusedForGrammar(400, { message: "Schema is too complex for compilation." })).toBe(true);
    expect(automationStudioAnthropicRefusedForGrammar(400, { message: "prompt is too long: 1200000 tokens > 1000000 maximum" })).toBe(false);
    expect(automationStudioAnthropicRefusedForGrammar(500, GRAMMAR)).toBe(false);
    expect(automationStudioAnthropicRefusedForGrammar(400, null)).toBe(false);
  });
});

// t1100: the web panel's replay (2026-11-28, fluxiq 0.55.0) sent `core_set_result_processing` strict with `input.process`
// typed `["object", "null"]` and left open, and every decision was refused: HTTP 400 "tools.8.custom: For 'object' type,
// 'additionalProperties' must be explicitly set to false". These are that request's tools as sent.
const REPLAY = fixture("panel-2026-11-28-0008-tools.json");
const NAMED = { type: "invalid_request_error", message: "tools.8.custom: For 'object' type, 'additionalProperties' must be explicitly set to false" };

/** Every object schema in `schema` -- a type array holding "object" included -- that does not say `additionalProperties: false`, by path. */
function openObjects(schema: unknown, path = "$"): string[] {
  if (Array.isArray(schema)) return schema.flatMap((item, index) => openObjects(item, `${path}[${index}]`));
  if (schema === null || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  const object = record.type === "object" || (Array.isArray(record.type) && record.type.includes("object")) || record.properties !== undefined;
  const own = object && record.additionalProperties !== false ? [path] : [];
  return [...own, ...Object.entries(record).flatMap(([key, value]) => key === "enum" || key === "const" || key === "default" ? [] : openObjects(value, `${path}.${key}`))];
}

describe("a nullable object is an object to the strict schema check (t1100)", () => {
  it("leaves a schema with an open nullable object unrepresentable, and a closed one representable", () => {
    const open = { type: "object", additionalProperties: false, properties: { process: { type: ["object", "null"], description: "The whole declaration." } } };
    expect(automationStudioAnthropicGrammar(open, { keepOpenObjects: true }).representable).toBe(false);
    const closedNullable = { type: "object", additionalProperties: false, properties: { process: { type: ["object", "null"], properties: { mode: { type: "string" } }, required: ["mode"], additionalProperties: false } } };
    expect(automationStudioAnthropicGrammar(closedNullable, { keepOpenObjects: true }).representable).toBe(true);
  });

  it("sends the replay's core_set_result_processing non-strict, as offered, and every strict tool closed at every depth", () => {
    expect(REPLAY[8]!.name).toBe("core_set_result_processing");
    expect(REPLAY[8]!.strict).toBe(true);
    expect(openObjects(REPLAY[8]!.input_schema)).toEqual(["$.properties.input.properties.process"]);
    const wire = automationStudioAnthropicDecisionToolsWire(offered(REPLAY)).tools;
    const processing = wire.find((tool) => tool.name === "core_set_result_processing")!;
    expect(processing.strict).toBeUndefined();
    expect(processing.input_schema).toEqual(REPLAY[8]!.input_schema);
    for (const tool of wire.filter((each) => each.strict === true)) expect(openObjects(tool.input_schema), tool.name).toEqual([]);
    // The other strict tools stay strict, in the same order, as the same bytes. The counted budget the demoted tool held
    // goes, as counted, to the next closed tool in the offer: core_loop_decision, closed at every depth, now fits it.
    // Should the platform refuse that set for its grammar, t1093's demotion answers it.
    expect(strictNames(wire)).toEqual(["complete", "web_detect_repeating_structure", "web_describe_element", "core_describe_nodes", "core_recall_result", "core_full_page", "core_loop_decision", "core_run_flow"]);
    for (const tool of wire.filter((each) => each.name !== "core_set_result_processing" && each.name !== "core_loop_decision")) expect(JSON.stringify(tool)).toBe(JSON.stringify(REPLAY.find((each) => each.name === tool.name)));
  });
});

describe("a refusal that names one strict tool's schema (t1100)", () => {
  it("names the strict tool at the refusal's place, and nothing for a tool sent non-strict or no place", () => {
    expect(automationStudioAnthropicStrictToolNamedByRefusal(400, NAMED, REPLAY)).toBe("core_set_result_processing");
    expect(automationStudioAnthropicStrictToolNamedByRefusal(400, { message: "tools.1.custom: something" }, REPLAY)).toBeUndefined(); // amend_draft went non-strict
    expect(automationStudioAnthropicStrictToolNamedByRefusal(400, { message: "tools.99.custom: something" }, REPLAY)).toBeUndefined();
    expect(automationStudioAnthropicStrictToolNamedByRefusal(400, { message: "messages.0.content: something" }, REPLAY)).toBeUndefined();
    expect(automationStudioAnthropicStrictToolNamedByRefusal(500, NAMED, REPLAY)).toBeUndefined();
    expect(automationStudioAnthropicStrictToolNamedByRefusal(400, null, REPLAY)).toBeUndefined();
  });

  it("demotes the named tool, whatever its size, and holds the offer to the rest of the strict set", () => {
    const tools = offered(REPLAY);
    // Built as the replay was, before the schema check knew a nullable object: every tool sent strict as recorded.
    expect(automationStudioAnthropicDemoteStrictTool(tools, REPLAY, "core_set_result_processing")).toBe("core_set_result_processing");
    const wire = automationStudioAnthropicDecisionToolsWire(tools).tools;
    expect(strictNames(wire)).toEqual(strictNames(REPLAY).filter((name) => name !== "core_set_result_processing"));
    // A name the refused request did not send strict demotes nothing, and the refusal stands.
    expect(automationStudioAnthropicDemoteStrictTool(tools, REPLAY, "amend_draft")).toBeUndefined();
    expect(strictNames(automationStudioAnthropicDecisionToolsWire(tools).tools)).toEqual(strictNames(wire));
  });
});
