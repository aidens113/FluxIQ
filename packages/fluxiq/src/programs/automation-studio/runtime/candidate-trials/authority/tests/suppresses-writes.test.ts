import { expect, it } from "vitest";
import { bindTrialReadOnlyInvocation } from "../../observation/index.ts";
import { isCandidateTrialReadOnlyInvocation } from "../index.ts";
import { candidateTrialSuppressesWrites } from "../../index.ts";

it("keeps persistence suppressed after an original readonly lease is lost without granting a copied request any mode", () => {
  const request = Object.freeze({ mode: "offline" });
  let current = true;
  const clear = bindTrialReadOnlyInvocation(request, { current: () => current });
  expect(isCandidateTrialReadOnlyInvocation(request)).toBe(true);
  expect(candidateTrialSuppressesWrites(request)).toBe(true);
  expect(candidateTrialSuppressesWrites({ ...request })).toBe(false);
  expect(candidateTrialSuppressesWrites({ mode: "cached_rejudge", readonly: true })).toBe(false);
  current = false;
  expect(isCandidateTrialReadOnlyInvocation(request)).toBe(false);
  expect(candidateTrialSuppressesWrites(request)).toBe(true);
  clear();
  expect(candidateTrialSuppressesWrites(request)).toBe(false);
});
