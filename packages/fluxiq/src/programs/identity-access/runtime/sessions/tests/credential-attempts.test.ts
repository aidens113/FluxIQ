import { describe, expect, it } from "vitest";
import { CREDENTIAL_ATTEMPTS_EXCEEDED, IdentityCredentialAttempts } from "../credential-attempts.ts";

// Password guesses against a person's account, through a stolen session, cost the
// server work and must not be unlimited. Counted per person, not per caller.

const MINUTE = 60_000;

function wrong(): Promise<void> {
  return Promise.reject(new Error("Invalid username or credentials"));
}

async function failTimes(attempts: IdentityCredentialAttempts, userId: string, times: number): Promise<void> {
  for (let attempt = 0; attempt < times; attempt += 1) await expect(attempts.guard(userId, wrong)).rejects.toThrow("Invalid");
}

describe("password attempts at a recheck", () => {
  it("stops a guesser after a bounded number, without even checking the password", async () => {
    let clock = 1_000;
    const attempts = new IdentityCredentialAttempts(() => clock);
    await failTimes(attempts, "user.one", 8);
    let checked = 0;
    await expect(attempts.guard("user.one", async () => { checked += 1; })).rejects.toThrow(CREDENTIAL_ATTEMPTS_EXCEEDED);
    expect(checked).toBe(0);
    clock += 16 * MINUTE;
    await expect(attempts.guard("user.one", async () => { checked += 1; })).resolves.toBeUndefined();
    expect(checked).toBe(1);
  });

  it("the right password clears the count", async () => {
    const attempts = new IdentityCredentialAttempts(() => 1_000);
    await failTimes(attempts, "user.one", 7);
    await attempts.guard("user.one", async () => undefined);
    await failTimes(attempts, "user.one", 7);
    await expect(attempts.guard("user.one", async () => undefined)).resolves.toBeUndefined();
  });

  it("one person's guesses do not lock another", async () => {
    const attempts = new IdentityCredentialAttempts(() => 1_000);
    await failTimes(attempts, "user.one", 8);
    await expect(attempts.guard("user.two", async () => undefined)).resolves.toBeUndefined();
  });

  it("old failures age out of the window", async () => {
    let clock = 1_000;
    const attempts = new IdentityCredentialAttempts(() => clock);
    await failTimes(attempts, "user.one", 7);
    clock += 16 * MINUTE;
    await failTimes(attempts, "user.one", 7);
    await expect(attempts.guard("user.one", async () => undefined)).resolves.toBeUndefined();
  });
});
