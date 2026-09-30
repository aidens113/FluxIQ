import { describe, expect, it } from "vitest";
import {
  isPairedClientClassification,
  isPairedClientEndpoint,
  narrowPairedClientRequest,
  PAIRED_CLIENT_ENDPOINTS,
  pairedClientActor,
  pairedClientDomainScope,
  programDomainScope,
  programResponseStatus,
  projectPairedClientResponse,
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
  it("allowlists exactly the conversation, run and Simple Mode endpoints, and the secret-keys snapshot", () => {
    expect(PAIRED_CLIENT_ENDPOINTS).toEqual({
      "automation-studio": [
        "list-conversations",
        "open-conversation",
        "get-conversation",
        "append-turn",
        "answer-ask",
        "list-runtime-sessions",
        "cancel-runtime-session",
        "list-flow-summaries",
        "list-flow-runs",
        "get-flow-run-detail",
        "list-flow-adaptations",
        "export-run-dataset",
        "run-runtime-session",
        "generate-recording-proposal",
        "review-recording-flow-proposal",
        "remove-recording-entry",
      ],
      "secret-keys": ["snapshot"],
    });
    expect(Object.isFrozen(PAIRED_CLIENT_ENDPOINTS)).toBe(true);
    expect(Object.isFrozen(PAIRED_CLIENT_ENDPOINTS["automation-studio"])).toBe(true);
    expect(Object.isFrozen(PAIRED_CLIENT_ENDPOINTS["secret-keys"])).toBe(true);
    expect(isPairedClientEndpoint("automation-studio", "append-turn")).toBe(true);
    expect(isPairedClientEndpoint("automation-studio", "run-runtime-session")).toBe(true);
    expect(isPairedClientEndpoint("secret-keys", "snapshot")).toBe(true);
    expect(isPairedClientEndpoint("automation-studio", "delete-run-datasets")).toBe(false);
    expect(isPairedClientEndpoint("automation-studio", "delete-recording")).toBe(false);
    expect(isPairedClientEndpoint("automation-studio", "review-flow-adaptation")).toBe(false);
    expect(isPairedClientEndpoint("automation-studio", "issue-llm-execution-grant")).toBe(false);
    expect(isPairedClientEndpoint("secret-keys", "reveal-key")).toBe(false);
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
      { id: "role:admin", permissions: ["programs.read", "programs.write", "runtime.control", "flows.write", "identity.manage", "data.manage", "secrets.manage"] },
      { id: "role:viewer", permissions: ["programs.read"] },
    ],
  };

  it("acts as the approving person, with only the permissions the allowlist uses", () => {
    expect(pairedClientActor({ sessionId: "g1", operatorUserId: "user:owner" }, directory)).toEqual({
      sessionId: "client-gateway:g1",
      userId: "user:owner",
      roleId: "role:admin",
      permissions: ["programs.read", "programs.write", "runtime.control", "flows.write"],
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

  it("runs only a saved Flow by id, never with an LLM, inputs, an inline Flow or a side-effect authorization", () => {
    const narrow = (payload: unknown) => narrowPairedClientRequest("automation-studio", "run-runtime-session", payload);
    expect(narrow({ projectId: "p", flowId: "flow.one" })).toEqual({ ok: true, payload: { projectId: "p", flowId: "flow.one", adaptiveMode: "no_llm_intervention" } });
    expect(narrow({ projectId: "p", flowId: "flow.one", adaptiveMode: "deterministic" })).toEqual({ ok: true, payload: { projectId: "p", flowId: "flow.one", adaptiveMode: "deterministic" } });
    expect(narrow({ projectId: "p", flowId: "flow.one", adaptiveMode: "no_llm_intervention", authorizedExternalSideEffects: false })).toMatchObject({ ok: true });
    expect(narrow({ projectId: "p" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run must name a saved Flow by a string flowId." });
    expect(narrow({ projectId: "p", flowId: 7 })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(narrow(undefined)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    for (const field of ["flow", "llmExecutionGrantId", "runIntent", "dryRunLlm", "useReusableContext", "inputs"]) {
      expect(narrow({ flowId: "flow.one", [field]: "secret-value" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: `A paired client's run may not carry ${field}.` });
    }
    expect(narrow({ flowId: "flow.one", authorizedExternalSideEffects: true })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run may not carry authorizedExternalSideEffects." });
    for (const adaptiveMode of ["fully_adaptive", "manual_approval", "default", "", 1]) {
      expect(narrow({ flowId: "flow.one", adaptiveMode })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run may not carry an adaptiveMode that lets it invoke an LLM." });
    }
  });

  it("never names a refused field's value", () => {
    const refused = narrowPairedClientRequest("automation-studio", "run-runtime-session", { flowId: "flow.one", llmExecutionGrantId: "llm-grant:do-not-echo" });
    expect(JSON.stringify(refused)).not.toContain("do-not-echo");
  });

  it("generates a recording proposal with the direct mapper only", () => {
    const narrow = (payload: unknown) => narrowPairedClientRequest("automation-studio", "generate-recording-proposal", payload);
    expect(narrow({ projectId: "p", recordingId: "r" })).toEqual({ ok: true, payload: { projectId: "p", recordingId: "r" } });
    expect(narrow({ projectId: "p", recordingId: "r", mode: "direct", title: "T" })).toMatchObject({ ok: true });
    expect(narrow({ recordingId: "r", mode: "llm_assisted" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's proposal may not carry mode llm_assisted." });
    expect(narrow({ recordingId: "r", instructions: "x" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's proposal may not carry instructions." });
    expect(narrow({ recordingId: "r", constraints: "x" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's proposal may not carry constraints." });
  });

  it("reviews a recording proposal by approving it, as the paired person, with no policy override", () => {
    const narrow = (payload: unknown) => narrowPairedClientRequest("automation-studio", "review-recording-flow-proposal", payload);
    expect(narrow({ projectId: "p", proposalId: "x" })).toMatchObject({ ok: true });
    expect(narrow({ projectId: "p", proposalId: "x", decision: "approved", notes: "n" })).toMatchObject({ ok: true });
    expect(narrow({ proposalId: "x", decision: "rejected" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's review may only carry decision approved." });
    expect(narrow({ proposalId: "x", reviewerId: "user:else" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's review may not carry reviewerId." });
    expect(narrow({ proposalId: "x", destination: { flowId: "flow.existing" } })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's review may not carry destination." });
    expect(narrow({ proposalId: "x", policyOverride: {} })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's review may not carry policyOverride." });
  });

  it("passes every other endpoint's body unchanged", () => {
    const payload = { projectId: "p", flowId: "f", inputs: { a: 1 } };
    expect(narrowPairedClientRequest("automation-studio", "list-flow-runs", payload)).toEqual({ ok: true, payload });
    expect(narrowPairedClientRequest("secret-keys", "snapshot", undefined)).toEqual({ ok: true, payload: undefined });
  });

  it("answers the secret-keys snapshot with kind, provider and enabled only", () => {
    const response = {
      ok: true,
      payload: {
        keys: [
          { id: "secret:1", name: "Work OpenAI", kind: "llm", provider: "openai", scope: "global", description: "d", enabled: true, createdAtMs: 1, updatedAtMs: 2, lastRotatedAtMs: 2, metadata: { fingerprint: "fp", hint: "sk-...9" } },
          { id: "secret:2", name: "Custom", kind: "custom", scope: "flow", scopeRef: "flow.one", enabled: false, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1 },
        ],
      },
    };
    const projected = projectPairedClientResponse("secret-keys", "snapshot", response);
    expect(projected).toEqual({ ok: true, payload: { keys: [{ kind: "llm", provider: "openai", enabled: true }, { kind: "custom", provider: null, enabled: false }] } });
    for (const leaked of ["secret:1", "Work OpenAI", "fp", "sk-...9", "flow.one"]) expect(JSON.stringify(projected)).not.toContain(leaked);
    expect(projectPairedClientResponse("secret-keys", "snapshot", { ok: false, error: "x" })).toEqual({ ok: false, error: "x" });
    expect(projectPairedClientResponse("automation-studio", "list-flow-runs", response)).toBe(response);
  });
});
