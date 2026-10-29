// The steps a repair writes go through the domain's resolution before they are
// overlaid (t429): each step's handles are resolved from the one packet they
// came from -- the failure packet, or the explored packet their qualifier
// names -- and a handle that resolves to nothing, or to a control the domain
// will not save, refuses the fix rather than being saved as written.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../../action-permissions/index.ts";
import type { AutomationStudioFactCondition } from "../../../executor/lifecycle/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmExploredEvidenceSlot, AutomationStudioRuntimePatch } from "../../../llm/index.ts";
import { automationStudioRecoveryStepResolution } from "../step-evidence-resolution.ts";

type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;
type Asked = Omit<Parameters<Resolver>[0], "permission">;

/** What the page the model was shown holds, by handle: a full identity, or one the domain will not save. */
const FAILURE: JsonObject = { page: "failure", controls: { t2: { tagName: "button", accessibleName: "Close", classNames: ["close"] }, t9: { tagName: "div", thin: true } } };
const EXPLORED: JsonObject = { page: "explored", controls: { t3: { tagName: "input", label: "Quantity", name: "qty" } } };
const EXPLORATION: AutomationStudioLlmExploredEvidenceSlot = { schemaVersion: "automation-studio.exploration-evidence.v1", packets: [{ evidenceId: "explored.1", toolId: "test.look", packet: EXPLORED }] };

/** A domain that resolves `{ handle }` in `target` from the packet it is handed, and nothing else. */
function domain(asked: Asked[] = []): Resolver {
  return async (input) => {
    const { permission: _check, ...seen } = input;
    asked.push(structuredClone(seen));
    const packet = input.handleEvidence;
    const target = input.parameters.target as JsonObject | undefined;
    if (!target || typeof target.handle !== "string") return { status: "unchanged" };
    const controls = (packet?.controls ?? {}) as Record<string, JsonObject>;
    const identity = controls[target.handle];
    if (!identity) return { status: "refused", issueCodes: ["test.handle.unknown"] };
    if (identity.thin) return { status: "refused", issueCodes: ["test.handle.unidentifiable"] };
    if (input.declaredConsequences?.length) {
      const verdict = await input.permission({ consequences: [...input.declaredConsequences], control: { name: "a control" }, verb: "press" });
      if (!verdict.permitted) return { status: "needs_permission", missing: [...input.declaredConsequences], requestId: "request.1" };
    }
    const { target: _handle, ...rest } = input.parameters;
    return { status: "resolved", parameters: { ...rest, selector: `#from-${String(packet?.page)}`, element: { ...identity, fingerprinted: true } } };
  };
}

const permitted: AutomationStudioActionPermissionCheck = async () => ({ permitted: true });

function resolver(options: { resolve?: Resolver; failure?: JsonObject | undefined; explored?: boolean; permission?: AutomationStudioActionPermissionCheck } = {}) {
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = { domainId: "test.domain", deniedEvidenceKeys: [], tools: [], executeTool: async () => { throw new Error("no tools"); }, ...(options.resolve ? { resolvePlanNodeParameters: options.resolve } : {}) };
  return automationStudioRecoveryStepResolution({
    ports: { llmEvidenceRuntime: binding },
    projectId: "project.repair",
    flowId: "flow.repair",
    failureEvidence: "failure" in options ? options.failure : FAILURE,
    ...(options.explored ? { explorationEvidence: EXPLORATION } : {}),
    permissionFor: () => options.permission ?? permitted
  });
}

const sequence = (parameters: JsonObject, consequences: string[] = []): AutomationStudioRuntimePatch =>
  ({ kind: "temporary_action_sequence", targetNodeId: "read", steps: [{ definitionId: "test.press", parameters }], consequences, reason: "Close the notice first." }) as AutomationStudioRuntimePatch;

