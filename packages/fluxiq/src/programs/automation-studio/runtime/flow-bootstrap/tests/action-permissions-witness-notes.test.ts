// A lasting press or plan step and the notes Core gives it about its witness (t791 fixes 2 and 3),
// split from action-permissions.test.ts when that file passed its line budget.

import { describe, expect, it } from "vitest";
import type { AutomationStudioActionDeclaration } from "../../action-permissions/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../action-permissions.ts";
import { AutomationStudioSiteResetLedger } from "../site-reset/index.ts";

// The notes a lasting step or press is given about its witness (t791 fixes 2 and 3): a press that names a ref showing nothing
// of its change says so beside its answer, and a plan step with no witness is noted for its submission with the refs of its own
// tab only. Made-up fixtures only: a reading shelf in two tabs, opaque tokens.
describe("the notes about a witness", () => {
  const TAB_A = "r:tab-a";
  const TAB_B = "r:tab-b";
  const shelf: Parameters<AutomationStudioSiteResetLedger["observed"]>[0] = { state: {}, differs: [], resource: TAB_A, scope: "p:shelf-a-page", location: "loc:shelf", collections: [
    { scope: "p:shelf-a", group: "g:shelf-a", subjects: ["s:atlas", "s:fable"], states: { "s:atlas": "v:1", "s:fable": "v:1" } }
  ] };
  const withShelf = () => {
    const ledger = new AutomationStudioSiteResetLedger({ owner: "builder" });
    ledger.observed(shelf);
    ledger.destinationReceipts();
    return ledger;
  };

  async function press(ledger: AutomationStudioSiteResetLedger, control: AutomationStudioActionDeclaration["control"], consequences: AutomationStudioActionDeclaration["consequences"], resetDestination?: string, applied = true) {
    const permissions = automationStudioFlowBootstrapActionPermissions({
      authoringMode: "project", requireCreateBaseline: false, permittedConsequences: [], instructionIds: [], siteReset: ledger,
      executeTool: async (call) => {
        const answer = await call.permission!({ consequences, control, effect: "mutate", verb: "press" });
        return { kind: "llm_evidence_tool_execution", evidence: { ok: answer.permitted && applied }, effectApplied: answer.permitted && applied };
      }
    });
    return permissions.executeTool({ callId: "keep", toolId: "core.run_node", value: { node: "demo.keep", consequences: [...consequences], ...(resetDestination !== undefined ? { resetDestination } : {}) } });
  }
  const BOOK = { name: "Keep", kind: "button", subject: "s:novel", page: "s:novel", item: "i:novel" };

  it("notes a landed press that names a ref read in another tab, and none for a ref that shows its change, none named, or a press that did not land", async () => {
    const elsewhere = await press(withShelf(), { ...BOOK, resource: TAB_B }, ["modify_existing"], "destination-1");
    expect(elsewhere).toMatchObject({ effectApplied: true, evidence: { ok: true, resetDestinationUnreached: { ref: "destination-1" } } });
    expect(JSON.stringify(elsewhere)).toContain("cannot show this press's change");
    // The same ref names the shelf where a new book will show, in its own tab: it witnesses the press.
    expect(JSON.stringify(await press(withShelf(), { name: "Keep", kind: "button", subject: "s:novel", page: "s:novel", resource: TAB_A }, ["create_new"], "destination-1"))).not.toContain("resetDestinationUnreached");
    expect(JSON.stringify(await press(withShelf(), { ...BOOK, resource: TAB_B }, ["modify_existing"]))).not.toContain("resetDestinationUnreached");
    expect(JSON.stringify(await press(withShelf(), { ...BOOK, resource: TAB_B }, ["modify_existing"], "destination-1", false))).not.toContain("resetDestinationUnreached");
  });

  it("notes a plan step with no witness for its submission with the refs of its own tab only, and none once it is stamped", async () => {
    const ledger = withShelf();
    const permissions = automationStudioFlowBootstrapActionPermissions({ permittedConsequences: [], instructionIds: [], siteReset: ledger, executeTool: async () => ({}) });
    const step = (ref: string, control: AutomationStudioActionDeclaration["control"], consequences: AutomationStudioActionDeclaration["consequences"] = ["modify_existing"]) =>
      permissions.planStep({ definitionId: "demo.keep", ref, witnessed: () => undefined })({ consequences, control, verb: "press" });
    await step("main.s1", { ...BOOK, resource: TAB_A });
    await step("main.s2", { ...BOOK, resource: TAB_B });
    await step("main.s3", { name: "Keep", kind: "button", subject: "s:novel", page: "s:novel" });
    const gaps = permissions.planStep.gaps?.();
    expect(gaps?.get("main.s1")?.instruction).toContain("destination-1");
    expect(gaps?.get("main.s2")?.canMeet).toBe("another_page");
    expect(gaps?.get("main.s2")?.instruction).not.toContain("destination-1");
    expect(gaps?.get("main.s3")?.canMeet).toBe("no_call");
    // The same node resolved again with a witness is no longer noted.
    await step("main.s1", { name: "Keep", kind: "button", subject: "s:atlas", item: "i:atlas", scope: "p:shelf-a", resource: TAB_A });
    expect(permissions.planStep.gaps?.().has("main.s1")).toBe(false);
  });
});
