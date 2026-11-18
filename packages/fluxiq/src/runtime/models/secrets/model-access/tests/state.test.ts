import { readModelAccessState } from "@fluxiq/contracts/platform";
import { describe, expect, it } from "vitest";
import { AutomationStudioModelAccessLedger, automationStudioModelAccessOutcomeOf, automationStudioModelAccessState } from "../index.ts";
import type { AutomationStudioSessionKeySummary } from "../../session-key.ts";

const claude: AutomationStudioSessionKeySummary = { id: "claude", name: "Claude", kind: "llm", provider: "Anthropic", enabled: true, updatedAtMs: 10, createdBy: "u1" };

describe("a person's model-access state", () => {
  it("is ready with the key a call would use, and every state reads back through the contract", () => {
    const state = automationStudioModelAccessState({ keys: [claude], userId: "u1", ledger: new AutomationStudioModelAccessLedger() });
    expect(state).toMatchObject({ status: "ready", key: { id: "claude", name: "Claude", provider: "anthropic" }, lastCall: null });
    expect(readModelAccessState(state)).toEqual(state);
  });

  it("names a key this server cannot open, with its cause", () => {
    const state = automationStudioModelAccessState({ keys: [{ ...claude, availability: { state: "unavailable", code: "host_protection_unavailable" } }], userId: "u1", ledger: new AutomationStudioModelAccessLedger() });
    expect(state).toMatchObject({ status: "key_unopenable", unopenableCode: "host_protection_unavailable" });
    expect(readModelAccessState(state)).toEqual(state);
  });

  it("carries the last call's refusal or unreachability until the key changes", () => {
    let now = 100;
    const ledger = new AutomationStudioModelAccessLedger(() => now);
    ledger.note(claude, "provider_refused", "Anthropic (Claude) refused the saved model key, so check or replace it in Settings, under AI keys.");
    const refused = automationStudioModelAccessState({ keys: [claude], userId: "u1", ledger });
    expect(refused).toMatchObject({ status: "provider_refused", lastCall: { outcome: "provider_refused", atMs: 100 } });
    expect(readModelAccessState(refused)).toEqual(refused);
    now = 200;
    ledger.note(claude, "provider_unreachable");
    expect(automationStudioModelAccessState({ keys: [claude], userId: "u1", ledger })).toMatchObject({ status: "provider_unreachable", message: expect.stringMatching(/could not be reached/u) });
    // Replaced (rotated) since: the old call says nothing about it.
    expect(automationStudioModelAccessState({ keys: [{ ...claude, updatedAtMs: 11 }], userId: "u1", ledger })).toMatchObject({ status: "ready", lastCall: null });
  });

  it("says an empty account in its own words, and an old-format key upgrades on the next panel sign-in", () => {
    const ledger = new AutomationStudioModelAccessLedger();
    ledger.note(claude, "no_credit");
    const empty = automationStudioModelAccessState({ keys: [claude], userId: "u1", ledger });
    expect(empty).toMatchObject({ status: "no_credit", message: "Anthropic (Claude) says the account behind Claude has no credit left." });
    expect(readModelAccessState(empty)).toEqual(empty);
    const legacy = automationStudioModelAccessState({ keys: [{ ...claude, availability: { state: "unavailable", code: "legacy_recovery_required" } }], userId: "u1", ledger: new AutomationStudioModelAccessLedger() });
    expect(legacy.message).toBe("The saved model key is in an old format, and it is upgraded automatically the next time its owner signs in to the FluxIQ panel.");
    expect(legacy.message).not.toMatch(/unlock/iu);
  });

  it("says no key only when there is none", () => {
    expect(automationStudioModelAccessState({ keys: [], userId: "u1", ledger: new AutomationStudioModelAccessLedger() })).toMatchObject({ status: "no_key", key: null });
  });

  it("reads an access outcome only from codes that are about access", () => {
    expect(automationStudioModelAccessOutcomeOf({ code: "llm.provider_auth_failed" })).toBe("provider_refused");
    expect(automationStudioModelAccessOutcomeOf({ code: "llm.provider_balance_exhausted" })).toBe("no_credit");
    expect(automationStudioModelAccessOutcomeOf({ code: "llm.provider_network_error" })).toBe("provider_unreachable");
    expect(automationStudioModelAccessOutcomeOf({ code: "llm.provider_timeout" })).toBeUndefined();
    expect(automationStudioModelAccessOutcomeOf(new Error("x"))).toBeUndefined();
  });
});
