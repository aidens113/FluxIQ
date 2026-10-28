// The typed locked-key error and its one sentence.
import { describe, expect, it } from "vitest";
import { parseAutomationStudioFailureRecord } from "../../../failure/index.ts";
import { SECRETS_LOCKED_ERROR_CODE, isSecretsLockedError, secretsLockedMessage } from "../index.ts";

describe("secrets.locked", () => {
  it("says the plan's sentence for the instance's host", () => {
    expect(secretsLockedMessage("app.getfluxiq.com")).toBe("Sign in at app.getfluxiq.com to unlock your model key");
  });

  it("recognises the error and nothing else", () => {
    expect(isSecretsLockedError({ code: "secrets.locked", message: secretsLockedMessage("127.0.0.1:3000") })).toBe(true);
    expect(isSecretsLockedError({ code: "secrets.locked", message: "x", signInUrl: "https://app.getfluxiq.com/" })).toBe(true);
    expect(isSecretsLockedError({ code: "secrets.locked" })).toBe(false);
    expect(isSecretsLockedError({ code: "secrets.unavailable", message: "x" })).toBe(false);
    expect(isSecretsLockedError({ code: "secrets.locked", message: "x", signInUrl: 3 })).toBe(false);
    expect(isSecretsLockedError("secrets.locked")).toBe(false);
  });

  it("is a valid failure-record code for an auth_required, unretryable failure", () => {
    const record = { category: "auth_required", code: SECRETS_LOCKED_ERROR_CODE, retryable: false, stage: "dispatch" };
    expect(parseAutomationStudioFailureRecord(record)).toEqual(record);
  });
});
