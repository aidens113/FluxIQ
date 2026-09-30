import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
import { onboardingSteps, type OnboardingReadings } from "../index";

const NOW = 1_000_000;
const listening = { enabled: true, sessions: [], pairings: [], trustedClients: [], auditLog: [], webRuntime: { clientGatewayListening: true } };
const deepSeekKey = { id: "key.1", name: "Mine", kind: "llm" as const, provider: "DeepSeek", scope: "global" as const, enabled: true };

function readings(overrides: Partial<OnboardingReadings> = {}): OnboardingReadings {
  return { gateway: { status: "loaded", value: listening }, keys: { status: "loaded", value: [] }, ...overrides };
}
const states = (value: OnboardingReadings) => onboardingSteps(value, NOW).map((step) => step.state);

describe("onboarding steps", () => {
  it("walks runtime, pairing, and DeepSeek key in that order", () => {
    expect(onboardingSteps(readings(), NOW).map((step) => step.id)).toEqual(["runtime", "pairing", "deepseek-key"]);
  });

  it("marks every step done when all three conditions hold", () => {
    const steps = onboardingSteps(readings({ gateway: { status: "loaded", value: { ...listening, sessions: [{ sessionId: "s1" }] } }, keys: { status: "loaded", value: [deepSeekKey] } }), NOW);
    expect(steps.map((step) => step.state)).toEqual(["done", "done", "done"]);
    expect(steps[1]!.detail).toBe("1 browser extension is connected.");
  });

  it("makes the first unfinished step current and blocks every later unfinished step on it", () => {
    const notListening = { ...listening, webRuntime: { clientGatewayListening: false, clientGatewayError: "port 7443 in use" } };
    const steps = onboardingSteps(readings({ gateway: { status: "loaded", value: notListening } }), NOW);
    expect(steps.map((step) => step.state)).toEqual(["current", "blocked", "blocked"]);
    expect(steps[0]).toMatchObject({ problem: "port 7443 in use", action: { command: "pnpm dev" } });
    expect(steps[1]!.blockedBy).toBe("runtime");
    expect(steps[2]!.blockedBy).toBe("runtime");
    expect(states(readings())).toEqual(["done", "current", "blocked"]);
    expect(onboardingSteps(readings(), NOW)[2]!.blockedBy).toBe("pairing");
  });

  it("shows a later step done even while an earlier one is unfinished", () => {
    expect(states(readings({ keys: { status: "loaded", value: [deepSeekKey] } }))).toEqual(["done", "current", "done"]);
  });

  it("makes the key step current once the runtime and pairing are done, and links to Secret Keys", () => {
    const steps = onboardingSteps(readings({ gateway: { status: "loaded", value: { ...listening, sessions: [{ sessionId: "s1" }, { sessionId: "s2" }] } } }), NOW);
    expect(steps.map((step) => step.state)).toEqual(["done", "done", "current"]);
    expect(steps[1]!.detail).toBe("2 browser extensions are connected.");
    expect(steps[2]!.action.href).toBe("/programs/secret-keys");
    expect(steps[2]!.detail).toBe("No DeepSeek API key has been added yet.");
  });

  it("does not count a disabled or non-DeepSeek key", () => {
    expect(states(readings({ keys: { status: "loaded", value: [{ ...deepSeekKey, enabled: false }, { ...deepSeekKey, id: "k2", provider: "OpenAI" }] } }))[2]).toBe("blocked");
  });

  it("keeps a failed read as a problem, never as an empty answer", () => {
    const steps = onboardingSteps(readings({ gateway: { status: "failed", error: "connection refused" }, keys: { status: "failed", error: "unauthorized" } }), NOW);
    expect(steps.map((step) => step.state)).toEqual(["current", "blocked", "blocked"]);
    expect(steps.map((step) => step.problem)).toEqual(["connection refused", "connection refused", "unauthorized"]);
  });

  it("reports loading without claiming anything is missing", () => {
    const steps = onboardingSteps({ gateway: { status: "loading" }, keys: { status: "loading" } }, NOW);
    expect(steps.map((step) => step.state)).toEqual(["current", "blocked", "blocked"]);
    expect(steps.every((step) => step.problem === undefined)).toBe(true);
    expect(steps[2]!.detail).toContain("Checking");
  });

  it("says a pairing request is waiting without exposing its code", () => {
    const gateway = { ...listening, pairings: [{ pairingCode: "SECRET-CODE", referenceCode: "REF-123", expiresAt: NOW + 30_000 }, { pairingCode: "OLD", expiresAt: NOW - 1 }] };
    const steps = onboardingSteps(readings({ gateway: { status: "loaded", value: gateway } }), NOW);
    expect(steps[1]).toMatchObject({ state: "current", detail: expect.stringContaining("pairing request is waiting") });
    expect(JSON.stringify(steps)).not.toContain("SECRET-CODE");
    expect(JSON.stringify(steps)).not.toContain("REF-123");
    const expired = { ...listening, pairings: [{ pairingCode: "OLD", expiresAt: NOW - 1 }] };
    expect(onboardingSteps(readings({ gateway: { status: "loaded", value: expired } }), NOW)[1]!.detail).toBe("No browser extension is connected yet.");
  });
});