describe("a repair's steps, resolved before they are overlaid", () => {
  it("resolves an inserted step's handle from the failure packet into the domain's full identity", async () => {
    const asked: Asked[] = [];
    const result = await resolver({ resolve: domain(asked) })(sequence({ target: { handle: "t2" } }));

    expect(result).toEqual({ ok: true, patch: expect.objectContaining({ steps: [{ definitionId: "test.press", parameters: { selector: "#from-failure", element: { tagName: "button", accessibleName: "Close", classNames: ["close"], fingerprinted: true } } }] }) });
    expect(JSON.stringify(result)).not.toMatch(/"handles?":/u);
    // Asked once, about that step, handed the packet the model was shown.
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ projectId: "project.repair", flowId: "flow.repair", nodeDefinitionId: "test.press", parameters: { target: { handle: "t2" } }, handleEvidence: FAILURE, declaredConsequences: [] });
  });

  it("resolves a qualified handle from the explored packet it names, with Core's qualifier removed", async () => {
    const asked: Asked[] = [];
    const result = await resolver({ resolve: domain(asked), explored: true })(sequence({ target: { handle: "explored.1:t3" } }));

    expect(result.ok && result.patch.kind === "temporary_action_sequence" && result.patch.steps[0]?.parameters).toEqual({ selector: "#from-explored", element: { tagName: "input", label: "Quantity", name: "qty", fingerprinted: true } });
    expect(asked[0]).toMatchObject({ parameters: { target: { handle: "t3" } }, handleEvidence: EXPLORED });
  });

  it("refuses a handle the packet never gave, and an identity the domain will not save, with the domain's codes", async () => {
    const unknown = await resolver({ resolve: domain() })(sequence({ target: { handle: "t44" } }));
    expect(unknown).toEqual({ ok: false, code: "step_unresolved", reason: "The fix's step 1 names a control that could not be tied to the page the model was shown, so the fix was not used.", issueCodes: ["test.handle.unknown"] });

    const thin = await resolver({ resolve: domain() })(sequence({ target: { handle: "t9" } }));
    expect(thin).toMatchObject({ ok: false, code: "step_unresolved", issueCodes: ["test.handle.unidentifiable"] });
    // Nothing a person or a model reads says how a control is found.
    expect(thin.ok ? "" : thin.reason).not.toMatch(/selector|fingerprint|address|score/iu);
  });

  it("refuses without asking a step whose handles no packet the request carried can have issued", async () => {
    const asked: Asked[] = [];
    // An explored label the request did not carry; two packets in one step; a handle with no packet shown at all.
    expect(await resolver({ resolve: domain(asked), explored: true })(sequence({ target: { handle: "explored.2:t3" } }))).toMatchObject({ ok: false, code: "step_unresolved", issueCodes: ["bootstrap.handle_not_issued"] });
    expect(await resolver({ resolve: domain(asked), explored: true })(sequence({ target: { handle: "explored.1:t3" }, element: { handle: "t2" } }))).toMatchObject({ ok: false, issueCodes: ["bootstrap.handle_not_issued"] });
    expect(await resolver({ resolve: domain(asked), failure: undefined })(sequence({ target: { handle: "t2" } }))).toMatchObject({ ok: false, issueCodes: ["bootstrap.handle_not_issued"] });
    expect(asked).toEqual([]);
  });

  it("refuses a handle the domain answered unchanged, so a handle is never saved as written", async () => {
    const result = await resolver({ resolve: async () => ({ status: "unchanged" }) })(sequence({ target: { handle: "t2" } }));
    expect(result).toMatchObject({ ok: false, code: "step_unresolved", issueCodes: ["bootstrap.handle_unresolved"] });
  });

  it("with no domain to ask, keeps a step that names no handle and refuses one that does", async () => {
    const plain = sequence({ value: "dismiss" });
    expect(await resolver()(plain)).toEqual({ ok: true, patch: plain });
    expect(await resolver()(sequence({ target: { handle: "t2" } }))).toMatchObject({ ok: false, code: "step_unresolved", issueCodes: ["bootstrap.handle_resolution_unavailable"] });
  });

  it("asks the domain about a step that names no handle too, and keeps its answer", async () => {
    const asked: Asked[] = [];
    const plain = sequence({ value: "dismiss" });
    expect(await resolver({ resolve: domain(asked) })(plain)).toEqual({ ok: true, patch: plain });
    expect(asked).toEqual([expect.objectContaining({ parameters: { value: "dismiss" } })]);
    expect(asked[0]).not.toHaveProperty("handleEvidence");
  });

  it("answers permission_required when the domain says the step needs a person", async () => {
    const refusing: AutomationStudioActionPermissionCheck = async () => ({ permitted: false, missing: ["move_money"], requestId: null });
    const result = await resolver({ resolve: domain(), permission: refusing })(sequence({ target: { handle: "t2" } }, ["move_money"]));
    expect(result).toMatchObject({ ok: false, code: "permission_required", reason: "The fix needs a permission the run does not hold." });
  });

  it("resolves a new handler's body and the control its facts name", async () => {
    const asked: Asked[] = [];
    const patch: AutomationStudioRuntimePatch = {
      kind: "add_handler",
      event: "retry",
      scope: { kind: "nodes", nodeIds: ["read"] },
      when: [{ fact: "visible", op: "visible", target: { handles: { target: "t2" } } }],
      completionCheck: [{ fact: "visible", op: "absent", target: { handles: { target: "t2" } } }, { fact: "page.clear", op: "exists" }],
      steps: [{ definitionId: "test.press", parameters: { target: { handle: "t2" } } }],
      then: { kind: "resume" },
      consequences: [],
      reason: "A notice covers the list."
    };
    const result = await resolver({ resolve: domain(asked) })(patch);
    if (!result.ok || result.patch.kind !== "add_handler") throw new Error(JSON.stringify(result));
    const resolved = { selector: "#from-failure", element: { tagName: "button", accessibleName: "Close", classNames: ["close"], fingerprinted: true } };
    expect(result.patch.steps).toEqual([{ definitionId: "test.press", parameters: resolved }]);
    expect(result.patch.when).toEqual([{ fact: "visible", op: "visible", target: resolved }]);
    // A fact about a control names the kind its op asks, as a build's does (t787); one about the page stands as written.
    expect(result.patch.completionCheck).toEqual([{ fact: "absent", op: "absent", target: resolved }, { fact: "page.clear", op: "exists" }]);
    // A fact's target is asked about as the build asks about one.
    expect(asked.filter((entry) => entry.nodeDefinitionId === "fluxiq.fact.target")).toHaveLength(2);
    expect(JSON.stringify(result.patch)).not.toMatch(/"handles?":/u);
  });

  // t787: a model writes a condition's `fact` as a label; a host reads a kind there, answered `unknown`, and the handler never ran.
  it("names, in a fact about a control, the kind its op asks, and refuses a comparison that never says what it compares", async () => {
    const handler = (when: AutomationStudioFactCondition[]): AutomationStudioRuntimePatch => ({
      kind: "add_handler", event: "before", scope: { kind: "nodes", nodeIds: ["read"] }, when, steps: [{ definitionId: "test.press", parameters: { target: { handle: "t2" } } }], then: { kind: "resume" }, consequences: [], reason: "r"
    });
    const on = { handles: { target: "t2" } };
    const kept = await resolver({ resolve: domain() })(handler([
      { fact: "the notice over the list", op: "visible", target: on },
      { fact: "notice", op: "count", value: 1, target: on },
      { fact: "text", op: "contains", value: "Session", target: on }
    ]));
    if (!kept.ok || kept.patch.kind !== "add_handler") throw new Error(JSON.stringify(kept));
    expect(kept.patch.when.map(({ fact, op }) => [fact, op])).toEqual([["visible", "visible"], ["count", "count"], ["text", "contains"]]);

    const asked: Asked[] = [];
    const refused = await resolver({ resolve: domain(asked) })(handler([{ fact: "the notice's words", op: "contains", value: "Session", target: on }]));
    expect(refused).toEqual({
      ok: false, code: "step_unresolved",
      reason: "The fix's situation compares something it describes only in its own words, which the run cannot read, so the fix was not used. A condition that compares names what it reads: text for a control's shown words, value for a field's value.",
      issueCodes: ["recovery.fact_kind_unread"]
    });
    // Refused before the domain is asked about its target.
    expect(asked).toEqual([]);
  });

  it("refuses a fact naming more than one control, or one the packet never gave", async () => {
    const handler = (target: JsonObject): AutomationStudioRuntimePatch => ({
      kind: "add_handler", event: "fail", scope: { kind: "subflow" }, when: [{ fact: "visible", op: "visible", target }], steps: [{ definitionId: "test.press", parameters: { value: "x" } }], then: { kind: "give_up" }, consequences: [], reason: "r"
    });
    expect(await resolver({ resolve: domain() })(handler({ handles: { a: "t2", b: "t9" } }))).toMatchObject({ ok: false, code: "step_unresolved", reason: expect.stringContaining("situation") });
    expect(await resolver({ resolve: domain() })(handler({ handles: { target: "t44" } }))).toMatchObject({ ok: false, issueCodes: ["test.handle.unknown"] });
  });

  it("resolves a unit's replacement: its steps, or the handler that replaces a handler", async () => {
    const steps = await resolver({ resolve: domain() })({ kind: "replace_unit", unit: { kind: "node", nodeId: "read" }, steps: [{ definitionId: "test.press", parameters: { target: { handle: "t2" } } }], consequences: [], reason: "r" });
    expect(steps.ok && steps.patch.kind === "replace_unit" && steps.patch.steps?.[0]?.parameters).toMatchObject({ selector: "#from-failure", element: { fingerprinted: true } });

    const handler = await resolver({ resolve: domain() })({
      kind: "replace_unit", unit: { kind: "handler", nodeId: "h.notice" }, consequences: [], reason: "r",
      handler: { event: "fail", scope: { kind: "subflow" }, when: [], steps: [{ definitionId: "test.press", parameters: { target: { handle: "t9" } } }], then: { kind: "give_up" } }
    });
    expect(handler).toMatchObject({ ok: false, reason: expect.stringContaining("handler's step 1"), issueCodes: ["test.handle.unidentifiable"] });
  });

  it("leaves a patch that writes no steps alone", async () => {
    const wait: AutomationStudioRuntimePatch = { kind: "temporary_wait_retry", targetNodeId: "read", timeoutMs: 100, reason: "Slow page." };
    expect(await resolver({ resolve: domain() })(wait)).toEqual({ ok: true, patch: wait });
  });
});

