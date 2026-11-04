// @fluxiq-test-group real-sql
// The keep-going table's rows about a round that cannot go on: a stall, the rounds limit, replies
// that cannot be read, and a provider gone quiet. Each is a fresh round or a wait, from the page
// as it stands, with the same act record and the same tried record, and never an ending.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult, AutomationStudioLlmTaskRequest } from "../../../../../../../runtime/llm/index.ts";
import { AutomationStudioLlmProviderError } from "../../../../../../../runtime/models/failures/index.ts";
import { complete, fakeLibrary, LOOK_TOOL, READ_LOANS, RENEW_CARD, runNode, scriptedAttempt, toolCall } from "../../fake-library.ts";
import { decisions, expectPresses, expectReached, judgedNo, keptAttempt, noWaiting } from "../support.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const noteOf = (request: AutomationStudioLlmTaskRequest): JsonObject | undefined => request.context.evidenceLoop?.evidence.find((entry) => entry.toolId === "core.attempt_note")?.value as JsonObject | undefined;
const failing: AutomationStudioLlmEvidenceToolExecutionResult = { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "target_not_found" }, effectApplied: false, resultCode: "web.action.rejected.target_not_found", failure: { category: "target_not_found", code: "web.target.not_found", retryable: false, stage: "dispatch" } };

