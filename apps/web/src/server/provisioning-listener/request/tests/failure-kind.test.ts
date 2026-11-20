import { describe, expect, it } from "vitest";
import { failureKind } from "../failure-kind";
import { formatRequestLogLine } from "../format-request-log-line";

describe("failureKind", () => {
  it("names a failure by its class and machine code, never its message", () => {
    expect(failureKind(new Error("workspaces.close_failed: owner@example.test's workspace"))).toBe("Error:workspaces.close_failed");
    expect(failureKind(Object.assign(new Error("open /data/secret-file failed"), { code: "ENOENT" }))).toBe("Error:ENOENT");
    expect(failureKind(new TypeError("Cannot read properties of undefined (reading 'email')"))).toBe("TypeError");
    expect(failureKind("a string thrown")).toBe("string");
  });

  it("follows an aggregate's errors and a cause, one level each way, and never their messages", () => {
    const inner = new AggregateError([new Error("workspaces.busy: in use"), new Error("person@example.test")], "1 of 2 failed");
    const kind = failureKind(new Error("environments.purge_failed: for person@example.test", { cause: inner }));
    expect(kind).toBe("Error:environments.purge_failed<AggregateError[Error:workspaces.busy+Error]");
    expect(kind).not.toContain("@");
  });

  it("puts the kind on the request's log line only for an unexpected failure", () => {
    expect(formatRequestLogLine({ operation: "deleteAccount", status: 500, code: "internal_error", durationMs: 697.4, failure: "Error:workspaces.close_failed" }))
      .toBe("[FluxIQ] provisioning deleteAccount 500 internal_error 697ms failure=Error:workspaces.close_failed");
    expect(formatRequestLogLine({ operation: "createAccount", status: 200, code: null, durationMs: 12 })).toBe("[FluxIQ] provisioning createAccount 200 - 12ms");
  });
});