// t432 (user, 2026-10-10): a repair names a control only by the handle the
// evidence printed. Every step and fact it writes is the model's own, so the
// domain is told so, and a fact naming its control any other way is refused
// before anyone is asked.
describe("a repair that names a control other than by handle", () => {
  it("is handed to the domain as the model's own writing, every step and fact", async () => {
    const asked: Asked[] = [];
    const patch: AutomationStudioRuntimePatch = {
      kind: "add_handler", event: "retry", scope: { kind: "nodes", nodeIds: ["read"] },
      when: [{ fact: "visible", op: "visible", target: { handles: { target: "t2" } } }],
      steps: [{ definitionId: "test.press", parameters: { target: { handle: "t2" } } }],
      then: { kind: "resume" }, consequences: [], reason: "A notice covers the list."
    };
    expect((await resolver({ resolve: domain(asked) })(patch)).ok).toBe(true);
    expect(asked).toHaveLength(2);
    expect(asked.every((entry) => entry.writtenByModel === true)).toBe(true);
  });

  it("is refused when the domain says a step named its control some other way, in words that say to use the handle", async () => {
    const refusing: Resolver = async () => ({ status: "refused", issueCodes: ["test.handle.not_a_handle", "test.handle.not_a_handle:selector"] });
    const result = await resolver({ resolve: refusing })(sequence({ selector: "#close" }));
    expect(result).toEqual({
      ok: false, code: "step_unresolved",
      reason: "The fix's step 1 names a control by something other than the handle the page view printed for it, so the fix was not used.",
      issueCodes: ["test.handle.not_a_handle", "test.handle.not_a_handle:selector"]
    });
  });

  it("refuses, without asking, a fact whose target is not the evidence's handles", async () => {
    const asked: Asked[] = [];
    const handler = (target: JsonObject): AutomationStudioRuntimePatch => ({
      kind: "add_handler", event: "fail", scope: { kind: "subflow" }, when: [{ fact: "visible", op: "visible", target }],
      steps: [{ definitionId: "test.press", parameters: { target: { handle: "t2" } } }], then: { kind: "give_up" }, consequences: [], reason: "r"
    });
    for (const target of [{ locator: "#notice" }, { selector: ".notice" }]) {
      expect(await resolver({ resolve: domain(asked) })(handler(target))).toEqual({
        ok: false, code: "step_unresolved",
        reason: "The fix's situation names a control by something other than the handle the page view printed for it, so the fix was not used.",
        issueCodes: ["bootstrap.target_not_a_handle"]
      });
    }
    expect(asked).toEqual([]);
  });
});
