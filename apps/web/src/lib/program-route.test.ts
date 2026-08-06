import { describe, expect, it } from "vitest";
import { programDomainScope, programResponseStatus, withProgramAuthSession } from "./program-route";

describe("global program web route", () => {
  it.each([
    [{ ok: true }, 200],
    [{ ok: false, errorCode: "authorization.required" }, 401],
    [{ ok: false, errorCode: "authorization.forbidden" }, 403],
    [{ ok: false, errorCode: "endpoint.not_found" }, 404],
    [{ ok: false }, 400],
  ] as const)("maps API responses to HTTP status", (response, status) => {
    expect(programResponseStatus(response)).toBe(status);
  });

  it("preserves domain scope from the request URL", () => {
    expect(programDomainScope("http://localhost/api/programs/docs/snapshot?domainId=example")).toEqual({ domainId: "example" });
    expect(programDomainScope("http://localhost/api/programs/docs/snapshot")).toEqual({ domainId: null });
  });

  it("injects the authenticated session only into privileged program payloads", () => {
    expect(withProgramAuthSession("database-manager", { kind: "identity.users", authSessionId: "spoofed" }, "trusted")).toEqual({
      kind: "identity.users",
      authSessionId: "trusted",
    });
    expect(withProgramAuthSession("background-tasks", { taskId: "one" }, "trusted")).toEqual({ taskId: "one" });
    expect(withProgramAuthSession("automation-studio", ["invalid"], "trusted")).toEqual(["invalid"]);
  });
});