describe("a round that cannot go on is not an ending", () => {
  it("a repeat-without-progress stall changes approach: a fresh round is told what was tried, with no page text, and reaches the result", async () => {
    const notes: JsonObject[] = [];
    const library = fakeLibrary();
    library.shelf = "a page text that must not travel";
    const decide = (request: AutomationStudioLlmTaskRequest) => {
      const note = noteOf(request);
      if (!note) return runNode("read.stuck", READ_LOANS, { from: "the wrong list" }, [], {});
      notes.push(note);
      return notes.length === 1 ? runNode("read", READ_LOANS, {}, [], { add: true }) : complete("Listed.");
    };
    const attempt = await scriptedAttempt({
      library,
      before: noWaiting(),
      fault: (call) => (call.value.parameters as JsonObject | undefined)?.from === "the wrong list" ? failing : undefined,
      script: Array.from({ length: 80 }, () => decide)
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    // The ladder reached its change of approach, on the record the attempt kept across rounds.
    const caught = Object.values(answer.attempt.loopsCaught);
    expect(caught.reduce((sum, each) => sum + each.changeApproach, 0)).toBeGreaterThanOrEqual(1);
    const told = JSON.stringify(notes[0]);
    expect(told).toContain("already tried");
    expect(told).toContain("core.run_node");
    expect(told).not.toContain("a page text that must not travel");
    expect(told).not.toContain("the wrong list");
    const kept = await keptAttempt(attempt.service, attempt.projectId, attempt.flowId);
    expect(kept?.tried.approaches).toBeGreaterThanOrEqual(1);
    expect(kept?.tried.tried.some((entry) => entry.toolId === "core.run_node" && entry.outcome === "failed")).toBe(true);
  });

  it("the iteration limit is a fresh round from the page as it stands, and reaches the result", async () => {
    const library = fakeLibrary();
    let moved = 0;
    const notes: string[] = [];
    const decide = (request: AutomationStudioLlmTaskRequest) => {
      const note = noteOf(request);
      if (note) {
        notes.push(JSON.stringify(note));
        return notes.length === 1 ? runNode("read", READ_LOANS, {}, [], { add: true }) : complete("Listed.");
      }
      library.shelf = `shelf ${(moved += 1)}`;
      return toolCall(`look.${moved}`, LOOK_TOOL, { shelf: moved });
    };
    const attempt = await scriptedAttempt({ library, resolver: { maxCallsPerRun: 5 }, before: noWaiting(), script: Array.from({ length: 80 }, () => decide) }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(notes[0]).toContain("carriedOver");
    expect(notes[0]).toContain("ran out of turns");
    expect(attempt.said.some((line) => line.includes("Carrying on"))).toBe(true);
    expect(library.calls.filter((call) => call.value.replay === "reset")).toEqual([]);
  });

  it("unreadable replies are a fresh round, and reach the result", async () => {
    let unreadable = 0;
    let told = "";
    const attempt = await scriptedAttempt({
      before: noWaiting(),
      wrapProvider: (provider) => ({
        ...provider,
        runTask: async (request, execution) => {
          const note = request.context.evidenceLoop?.evidence.find((entry) => entry.toolId === "core.attempt_note");
          if (request.taskKind === "evidence_tool_decision" && request.metadata?.source !== "instructionAuthority" && !note) {
            unreadable += 1;
            throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Mangled.", false);
          }
          told ||= JSON.stringify(note?.value ?? "");
          return await provider.runTask(request, execution);
        }
      }),
      script: [runNode("read", READ_LOANS, {}, [], { add: true }), complete("Listed.")]
    }, cleanups);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(unreadable).toBeGreaterThan(1);
    expect(told).toContain("unreadable");
  });

  it("a provider silent then back is waited out with backoff, said in chat, with no act repeated", async () => {
    const waits: number[] = [];
    let silences = 3;
    const attempt = await scriptedAttempt({
      instruction: "Renew the card on my library account.",
      permittedConsequences: ["modify_existing"],
      before: noWaiting(waits),
      wrapProvider: (provider) => ({
        ...provider,
        runTask: async (request, execution) => {
          if (request.taskKind === "evidence_tool_decision" && request.metadata?.source !== "instructionAuthority" && decisions({ requests: spent }).filter((each) => each.metadata?.source !== "instructionAuthority").length === 1 && silences > 0) {
            silences -= 1;
            throw new AutomationStudioLlmProviderError("llm.provider_timeout", "No answer.", false);
          }
          spent.push(request);
          return await provider.runTask(request, execution);
        }
      }),
      script: [runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Renewed.")]
    }, cleanups);
    expect(waits).toEqual([5_000, 10_000, 20_000]);
    expect(attempt.said.filter((line) => line.includes("Waiting for the model service"))).toHaveLength(3);
    expect(attempt.said.some((line) => /Stop works at any time/u.test(line))).toBe(true);
    const answer = expectReached(attempt);
    expectPresses(attempt, { card: 1 });
    expect(answer.result?.acts).toHaveLength(1);
    // That silence itself costs nothing is held by the Stop during such a wait, whose spend is exactly zero (`./person.test.ts`).
  });

  it("a task with a failing step, a judge's no, a stall and provider errors all in one still reaches its result", async () => {
    const waits: number[] = [];
    const library = fakeLibrary();
    let silences = 2;
    let fresh = 0;
    let afterNote = 0;
    const decide = (request: AutomationStudioLlmTaskRequest) => {
      if (!noteOf(request)) return runNode("read.stuck", READ_LOANS, { from: "the wrong list" }, [], {});
      afterNote += 1;
      if (afterNote === 1) {
        fresh += 1;
        return runNode("read", READ_LOANS, {}, [], { add: true });
      }
      if (afterNote === 2) return complete("Listed.");
      if (afterNote === 3) {
        library.shelf = "looked again";
        return runNode("read.again", READ_LOANS, { again: true }, [], {});
      }
      return complete("Listed, and looked again.");
    };
    const attempt = await scriptedAttempt({
      library,
      instruction: "Renew the card and list every loan on my library account.",
      permittedConsequences: ["modify_existing"],
      before: noWaiting(waits),
      judge: [judgedNo("The list is not confirmed.")],
      fault: (call) => (call.value.parameters as JsonObject | undefined)?.from !== undefined ? failing : undefined,
      wrapProvider: (provider) => ({
        ...provider,
        runTask: async (request, execution) => {
          if (request.taskKind === "evidence_tool_decision" && request.metadata?.source !== "instructionAuthority" && decisions({ requests: spent }).filter((each) => each.metadata?.source !== "instructionAuthority").length === 2 && silences > 0) {
            silences -= 1;
            throw new AutomationStudioLlmProviderError("llm.provider_http_error", "Bad gateway.", false, 503);
          }
          spent.push(request);
          return await provider.runTask(request, execution);
        }
      }),
      script: [
        runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }),
        runNode("read.bad", READ_LOANS, { from: "somewhere" }, [], {}),
        ...Array.from({ length: 30 }, () => decide)
      ]
    }, cleanups);
    expect(fresh).toBe(1);
    expect(waits.length).toBeGreaterThanOrEqual(2);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expect(answer.result?.acts).toHaveLength(1);
    expectPresses(attempt, { card: 1 });
    expect(attempt.requests.filter((request) => request.taskKind === "loop_verification").length).toBeGreaterThanOrEqual(1);
  });
});

/** The requests answered so far in the test that is running: reset by nothing, read by count from its own start. */
const spent: AutomationStudioLlmTaskRequest[] = [];
afterEach(() => { spent.length = 0; });
