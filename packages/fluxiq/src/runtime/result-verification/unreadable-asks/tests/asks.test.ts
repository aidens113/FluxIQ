// How one judge's check is asked again while its replies cannot be read (t979): which failures those are, the note,
// when a continuing judge goes standalone, that every retry keeps its model, and what its routing is told.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import {
  automationStudioResultSummaryWithUnreadableNote,
  automationStudioResultUnreadableAsks,
  automationStudioResultUnreadableReplySaid,
  automationStudioResultUnreadableRouting,
  automationStudioResultUnreadableSteer
} from "../index.ts";

const error = (code: string, metadata?: Record<string, unknown>) => ({ severity: "error", code, ...(metadata ? { metadata } : {}) });

describe("which failed calls had a reply that could not be read", () => {
  it("says what could not be read, by the reply's case where it has one, else by its code", () => {
    expect(automationStudioResultUnreadableReplySaid([error("llm.provider_malformed_response", { providerReply: { case: "content_unclosed" } })])).toBe("the JSON object never closed: it stopped part-way through");
    expect(automationStudioResultUnreadableReplySaid([error("llm.provider_output_truncated")])).toBe("it reached the reply length limit and was cut off");
    expect(automationStudioResultUnreadableReplySaid([error("llm.provider_malformed_response")])).toBe("it could not be read");
    // A reply Core's checks refused was JSON that did not fit the answer asked for.
    expect(automationStudioResultUnreadableReplySaid([error("llm_output.invalid_diagnosis_text")])).toBe("it was JSON, but it did not fit the answer asked for");
    // A warning beside it changes nothing.
    expect(automationStudioResultUnreadableReplySaid([{ severity: "warning", code: "llm.provider_retry_attempted" }, error("llm.provider_output_truncated")])).toBe("it reached the reply length limit and was cut off");
  });

  it("names where a reply off the schema parted from it, by path and rule alone (t1000)", () => {
    const misses = [{ path: "response.diagnosis.defects", rule: "is missing, and it must be there" }, { path: "response.kind", rule: "must be exactly \"diagnosis\"" }];
    expect(automationStudioResultUnreadableReplySaid([error("llm.provider_output_invalid", { providerReply: { case: "content_off_shape", misses } })])).toBe("it was JSON, but it did not fit the answer asked for: response.diagnosis.defects is missing, and it must be there; response.kind must be exactly \"diagnosis\"");
    // Anything that is not a schema path and a schema rule is never carried into the note.
    expect(automationStudioResultUnreadableReplySaid([error("llm.provider_output_invalid", { providerReply: { case: "content_off_shape", misses: [{ path: "a value with spaces", rule: "anything at all" }] } })])).toBe("it was JSON, but it did not fit the answer asked for");
  });

  it("is nothing for a fault where nothing arrived, a refused key, a purse's refusal or no error at all", () => {
    for (const code of ["llm.provider_timeout", "llm.provider_http_error", "llm.provider_auth_failed", "llm_budget.run_cost_limit", "llm.provider_balance_exhausted"]) {
      expect(automationStudioResultUnreadableReplySaid([error(code)])).toBeUndefined();
    }
    expect(automationStudioResultUnreadableReplySaid([error("llm.provider_malformed_response"), error("llm.provider_auth_failed")])).toBeUndefined();
    expect(automationStudioResultUnreadableReplySaid([])).toBeUndefined();
  });
});

