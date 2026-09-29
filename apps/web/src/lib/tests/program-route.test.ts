import { describe, expect, it } from "vitest";
import {
  isPairedClientClassification,
  isPairedClientEndpoint,
  PAIRED_CLIENT_ENDPOINTS,
  pairedClientActor,
  pairedClientDomainScope,
  programDomainScope,
  programResponseStatus,
  readBearerToken,
  withProgramAuthSession,
} from "../program-route";

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
    expect(withProgramAuthSession("secret-keys", { id: "secret:one", authSessionId: "spoofed" }, "trusted")).toEqual({
      id: "secret:one",
      authSessionId: "trusted",
    });
    expect(withProgramAuthSession("background-tasks", { taskId: "one" }, "trusted")).toEqual({ taskId: "one" });
    expect(withProgramAuthSession("automation-studio", ["invalid"], "trusted")).toEqual(["invalid"]);
  });
});

describe("a paired client on the program route", () => {
  it("allowlists exactly the conversation endpoints and run listing and stopping, in Automation Studio only", () => {
    expect(PAIRED_CLIENT_ENDPOINTS).toEqual({
      "automation-studio": [
        "list-conversations",
        "open-conversation",
        "get-conversation",
        "append-turn",
        "answer-ask",
        "list-runtime-sessions",
        "cancel-runtime-session",
      ],
    });
    expect(Object.isFrozen(PAIRED_CLIENT_ENDPOINTS)).toBe(true);
    expect(Object.isFrozen(PAIRED_CLIENT_ENDPOINTS["automation-studio"])).toBe(true);
    expect(isPairedClientEndpoint("automation-studio", "append-turn")).toBe(true);
    expect(isPairedClientEndpoint("automation-studio", "delete-run-datasets")).toBe(false);
    expect(isPairedClientEndpoint("automation-studio", "run-runtime-session")).toBe(false);
    expect(isPairedClientEndpoint("identity-access", "append-turn")).toBe(false);
  });

  it("reaches only read and authoring endpoints, never destructive, credential-gated or unknown ones", () => {
    expect(isPairedClientClassification("read")).toBe(true);
    expect(isPairedClientClassification("authoring")).toBe(true);
    expect(isPairedClientClassification("destructive")).toBe(false);
    expect(isPairedClientClassification("destructive-ungated")).toBe(false);
    expect(isPairedClientClassification("program-gated")).toBe(false);
    expect(isPairedClientClassification(undefined)).toBe(false);
  });

  it("reads a bearer token and nothing else", () => {
    expect(readBearerToken("Bearer abc")).toBe("abc");
    expect(readBearerToken("  bearer   abc  ")).toBe("abc");
    expect(readBearerToken("Basic abc")).toBeNull();
    expect(readBearerToken("Bearer ")).toBeNull();
    expect(readBearerToken(null)).toBeNull();
  });

  const directory = {
    users: [
      { id: "user:owner", roleId: "role:admin", enabled: true },
      { id: "user:viewer", roleId: "role:viewer", enabled: true },
      { id: "user:off", roleId: "role:admin", enabled: false },
    ],
    roles: [
      { id: "role:admin", permissions: ["programs.read", "programs.write", "runtime.control", "identity.manage", "data.manage"] },
      { id: "role:viewer", permissions: ["programs.read"] },
    ],
  };

  it("acts as the approving person, with only the permissions the allowlist uses", () => {
    expect(pairedClientActor({ sessionId: "g1", operatorUserId: "user:owner" }, directory)).toEqual({
      sessionId: "client-gateway:g1",
      userId: "user:owner",
      roleId: "role:admin",
      permissions: ["programs.read", "programs.write", "runtime.control"],
    });
    expect(pairedClientActor({ sessionId: "g1", operatorUserId: "user:viewer" }, directory)?.permissions).toEqual(["programs.read"]);
  });

  it("acts as nobody when the approving person is disabled, gone, or never recorded", () => {
    expect(pairedClientActor({ sessionId: "g1", operatorUserId: "user:off" }, directory)).toBeNull();
    expect(pairedClientActor({ sessionId: "g1", operatorUserId: "user:gone" }, directory)).toBeNull();
    expect(pairedClientActor({ sessionId: "g1" }, directory)).toBeNull();
  });

  it("scopes the call to the domain the session declared, and refuses a URL naming another", () => {
    const session = { sessionId: "g1", metadata: { domainId: "web-automation" } };
    expect(pairedClientDomainScope("http://localhost/api/programs/automation-studio/get-conversation", session)).toEqual({ domainId: "web-automation" });
    expect(pairedClientDomainScope("http://localhost/x?domainId=web-automation", session)).toEqual({ domainId: "web-automation" });
    expect(pairedClientDomainScope("http://localhost/x?domainId=other", session)).toBeUndefined();
    expect(pairedClientDomainScope("http://localhost/x", { sessionId: "g1" })).toEqual({ domainId: null });
    expect(pairedClientDomainScope("http://localhost/x?domainId=web-automation", { sessionId: "g1" })).toBeUndefined();
  });
});
