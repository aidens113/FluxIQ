import { describe, expect, it } from "vitest";
import { withheldCommand, withheldLookup, withheldResult } from "../attempt-withholding.ts";
import { FLUXIQ_RUNTIME_WITHHELD_VALUE, type FluxIQRuntimeCommand, type FluxIQRuntimeCommandResult } from "../contracts.ts";

// Obviously synthetic: every assertion about these is where they must not appear.
const SUPPLIED = "synthetic-attempt-value-that-must-never-be-persisted";
const SUPPLIED_NUMBER = 4418093;
const W = FLUXIQ_RUNTIME_WITHHELD_VALUE;

const lookup = () => withheldLookup({ texts: [SUPPLIED], numbers: [SUPPLIED_NUMBER] });

describe("attempt withholding", () => {
  it("is null when nothing usable is withheld", () => {
    expect(withheldLookup(undefined)).toBeNull();
    expect(withheldLookup({ texts: [""], numbers: [Number.NaN, Number.POSITIVE_INFINITY] })).toBeNull();
  });

  it("withholds echoed values in a command's parameters, target and metadata, keeping keys, shape and unmarked values", () => {
    const command: FluxIQRuntimeCommand & { commandId: string } = {
      commandId: "command.type",
      kind: "execute_action",
      actionType: "web.type",
      timeoutMs: 5000,
      parameters: { text: SUPPLIED, count: SUPPLIED_NUMBER, other: 3, flag: true, none: null },
      target: { selector: `#field[value="${SUPPLIED}"]`, index: 2 },
      metadata: { echo: { deep: [SUPPLIED, "plain", SUPPLIED_NUMBER] }, label: "Type into field" }
    };

    const kept = withheldCommand(command, lookup());

    expect(kept).toEqual({
      commandId: "command.type",
      kind: "execute_action",
      actionType: "web.type",
      timeoutMs: 5000,
      parameters: { text: W, count: W, other: 3, flag: true, none: null },
      target: { selector: `#field[value="${W}"]`, index: 2 },
      metadata: { echo: { deep: [W, "plain", W] }, label: "Type into field" }
    });
    expect(JSON.stringify(kept)).not.toContain(SUPPLIED);
    expect(command.parameters?.text).toBe(SUPPLIED);
  });

  it("withholds echoed values in a result's payload, target, failure prose and metadata, and leaves unmarked values untouched", () => {
    const result: FluxIQRuntimeCommandResult = {
      commandId: "command.type",
      status: "failed",
      completedAt: 10,
      message: `Could not type ${SUPPLIED}.`,
      error: `Refused ${SUPPLIED}.`,
      payload: { typed: SUPPLIED, rows: [{ amount: SUPPLIED_NUMBER, name: "Row one" }], ok: false },
      target: { selector: "#field", value: SUPPLIED },
      failure: {
        category: "unexpected_state",
        code: "web.action.blocked",
        retryable: false,
        stage: "execution",
        expected: `field holds ${SUPPLIED}`,
        actual: "field is empty",
        evidenceDigest: "a".repeat(64)
      },
      metadata: { echoed: SUPPLIED, attempt: 1 }
    };

    const kept = withheldResult(result, lookup(), false);

    expect(kept).toEqual({
      commandId: "command.type",
      status: "failed",
      completedAt: 10,
      message: `Could not type ${W}.`,
      error: `Refused ${W}.`,
      payload: { typed: W, rows: [{ amount: W, name: "Row one" }], ok: false },
      target: { selector: "#field", value: W },
      failure: {
        category: "unexpected_state",
        code: "web.action.blocked",
        retryable: false,
        stage: "execution",
        expected: `field holds ${W}`,
        actual: "field is empty",
        evidenceDigest: "a".repeat(64)
      },
      metadata: { echoed: W, attempt: 1 }
    });
    expect(JSON.stringify(kept)).not.toContain(SUPPLIED);
    expect(result.payload?.typed).toBe(SUPPLIED);
  });

  it("replaces a payload whole when asked, while still withholding the other fields", () => {
    const kept = withheldResult(
      { commandId: "command.extract", status: "succeeded", payload: { typed: SUPPLIED }, metadata: { echoed: SUPPLIED } },
      lookup(),
      true
    );
    expect(kept).toEqual({ commandId: "command.extract", status: "succeeded", payload: W, metadata: { echoed: W } });
    expect(withheldResult({ commandId: "command.none", status: "succeeded" }, lookup(), true)).toEqual({ commandId: "command.none", status: "succeeded" });
  });

  it("returns the command and result as given when nothing is withheld", () => {
    const command: FluxIQRuntimeCommand & { commandId: string } = { commandId: "command.plain", kind: "execute_action", parameters: { text: SUPPLIED }, metadata: { m: SUPPLIED } };
    const result: FluxIQRuntimeCommandResult = { commandId: "command.plain", status: "succeeded", payload: { text: SUPPLIED }, metadata: { m: SUPPLIED } };
    expect(withheldCommand(command, null)).toBe(command);
    expect(withheldResult(result, null, false)).toBe(result);
  });
});
