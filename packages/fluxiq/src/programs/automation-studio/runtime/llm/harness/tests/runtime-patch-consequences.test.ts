// What a runtime patch says it would lastingly do (Item 4 of the Week 2 exit
// design). A patch that may run declares its consequences in Core's classes,
// the recovery's permission gate is asked about them, and a class nobody
// allowed becomes a request. The declaration is required in the schema a model
// is shown and read forgivingly on the way back: absent is recorded as
// undeclared by the patch stage rather than failing the whole answer, and only
// a class Core does not know is refused, because nobody could be asked about it.

import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCES } from "../../../action-permissions/index.ts";
import { automationStudioRuntimePatchOutputSchema, parseAutomationStudioLlmProviderResult } from "../index.ts";

type SchemaNode = { const?: unknown; required?: string[]; properties?: Record<string, SchemaNode>; oneOf?: SchemaNode[]; items?: SchemaNode };

describe("what a runtime patch says it would lastingly do", () => {
  it("requires consequences on each acting patch that may run, in Core's classes only", () => {
    const schema = automationStudioRuntimePatchOutputSchema({ proposalOnly: false }) as SchemaNode;
    const variants = schema.oneOf![0]!.properties!.patches!.items!.oneOf!;
    const byKind = new Map(variants.map((variant) => [variant.properties!.kind!.const, variant]));

    for (const kind of ["temporary_target_override", "temporary_action_sequence"]) {
      expect(byKind.get(kind)?.required, kind).toContain("consequences");
      expect(byKind.get(kind)?.properties?.consequences, kind).toEqual({ type: "array", maxItems: 5, uniqueItems: true, items: { enum: [...AUTOMATION_STUDIO_ACTION_CONSEQUENCES] } });
    }
    for (const kind of ["temporary_wait_retry", "temporary_recovery_subflow_call", "temporary_reroute"]) {
      expect(byKind.get(kind)?.properties, kind).not.toHaveProperty("consequences");
    }
  });

  it("asks a proposal-only override nothing, since nothing it names runs", () => {
    const schema = automationStudioRuntimePatchOutputSchema({ proposalOnly: true }) as SchemaNode;
    const override = schema.oneOf![0]!.properties!.patches!.items!;

    expect(override.properties?.kind).toEqual({ const: "temporary_target_override" });
    expect(override.required).not.toContain("consequences");
    expect(override.properties).not.toHaveProperty("consequences");
    expect(schema.oneOf![1]!.properties?.kind).toEqual({ const: "no_repair" });
  });

  it("reads a declaration in Core's classes and an absent one, and refuses a class Core does not know", () => {
    const parse = (consequences?: unknown) => parseAutomationStudioLlmProviderResult({
      response: {
        kind: "runtime_patch",
        summary: "Re-point the failed step.",
        riskLevel: "high",
        patches: [{ kind: "temporary_target_override", targetNodeId: "node.send", target: { handles: { element: "target.2" } }, reason: "It was renamed.", ...(consequences === undefined ? {} : { consequences }) }]
      }
    }, "runtime_patch");

    expect(parse(["create_new", "send_or_publish"]).response).toMatchObject({ patches: [{ consequences: ["create_new", "send_or_publish"] }] });
    expect(parse([]).response).toMatchObject({ patches: [{ consequences: [] }] });
    const absent = parse().response;
    expect(absent?.kind).toBe("runtime_patch");
    expect(absent?.kind === "runtime_patch" ? absent.patches[0] : undefined).not.toHaveProperty("consequences");
    for (const refused of [["purchase"], "create_new", [1], Array.from({ length: 11 }, () => "delete")]) {
      const result = parse(refused);
      expect(result.response, JSON.stringify(refused)).toBeUndefined();
      expect(result.diagnostics.map((diagnostic) => diagnostic.code), JSON.stringify(refused)).toContain("llm_output.invalid_patch_consequences");
    }
  });

  it("refuses consequences on a patch kind that cannot act", () => {
    const result = parseAutomationStudioLlmProviderResult({
      response: { kind: "runtime_patch", summary: "Wait longer.", riskLevel: "low", patches: [{ kind: "temporary_wait_retry", targetNodeId: "node.send", timeoutMs: 5_000, reason: "Slow.", consequences: [] }] }
    }, "runtime_patch");

    expect(result.response).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("llm_output.unexpected_field");
  });
});