describe("one check's unreadable replies", () => {
  it("asks again after every unreadable reply and resets its note after a readable reply", () => {
    const asks = automationStudioResultUnreadableAsks({ continuesDecider: false });
    expect(asks.unread("a")).toBe("asked_again");
    expect(asks).toMatchObject({ said: "a", inARow: 1, standalone: false });
    expect(asks.unread("b")).toBe("asked_again");
    expect(asks).toMatchObject({ said: "b", inARow: 2 });
    asks.readable();
    expect(asks).toMatchObject({ said: undefined, inARow: 0, total: 2 });
    // A readable reply clears the note without ending the check.
    expect(asks.unread("c")).toBe("asked_again");
    expect(asks.unread("d")).toBe("asked_again");
    expect(asks.total).toBe(4);
  });

  it("sends a continuing judge standalone on its first, on the same model, and keeps asking standalone on that model", () => {
    const asks = automationStudioResultUnreadableAsks({ continuesDecider: true });
    expect(asks.unread("a")).toBe("standalone");
    expect(asks).toMatchObject({ standalone: true });
    expect(automationStudioResultUnreadableRouting(asks, true)).toEqual({ judgeStandaloneAfterUnreadable: true });
    expect(asks.unread("b")).toBe("asked_again");
    expect(automationStudioResultUnreadableRouting(asks, true)).toEqual({ judgeStandaloneAfterUnreadable: true });
    asks.readable();
    // Standalone stays for the rest of the check.
    expect(automationStudioResultUnreadableRouting(asks, true)).toEqual({ judgeStandaloneAfterUnreadable: true });
  });

  it("catches the same unreadable reply again as a loop and steers it, with the count, until a different or readable reply (t1000)", () => {
    const asks = automationStudioResultUnreadableAsks({ continuesDecider: false });
    expect(asks.unread("a")).toBe("asked_again");
    expect(asks.repeat).toBeUndefined();
    expect(asks.steer).toBeUndefined();
    expect(asks.unread("a")).toBe("steered");
    expect(asks.repeat).toEqual({ pattern: "exact_repeat", repeats: 2, toolIds: ["loop_verification"], unchanged: [] });
    expect(asks.steer).toBe(automationStudioResultUnreadableSteer({ repeats: 2 }));
    expect(asks.unread("a")).toBe("steered");
    expect(asks.repeat?.repeats).toBe(3);
    // A different unreadable reply starts again.
    expect(asks.unread("b")).toBe("asked_again");
    expect(asks.repeat).toBeUndefined();
    expect(asks.unread("b")).toBe("steered");
    // A readable reply ends the loop.
    asks.readable();
    expect(asks.repeat).toBeUndefined();
    expect(asks.unread("b")).toBe("asked_again");
  });

  it("offers the judge only change_approach and finish_with_best, never the person, in generic words", () => {
    const steer = automationStudioResultUnreadableSteer({ repeats: 4 });
    expect(steer).toContain("the same unreadable reply 4 times in a row");
    expect(steer).toContain("change_approach");
    expect(steer).toContain("finish_with_best");
    expect(steer).toContain("answersRequest unknown");
    expect(steer).not.toMatch(/ask_person|continue/u);
  });

  it("tells routing nothing new before any unreadable reply", () => {
    expect(automationStudioResultUnreadableRouting(automationStudioResultUnreadableAsks({ continuesDecider: true }), true)).toEqual({ continuesDecider: true });
    expect(automationStudioResultUnreadableRouting(automationStudioResultUnreadableAsks({ continuesDecider: false }), false)).toEqual({});
  });
});

describe("the note an ask after an unreadable reply carries", () => {
  it("is last, says what could not be read, replaces an earlier note, and leaves everything before it as it was", () => {
    const summary = { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 1, recheck: "Core's words.", earlierAdvice: [] } as unknown as AutomationStudioRunResultSummary;
    const once = automationStudioResultSummaryWithUnreadableNote(summary, "it was empty");
    expect(Object.keys(once)).toEqual([...Object.keys(summary), "unreadableReply"]);
    expect(JSON.stringify(once).startsWith(JSON.stringify(summary).slice(0, -1))).toBe(true);
    expect(once.unreadableReply).toContain("could not be read: it was empty.");
    const twice = automationStudioResultSummaryWithUnreadableNote(once, "it held no text");
    expect(Object.keys(twice)).toEqual(Object.keys(once));
    expect(twice.unreadableReply).toContain("it held no text");
    expect(twice.unreadableReply).not.toContain("it was empty");
    // A repeat's steer follows what could not be read (t1000).
    const steered = automationStudioResultSummaryWithUnreadableNote(once, "it was empty", "STEER");
    expect(steered.unreadableReply?.endsWith(" STEER")).toBe(true);
  });
});
