import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { automationStudioActionPermissionDenied } from "../../../action-permissions/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { AutomationStudioSiteResetStartCheck } from "../index.ts";

// The start check against a fake domain: the start is read once, and a
// comparison goes back to the start through the library's arrival before it
// asks what differs.

const arrival = { node: "demo.go", parameters: { to: "start" }, consequences: [] };
const runNode: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node.", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "demo.look", parameters: {}, consequences: [] }, arrival } };

type Asked = { callId: string; start?: JsonObject; permission: unknown };
function domain(differs: string[][] = [[]], options: { arrival?: JsonObject; throws?: boolean } = {}) {
  const asked: Asked[] = [];
  const ran: Array<{ callId: string; toolId: string; value: JsonObject }> = [];
  const binding = {
    startState: async (input: { callId: string; start?: JsonObject; permission: unknown }) => {
      asked.push({ callId: input.callId, ...(input.start ? { start: input.start } : {}), permission: input.permission });
      if (options.throws) throw new Error("page detail that must not leak");
      return { state: { lines: asked.length }, differs: differs.shift() ?? [] };
    }
  };
  const executeTool = async (call: { callId: string; toolId: string; value: JsonObject }) => {
    ran.push(call);
    return { kind: "llm_evidence_tool_execution", evidence: options.arrival ?? { ok: true }, effectApplied: true };
  };
  return { binding, asked, ran, executeTool };
}

describe("site reset start check", () => {
  it("reads the start once with the permission that denies anything gated, and never again", async () => {
    const fake = domain();
    const check = new AutomationStudioSiteResetStartCheck({ binding: fake.binding, projectId: "p", flowId: "f", tools: [runNode], executeTool: fake.executeTool });
    await check.capture();
    await check.capture();
    expect(fake.asked).toEqual([{ callId: "site-reset.start", permission: automationStudioActionPermissionDenied }]);
    expect(check.taken).toBe(true);
  });

  it("goes back to the start through the arrival, then asks what differs with the start it kept, and says the arrival moved", async () => {
    const fake = domain([[], ["one more line"]]);
    const check = new AutomationStudioSiteResetStartCheck({ binding: fake.binding, projectId: "p", flowId: "f", tools: [runNode], executeTool: fake.executeTool });
    await check.capture();
    expect(await check.compare()).toEqual({ moved: true, differs: ["one more line"] });
    expect(fake.ran).toEqual([{ callId: "site-reset.1.arrival", toolId: "core.run_node", value: arrival }]);
    expect(fake.asked[1]).toEqual({ callId: "site-reset.1.start", start: { lines: 1 }, permission: automationStudioActionPermissionDenied });
    expect(await check.compare()).toEqual({ moved: true, differs: [] });
    expect(fake.ran.map((call) => call.callId)).toEqual(["site-reset.1.arrival", "site-reset.2.arrival"]);
  });

  it("says nothing differs-wise without a start, an arrival or a startState", async () => {
    const fake = domain();
    const unread = new AutomationStudioSiteResetStartCheck({ binding: fake.binding, projectId: "p", flowId: "f", tools: [runNode], executeTool: fake.executeTool });
    expect(await unread.compare()).toEqual({ moved: false });
    const noArrival = new AutomationStudioSiteResetStartCheck({ binding: fake.binding, projectId: "p", flowId: "f", tools: [{ ...runNode, initialObservation: { input: {} } }], executeTool: fake.executeTool });
    await noArrival.capture();
    expect(await noArrival.compare()).toEqual({ moved: false });
    const noDomain = new AutomationStudioSiteResetStartCheck({ binding: {}, projectId: "p", flowId: "f", tools: [runNode], executeTool: fake.executeTool });
    await noDomain.capture();
    expect(noDomain.taken).toBe(false);
    expect(await noDomain.compare()).toEqual({ moved: false });
    expect(fake.ran).toEqual([]);
  });

  it("answers no differences when the arrival was refused, and keeps a failure rather than throwing it", async () => {
    const refused = domain([[], ["x"]], { arrival: { ok: false, code: "refused" } });
    const check = new AutomationStudioSiteResetStartCheck({ binding: refused.binding, projectId: "p", flowId: "f", tools: [runNode], executeTool: refused.executeTool });
    await check.capture();
    expect(await check.compare()).toEqual({ moved: true });
    expect(refused.asked).toHaveLength(1);
    const failing = domain([], { throws: true });
    const broken = new AutomationStudioSiteResetStartCheck({ binding: failing.binding, projectId: "p", flowId: "f", tools: [runNode], executeTool: failing.executeTool });
    await broken.capture();
    expect(broken.taken).toBe(false);
    expect(broken.failure).toBeInstanceOf(Error);
  });

  it("answers no differences when a comparison throws, still saying whether the arrival moved", async () => {
    let calls = 0;
    const startState = async () => {
      calls += 1;
      if (calls > 1) throw new Error("gone");
      return { state: {}, differs: [] };
    };
    const binding = { startState };
    const check = new AutomationStudioSiteResetStartCheck({ binding, projectId: "p", flowId: "f", tools: [runNode], executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false }) });
    await check.capture();
    expect(await check.compare()).toEqual({ moved: false });
    expect(check.failure).toBeInstanceOf(Error);
  });
});
