// A FluxNode's secret inputs on the run's side (`../`): the goal names them, the attempt is given the
// other inputs, events and results keep their own ids while every text a secret reached is withheld,
// and an export drops any default a binding to a secret still holds.
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../../../../../core/index.ts";
import { fluxNodeInputsWithoutSecrets, fluxNodeSecretGoalInputs, fluxNodeWithheldForProgram, fluxNodeWithoutSecretDefaults } from "../index.ts";

describe("a FluxNode's secret inputs on the run's side", () => {
  it("are named in the goal and left out of the attempt's inputs", () => {
    const named = fluxNodeSecretGoalInputs({ user: "ada", password: "hunter2" }, ["password"]);
    expect(named["user"]).toBe("ada");
    expect(named["password"]).toMatch(/^the secret "password" \(withheld from you/u);
    expect(JSON.stringify(named)).not.toContain("hunter2");
    expect(fluxNodeInputsWithoutSecrets({ user: "ada", password: "hunter2" }, ["password"])).toEqual({ user: "ada" });
    const inputs = { user: "ada" };
    expect(fluxNodeSecretGoalInputs(inputs, [])).toBe(inputs);
  });

  it("are withheld from an event's and a result's texts and data, never from their own ids", () => {
    const ended = {
      type: "ended", runId: "run.hunter2", seq: 3, at: 1,
      result: { runId: "run.hunter2", name: "notes.sign-in", status: "achieved", flowPath: "nodes/notes/sign-in", outputs: { said: "Welcome hunter2", name: "hunter2" }, verdict: { label: "confirmed", reason: "It showed hunter2." }, cost: { calls: 1, tokens: 2, usd: 0 } }
    };
    expect(fluxNodeWithheldForProgram(ended, ["hunter2"])).toEqual({
      ...ended,
      result: { ...ended.result, outputs: { said: "Welcome [withheld]", name: "[withheld]" }, verdict: { label: "confirmed", reason: "It showed [withheld]." } }
    });
    const check = { type: "check_needed", eventId: "e1", inputs: { password: "hunter2", user: "ada" }, outputs: null };
    expect(fluxNodeWithheldForProgram(check, ["hunter2", ""])).toEqual({ ...check, inputs: { password: "[withheld]", user: "ada" } });
    expect(fluxNodeWithheldForProgram(check, [])).toBe(check);
  });

  it("leave no default on a binding to a secret in an export, and change nothing else", () => {
    const saved: JsonValue = { steps: [{ parameters: { password: { $state: { path: "password", fallback: "hunter2" } }, user: { $state: { path: "user", fallback: "ada" } } } }] };
    expect(fluxNodeWithoutSecretDefaults(saved, ["password"])).toEqual({ steps: [{ parameters: { password: { $state: { path: "password" } }, user: { $state: { path: "user", fallback: "ada" } } } }] });
    expect(fluxNodeWithoutSecretDefaults(saved, ["pin"])).toBe(saved);
  });
});
