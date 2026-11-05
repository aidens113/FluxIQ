import { describe, expect, it } from "vitest";
import { withStoredCheckAuthorization } from "../index.ts";

// A client's write decides nothing about whose key pays for a Flow's result checks.

const NAMED_BY_CLIENT = { keyId: "key.someone-elses", authorizedByUserId: "user.other", unlockSessionId: "session.named" };
const STORED = { keyId: "key.own", authorizedByUserId: "user.owner", unlockSessionId: "session.own" };

function withCheck(check: Record<string, unknown>): Record<string, unknown> {
  return { trainingModeSettings: { resultCheck: check } };
}

describe("a Flow's standing result-check authorization", () => {
  it("is not set by a client when none is stored", () => {
    const merged = withStoredCheckAuthorization(withCheck({ enabled: true, authorization: NAMED_BY_CLIENT }), undefined);
    expect(merged).toEqual(withCheck({ enabled: true }));
  });

  it("is not replaced by a client, and what is stored stays", () => {
    const merged = withStoredCheckAuthorization(withCheck({ enabled: false, authorization: NAMED_BY_CLIENT }), withCheck({ enabled: true, authorization: STORED }));
    expect(merged).toEqual(withCheck({ enabled: false, authorization: STORED }));
  });

  it("stays when a client's patch does not mention it", () => {
    const merged = withStoredCheckAuthorization({ trainingModeSettings: { resultCheck: { enabled: false } } }, withCheck({ authorization: STORED }));
    expect(merged).toEqual(withCheck({ enabled: false, authorization: STORED }));
  });

  it("leaves everything else in the metadata alone", () => {
    const merged = withStoredCheckAuthorization({ other: 1, trainingModeSettings: { keep: true } }, undefined);
    expect(merged).toEqual({ other: 1, trainingModeSettings: { keep: true } });
  });
});
