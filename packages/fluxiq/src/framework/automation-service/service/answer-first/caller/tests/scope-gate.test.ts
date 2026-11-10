// A caller's scope at the top of the call chain: an act it does not grant, a call naming another
// site, or one made while the page is on another site, is refused before it reaches anything, and
// nobody is asked; what it grants, and the way back, go through.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioActionPermissionCheck } from "../../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioHarnessOptionLoopBinding, AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstScopeGate } from "../index.ts";

type Execute = AutomationStudioHarnessOptionLoopBinding["executeTool"];

function domain(answerAt?: (value: JsonObject) => string | undefined) {
  const reached: JsonObject[] = [];
  const verdicts: unknown[] = [];
  const execute: Execute = async (call) => {
    reached.push(call.value);
    // A domain that finds a lasting act as it acts, whatever the call declared, as a real one does.
    if (typeof call.value.finds === "string" && call.permission) verdicts.push(await call.permission({ consequences: [call.value.finds as "modify_existing"], control: { name: "Save", kind: "button" }, verb: "press" }));
    const location = answerAt?.(call.value);
    return { kind: "llm_evidence_tool_execution", evidence: { ok: true, ...(location ? { location } : {}) }, effectApplied: false };
  };
  return { execute, reached, verdicts };
}

const call = (value: JsonObject, permission?: AutomationStudioActionPermissionCheck) => ({ callId: "c", toolId: "web.go", value, ...(permission ? { permission } : {}) });
const code = (answer: unknown) => ((answer as AutomationStudioLlmEvidenceToolExecutionResult).evidence as JsonObject).code;
const gateSays: AutomationStudioActionPermissionCheck = async () => ({ permitted: true });

describe("a caller's scope", () => {
  it("absent, the chain is the chain itself", () => {
    const { execute } = domain();
    expect(automationStudioAnswerFirstScopeGate(undefined, execute)).toBe(execute);
  });

  it("refuses an act it does not grant, declared or found by the domain, even one the permission gate would let through unasked", async () => {
    const { execute, reached, verdicts } = domain();
    const gated = automationStudioAnswerFirstScopeGate({ permittedConsequences: ["create_new"] }, execute);
    const change = await gated(call({ node: "save", consequences: ["modify_existing"] }, gateSays));
    expect(code(change)).toBe("answer_first.outside_scope");
    expect(JSON.stringify(change)).toContain("modify_existing");
    expect(code(await gated(call({ node: "save", parameters: { consequences: ["send_or_publish"] } }, gateSays)))).toBe("answer_first.outside_scope");
    // Written into the Flow, it would be taken on every run.
    expect(code(await gated(call({ node: "save", consequences: ["modify_existing"], write: true }, gateSays)))).toBe("answer_first.outside_scope");
    expect(reached).toEqual([]);
    // Only checked, it is no act; granted, it goes on to the gate's own check.
    expect(code(await gated(call({ node: "save", consequences: ["modify_existing"], replay: "verify" }, gateSays)))).toBeUndefined();
    expect(code(await gated(call({ node: "add", consequences: ["create_new"] }, gateSays)))).toBeUndefined();
    await gated(call({ node: "save", finds: "modify_existing" }, gateSays));
    await gated(call({ node: "add", finds: "create_new" }, gateSays));
    expect(verdicts).toEqual([{ permitted: false, missing: ["modify_existing"], requestId: null }, { permitted: true }]);
  });

  it("with no sites, any site", async () => {
    const { execute, reached } = domain(() => "https://anywhere.example/");
    const gated = automationStudioAnswerFirstScopeGate({ permittedConsequences: [] }, execute);
    expect(code(await gated(call({ url: "https://elsewhere.example/" })))).toBeUndefined();
    expect(code(await gated(call({ press: "next" })))).toBeUndefined();
    expect(reached).toHaveLength(2);
  });

  it("refuses a call naming an address outside its sites, unrun, and lets one inside through, subdomains and ports by the scope's rule", async () => {
    const { execute, reached } = domain();
    const gated = automationStudioAnswerFirstScopeGate({ permittedConsequences: [], sites: ["market.example", "localhost:3000"] }, execute);
    const away = await gated(call({ url: "https://elsewhere.example/item" }));
    expect(code(away)).toBe("answer_first.outside_scope");
    expect(JSON.stringify(away)).toContain("market.example, localhost:3000");
    expect(code(await gated(call({ parameters: { links: ["https://shop.market.example/a", "http://localhost:4000/"] } })))).toBe("answer_first.outside_scope");
    expect(reached).toEqual([]);
    for (const url of ["https://market.example/", "https://shop.market.example/a?b=1", "http://localhost:3000/x"]) expect(code(await gated(call({ url }))), url).toBeUndefined();
    // Not a web address, so not a site: a domain's own spelling and plain words pass.
    expect(code(await gated(call({ location: "library://account", text: "market.example is great" })))).toBeUndefined();
    expect(reached).toHaveLength(4);
  });

  it("refuses what is done while the page is outside its sites, until a call names the way back", async () => {
    const { execute, reached } = domain((value) => (typeof value.url === "string" ? value.url : value.press === "ad" ? "https://ads.example/landing" : undefined));
    const gated = automationStudioAnswerFirstScopeGate({ permittedConsequences: [], sites: ["market.example"] }, execute);
    await gated(call({ url: "https://market.example/" }));
    await gated(call({ press: "ad" }));
    expect(reached).toHaveLength(2);
    const stuck = await gated(call({ press: "buy" }));
    expect(code(stuck)).toBe("answer_first.outside_scope");
    expect(JSON.stringify(stuck)).toContain("ads.example");
    expect(reached).toHaveLength(2);
    expect(code(await gated(call({ url: "https://market.example/" })))).toBeUndefined();
    expect(code(await gated(call({ press: "buy" })))).toBeUndefined();
    expect(reached).toHaveLength(4);
  });
});
