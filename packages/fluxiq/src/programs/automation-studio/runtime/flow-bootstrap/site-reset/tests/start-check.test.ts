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
  it("reads in place without moving the target, passing the domain's location and lines through (t471)", async () => {
    const asked: Asked[] = [];
    const ran: unknown[] = [];
    const binding = { startState: async (input: { callId: string; start?: JsonObject; permission: unknown }) => {
      asked.push({ callId: input.callId, ...(input.start ? { start: input.start } : {}), permission: input.permission });
      return { state: { n: asked.length }, differs: input.start ? ["new: x"] : [], location: "https://site.test/a", lines: { gone: [], added: input.start ? ["x"] : [] } };
    } };
    const executeTool = async (call: unknown) => {
      ran.push(call);
      return {};
    };
    const check = new AutomationStudioSiteResetStartCheck({ binding, projectId: "p", flowId: "f", tools: [runNode], executeTool });
    const before = await check.read();
    expect(before).toEqual({ state: { n: 1 }, differs: [], location: "https://site.test/a", lines: { gone: [], added: [] } });
    if ("unread" in before) throw new Error("the read should have answered");
    expect(await check.read(before.state)).toEqual({ state: { n: 2 }, differs: ["new: x"], location: "https://site.test/a", lines: { gone: [], added: ["x"] } });
    expect(asked.map((entry) => [entry.callId, entry.start, entry.permission === automationStudioActionPermissionDenied])).toEqual([["site-reset.read.1", undefined, true], ["site-reset.read.2", { n: 1 }, true]]);
    expect(ran).toEqual([]);
  });

  it("goes to an act's own page through the arrival's node and parameter, then says what differs from its state before the act (t471)", async () => {
    const fake = domain([["new: still"]]);
    const check = new AutomationStudioSiteResetStartCheck({ binding: { ...fake.binding, runsNodes: { arrival: { node: "demo.go", parameter: "to" }, runnable: ["demo.go"] } }, projectId: "p", flowId: "f", tools: [runNode], executeTool: fake.executeTool });
    const looked = await check.compareAt({ state: { before: true }, location: "https://site.test/b", changed: ["new: still"] });
    expect(looked).toEqual({ moved: true, differs: ["new: still"] });
    expect(fake.ran).toEqual([{ callId: "site-reset.place.1.arrival", toolId: "core.run_node", value: { node: "demo.go", parameters: { to: "https://site.test/b" }, consequences: [] } }]);
    expect(fake.asked).toEqual([{ callId: "site-reset.read.1", start: { before: true }, permission: automationStudioActionPermissionDenied }]);
  });

  it("says nothing differs-wise at a place without an arrival, or when going there was refused", async () => {
    const place = { state: {}, location: "https://site.test/b", changed: ["x"] };
    const bare = domain();
    expect(await new AutomationStudioSiteResetStartCheck({ binding: bare.binding, projectId: "p", flowId: "f", tools: [runNode], executeTool: bare.executeTool }).compareAt(place)).toEqual({ moved: false });
    const refused = domain([], { arrival: { ok: false, code: "refused" } });
    const check = new AutomationStudioSiteResetStartCheck({ binding: { ...refused.binding, runsNodes: { arrival: { node: "demo.go", parameter: "to" }, runnable: ["demo.go"] } }, projectId: "p", flowId: "f", tools: [runNode], executeTool: refused.executeTool });
    expect(await check.compareAt(place)).toEqual({ moved: true });
    expect(refused.asked).toEqual([]);
  });

  it("takes what went away between two reads of an untouched page as live content, and leaves it out from then on (t475)", async () => {
    // A banner rotating between two slides: each read shows the other one; the act's own line stays.
    let slide = 0;
    const binding = {
      startState: async (input: { start?: JsonObject }) => {
        slide += 1;
        const added = input.start ? [`banner slide ${slide % 2}`, "line added"] : [];
        return { state: { slide }, differs: added.map((line) => `new: ${line}`), location: "https://site.test/a", lines: { gone: [], added }, items: ["line:before"] };
      },
      runsNodes: { arrival: { node: "demo.go", parameter: "to" }, runnable: ["demo.go"] }
    };
    const slept: number[] = [];
    const check = new AutomationStudioSiteResetStartCheck({ binding, projectId: "p", flowId: "f", tools: [runNode], executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true }),
      liveCheck: { settleMs: 1000, sleep: async (ms) => { slept.push(ms); } } });
    // The slide the first read showed went away by the second: that one is live from now on.
    const settled = await check.settled({ slide: 0 });
    expect(settled).toMatchObject({ differs: ["new: banner slide 0", "new: line added"], lines: { gone: [], added: ["banner slide 0", "line added"] }, items: ["line:before"] });
    expect(slept).toEqual([1000]);
    // A later single read leaves the banner out too, and so does a comparison at the act's own page.
    expect(await check.read({ slide: 0 })).toMatchObject({ differs: ["new: line added"], lines: { added: ["line added"] } });
    expect(await check.compareAt({ state: { slide: 0 }, location: "https://site.test/a", changed: ["new: line added"] })).toEqual({ moved: true, differs: ["new: line added"], lines: { gone: [], added: ["line added"] } });
    expect(check.seenItems()).toEqual(new Set(["line:before"]));
  });

  it("reads the start twice when comparing with a live check, and leaves out what went away between the two (t475)", async () => {
    // A notice rotating through three messages, one per read against the start.
    let n = 0;
    const binding = { startState: async (input: { start?: JsonObject }) => {
      if (!input.start) return { state: { n }, differs: [] };
      n += 1;
      return { state: { n }, differs: [`notice ${n % 3}`, "new: line"] };
    } };
    const ran: string[] = [];
    const check = new AutomationStudioSiteResetStartCheck({ binding, projectId: "p", flowId: "f", tools: [runNode], executeTool: async (call) => {
      ran.push(call.callId);
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true };
    }, liveCheck: { settleMs: 0 } });
    await check.capture();
    // The first notice went away by itself; the second has not been seen to yet.
    expect(await check.compare()).toEqual({ moved: true, differs: ["notice 2", "new: line"] });
    // Read again: that one goes away too, and only the build's line is left.
    expect(await check.compare()).toEqual({ moved: true, differs: ["new: line"] });
    expect(ran).toEqual(["site-reset.1.arrival", "site-reset.2.arrival"]);
  });

  it("never takes an act's effect that is slow to appear for live content (t475)", async () => {
    let n = 0;
    const binding = {
      startState: async (input: { start?: JsonObject }) => {
        n += 1;
        // The act's line shows only from the second read on, as a count updated after a short delay does.
        const added = input.start && n >= 2 ? ["cart 1"] : [];
        return { state: { n }, differs: added.map((line) => `new: ${line}`), location: "https://site.test/a", lines: { gone: [], added } };
      }
    };
    const check = new AutomationStudioSiteResetStartCheck({ binding, projectId: "p", flowId: "f", tools: [runNode], executeTool: async () => ({}), liveCheck: { settleMs: 0 } });
    expect(await check.settled({ n: 0 })).toMatchObject({ differs: ["new: cart 1"], lines: { added: ["cart 1"] } });
    expect(await check.read({ n: 0 })).toMatchObject({ differs: ["new: cart 1"] });
  });
});
