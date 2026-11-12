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
} from "../program-route.ts";

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
    expect(withProgramAuthSession("deployment-sync", { targetId: "a", authSessionId: "spoofed" }, "trusted")).toEqual({ targetId: "a", authSessionId: "trusted" });
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
        "get-runtime-build-identity",
    "list-conversations",
        "open-conversation",
        "get-conversation",
        "append-turn",
        "answer-ask",
        "rename-conversation",
        "delete-conversation",
        "list-runtime-sessions",
        "cancel-runtime-session",
        "cancel-flow-bootstrap",
        "pause-runtime-session",
        "resume-runtime-session",
        "get-runtime-run-control",
        "list-flow-summaries",
        "list-flow-runs",
        "get-flow-run-detail",
        "list-flow-adaptations",
        "export-run-dataset",
        "get-task-attempt",
        "list-conversation-task-attempts",
        "list-flow-subflows",
        "list-project-tasks",
        "rename-task",
        "update-task-settings",
        "remove-task",
        "get-flow-metadata-detail",
        "update-flow-settings",
        "carry-on-task-attempt",
        "run-task-again",
        "run-runtime-session",
        "generate-recording-proposal",
        "review-recording-flow-proposal",
        "remove-recording-entry",
        "get-recording-capture-policy",
        "list-project-parts",
        "get-project-part",
        "save-project-part",
        "run-project-part",
      ],
      "secret-keys": ["snapshot"],
    });
    expect(Object.isFrozen(PAIRED_CLIENT_ENDPOINTS)).toBe(true);
    expect(Object.isFrozen(PAIRED_CLIENT_ENDPOINTS["automation-studio"])).toBe(true);
    expect(Object.isFrozen(PAIRED_CLIENT_ENDPOINTS["secret-keys"])).toBe(true);
    expect(isPairedClientEndpoint("automation-studio", "append-turn")).toBe(true);
    expect(isPairedClientEndpoint("automation-studio", "run-runtime-session")).toBe(true);
    expect(isPairedClientEndpoint("secret-keys", "snapshot")).toBe(true);
    // Take over, Hand back and reading the hold (t376).
    expect(isPairedClientEndpoint("automation-studio", "pause-runtime-session")).toBe(true);
    expect(isPairedClientEndpoint("automation-studio", "resume-runtime-session")).toBe(true);
    expect(isPairedClientEndpoint("automation-studio", "get-runtime-run-control")).toBe(true);
    // What a recording may capture and whether direct requests are allowed: Core's policy, read before capture (t728).
    expect(isPairedClientEndpoint("automation-studio", "get-recording-capture-policy")).toBe(true);
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
      // Core recognises a paired caller by this prefix and maps it to the person's
      // unlocked session (`AUTOMATION_STUDIO_PAIRED_CLIENT_SESSION_PREFIX`,
      // packages/fluxiq/.../runtime/conversations/commands/caller.ts). Change both or neither.
      sessionId: "client-gateway:g1",
      userId: "user:owner",
      roleId: "role:admin",
      permissions: ["programs.read", "programs.write", "runtime.control", "flows.write"],
      // Under the service profile the registry narrows a paired client by these permissions too.
      channel: "paired-client",
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

  it("carries an attempt on by its id and an amount only, never a Flow, a mode, a grant or a session", () => {
    const narrow = (payload: unknown) => narrowPairedClientRequest("automation-studio", "carry-on-task-attempt", payload);
    expect(narrow({ projectId: "p", attemptId: "attempt.1", addUsd: 0 })).toEqual({ ok: true, payload: { projectId: "p", attemptId: "attempt.1", addUsd: 0 } });
    for (const field of ["flowId", "authoringMode", "permittedConsequences", "authSessionId", "startLocation"]) {
      expect(narrow({ projectId: "p", attemptId: "attempt.1", addUsd: 1, [field]: "x" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: `A paired client's carry-on may not carry ${field}.` });
    }
    expect(narrow(undefined)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
  });

  it("runs a task again by its project and task only, never a Flow, a mode, a grant, a page or a session", () => {
    const narrow = (payload: unknown) => narrowPairedClientRequest("automation-studio", "run-task-again", payload);
    expect(narrow({ projectId: "p", taskId: "task.1" })).toEqual({ ok: true, payload: { projectId: "p", taskId: "task.1" } });
    for (const field of ["flowId", "authoringMode", "permittedConsequences", "authSessionId", "startLocation", "attemptId"]) {
      expect(narrow({ projectId: "p", taskId: "task.1", [field]: "x" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: `A paired client's Run again may not carry ${field}.` });
    }
    expect(narrow(undefined)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
  });

  it("renames or forgets a task by project, task and name only, so nothing else of Core can be reached through it", () => {
    const rename = (payload: unknown) => narrowPairedClientRequest("automation-studio", "rename-task", payload);
    const remove = (payload: unknown) => narrowPairedClientRequest("automation-studio", "remove-task", payload);
    expect(rename({ projectId: "p", taskId: "t", title: "Loans" })).toEqual({ ok: true, payload: { projectId: "p", taskId: "t", title: "Loans" } });
    expect(remove({ projectId: "p", taskId: "t" })).toEqual({ ok: true, payload: { projectId: "p", taskId: "t" } });
    expect(rename({ projectId: "p", taskId: "t", title: "x", flowId: "f" })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(remove({ projectId: "p", taskId: "t", title: "x" })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(remove(undefined)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
  });

  it("sets a task's humanness by project, task and level only", () => {
    const settings = (payload: unknown) => narrowPairedClientRequest("automation-studio", "update-task-settings", payload);
    expect(settings({ projectId: "p", taskId: "t", humanness: 40 })).toEqual({ ok: true, payload: { projectId: "p", taskId: "t", humanness: 40 } });
    expect(settings({ projectId: "p", taskId: "t", humanness: null })).toEqual({ ok: true, payload: { projectId: "p", taskId: "t", humanness: null } });
    expect(settings({ projectId: "p", taskId: "t", humanness: 40, flowId: "f" })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(settings({ projectId: "p", taskId: "t", title: "x" })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(settings(undefined)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
  });

  describe("a Flow's humanness (t898)", () => {
    const settings = (payload: unknown) => narrowPairedClientRequest("automation-studio", "update-flow-settings", payload);
    const refusal = (error: string) => ({ ok: false, errorCode: "authorization.forbidden", error: `A paired client's Flow settings change ${error}` });
    const change = (flow: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ projectId: "p", flowId: "flow.one", flow, ...extra });

    it("reads a Flow's settings detail, and changes nothing else of a Flow", () => {
      expect(isPairedClientEndpoint("automation-studio", "get-flow-metadata-detail")).toBe(true);
      expect(isPairedClientEndpoint("automation-studio", "update-flow-settings")).toBe(true);
      for (const endpoint of ["get-flow", "save-flow", "apply-graph-patch", "create-flow", "publish-flow", "delete-flow"]) {
        expect(isPairedClientEndpoint("automation-studio", endpoint), endpoint).toBe(false);
      }
      expect(narrowPairedClientRequest("automation-studio", "get-flow-metadata-detail", { projectId: "p", flowId: "flow.one" })).toEqual({ ok: true, payload: { projectId: "p", flowId: "flow.one" } });
    });

    it("sets a level and clears it with null, with or without the Flow's id beside it", () => {
      expect(settings(change({ metadata: { humanness: 40 } }))).toEqual({ ok: true, payload: change({ metadata: { humanness: 40 } }) });
      expect(settings(change({ flowId: "flow.one", metadata: { humanness: 40 } }))).toEqual({ ok: true, payload: change({ flowId: "flow.one", metadata: { humanness: 40 } }) });
      expect(settings(change({ metadata: { humanness: null } }))).toEqual({ ok: true, payload: change({ metadata: { humanness: null } }) });
      // Bounds are the handler's (humannessSchema): an out-of-range number passes here and is refused there.
      expect(settings(change({ metadata: { humanness: 101 } }))).toMatchObject({ ok: true });
    });

    it.each([
      ["flow.metadata.flowSizeSettings", change({ metadata: { humanness: 40, flowSizeSettings: { maxNodesPerSubflow: 500 } } })],
      ["flow.metadata.llmExecutionSettings", change({ metadata: { humanness: 40, llmExecutionSettings: {} } })],
      ["flow.metadata.trainingModeSettings", change({ metadata: { humanness: 40, trainingModeSettings: {} } })],
      ["flow.metadata.adaptationMode", change({ metadata: { humanness: 40, adaptationMode: "fully_adaptive" } })],
      ["flow.name", change({ name: "Renamed", metadata: { humanness: 40 } })],
      ["flow.description", change({ description: "d", metadata: { humanness: 40 } })],
      ["flow.visibility", change({ visibility: "public", metadata: { humanness: 40 } })],
      ["flow.interface", change({ interface: {}, metadata: { humanness: 40 } })],
      ["flow.executionDefaults", change({ executionDefaults: {}, metadata: { humanness: 40 } })],
      ["flow.source", change({ source: { mode: "code" }, metadata: { humanness: 40 } })],
      ["expectedUpdatedAt", change({ metadata: { humanness: 40 } }, { expectedUpdatedAt: 1 })],
      ["authSessionId", change({ metadata: { humanness: 40 } }, { authSessionId: "session" })],
      ["anything", change({ metadata: { humanness: 40 } }, { anything: true })],
      ["__proto__", JSON.parse('{"projectId":"p","flowId":"flow.one","flow":{"metadata":{"humanness":40}},"__proto__":{"name":"x"}}')],
      ["flow.metadata.__proto__", JSON.parse('{"projectId":"p","flowId":"flow.one","flow":{"metadata":{"humanness":40,"__proto__":{"budgetUsd":9}}}}')],
    ])("refuses %s by its path", (field, payload) => {
      expect(settings(payload)).toEqual(refusal(`may not carry ${field}.`));
    });

    it("refuses a change that carries no level, names another Flow, or names its project or Flow by anything but a string", () => {
      expect(settings(change({ metadata: {} }))).toEqual(refusal("must carry flow.metadata.humanness."));
      expect(settings(change({}))).toEqual(refusal("must carry flow.metadata.humanness."));
      expect(settings(change({ metadata: [40] }))).toEqual(refusal("must carry flow.metadata.humanness."));
      expect(settings({ projectId: "p", flowId: "flow.one" })).toEqual(refusal("must carry flow.metadata.humanness."));
      expect(settings({ projectId: "p", flowId: "flow.one", flow: [] })).toEqual(refusal("must carry flow.metadata.humanness."));
      expect(settings(change({ flowId: "flow.other", metadata: { humanness: 40 } }))).toEqual(refusal("must name the same Flow in flow.flowId as in flowId."));
      expect(settings(change({ flowId: null, metadata: { humanness: 40 } }))).toEqual(refusal("must name the same Flow in flow.flowId as in flowId."));
      expect(settings({ projectId: "p", flow: { flowId: "flow.one", metadata: { humanness: 40 } } })).toEqual(refusal("must name its Flow by a string flowId."));
      expect(settings({ projectId: 7, flowId: "flow.one", flow: { metadata: { humanness: 40 } } })).toEqual(refusal("must name its project by a string projectId."));
      for (const humanness of ["50", undefined, true, {}]) {
        expect(settings(change({ metadata: { humanness } }))).toEqual(refusal("must carry flow.metadata.humanness as a number, or null to clear it."));
      }
      expect(settings(undefined)).toEqual(refusal("must name a project and a Flow."));
      expect(settings([])).toEqual(refusal("must name a project and a Flow."));
    });

    it("never names a refused field's value, and hands on only the accepted fields", () => {
      const refused = settings(change({ name: "do-not-echo", metadata: { humanness: 40 } }));
      expect(JSON.stringify(refused)).not.toContain("do-not-echo");
      const mismatched = settings(change({ flowId: "flow.do-not-echo", metadata: { humanness: 40 } }));
      expect(JSON.stringify(mismatched)).not.toContain("do-not-echo");
      const accepted = settings(change({ metadata: { humanness: 40 } }));
      expect(accepted.ok && Object.keys(accepted.payload as object)).toEqual(["projectId", "flowId", "flow"]);
    });

    describe("reading it", () => {
      const read = (payload: unknown) => narrowPairedClientRequest("automation-studio", "get-flow-metadata-detail", payload);
      const readRefusal = (error: string) => ({ ok: false, errorCode: "authorization.forbidden", error: `A paired client's Flow settings read ${error}` });
      const project = (response: { ok: boolean; payload?: unknown; error?: string; errorCode?: string }) => projectPairedClientResponse("automation-studio", "get-flow-metadata-detail", response);
      const detail = (metadata: Record<string, unknown>) => ({
        flowId: "flow.one", name: "Pay the invoices", description: "Every Monday", visibility: "project", status: "draft", graphRevision: 4,
        settings: { interventionMode: "fully_adaptive", executionDefaults: { timeoutMs: 9000 }, training: {}, adaptation: { policyId: "policy.x" }, llm: { provider: "host", model: "model-do-not-leak", secretKeyId: "secret:do-not-leak", execution: { budgetUsd: 7 } }, safety: {} },
        inputs: [{ portId: "account", name: "account", required: true, defaultValue: "ACCT-do-not-leak", description: "" }],
        outputs: [{ portId: "total", name: "total", required: false, defaultValue: null, description: "" }],
        variables: [{ variableId: "token", name: "token", initialValue: "VAR-do-not-leak", description: "" }],
        errors: [{ errorId: "e", code: "e", description: "", metadata: { note: "err-do-not-leak" } }],
        flowSizeSettings: { maxNodesPerSubflow: 150 },
        metadata,
      });

      it("takes exactly a project and a Flow, both strings, and hands on only those", () => {
        expect(read({ projectId: "p", flowId: "flow.one" })).toEqual({ ok: true, payload: { projectId: "p", flowId: "flow.one" } });
        for (const field of ["flow", "inputs", "variables", "name", "metadata", "includeSettings", "anything"]) {
          expect(read({ projectId: "p", flowId: "flow.one", [field]: "x" }), field).toEqual(readRefusal(`may not carry ${field}.`));
        }
        expect(read(JSON.parse('{"projectId":"p","flowId":"flow.one","__proto__":{"x":1}}'))).toEqual(readRefusal("may not carry __proto__."));
        expect(read({ projectId: "p" })).toEqual(readRefusal("must name its Flow by a string flowId."));
        expect(read({ projectId: "p", flowId: 7 })).toEqual(readRefusal("must name its Flow by a string flowId."));
        expect(read({ flowId: "flow.one" })).toEqual(readRefusal("must name its project by a string projectId."));
        expect(read({ projectId: "", flowId: "flow.one" })).toEqual(readRefusal("must name its project by a string projectId."));
        // A GET carries no body, so a token's read is refused there rather than handed an empty project.
        expect(read(undefined)).toEqual(readRefusal("must name a project and a Flow."));
        expect(read([])).toEqual(readRefusal("must name a project and a Flow."));
        expect(JSON.stringify(read({ projectId: "p", flowId: "flow.one", name: "do-not-echo" }))).not.toContain("do-not-echo");
      });

      it("answers the Flow's id and its humanness, and nothing else of the detail", () => {
        const projected = project({ ok: true, payload: { flow: detail({ humanness: 40, llmModel: "model-do-not-leak", flowSizeSettings: { maxNodesPerSubflow: 150 }, trainingModeSettings: { resultCheck: { authorization: "auth-do-not-leak" } } }) } });
        expect(projected).toEqual({ ok: true, payload: { flow: { flowId: "flow.one", metadata: { humanness: 40 } } } });
        for (const leaked of ["Pay the invoices", "do-not-leak", "timeoutMs", "budgetUsd", "maxNodesPerSubflow", "settings", "inputs", "variables"]) {
          expect(JSON.stringify(projected), leaked).not.toContain(leaked);
        }
      });

      it("answers empty metadata for a Flow with no level, or a level that is not a number", () => {
        expect(project({ ok: true, payload: { flow: detail({ llmModel: "m" }) } })).toEqual({ ok: true, payload: { flow: { flowId: "flow.one", metadata: {} } } });
        const { metadata: _metadata, ...noMetadata } = detail({});
        expect(project({ ok: true, payload: { flow: noMetadata } })).toEqual({ ok: true, payload: { flow: { flowId: "flow.one", metadata: {} } } });
        for (const humanness of ["40", null, { level: 40 }, true]) {
          expect(project({ ok: true, payload: { flow: detail({ humanness }) } })).toEqual({ ok: true, payload: { flow: { flowId: "flow.one", metadata: {} } } });
        }
        expect(project({ ok: true, payload: { flow: detail({ humanness: 0 }) } })).toEqual({ ok: true, payload: { flow: { flowId: "flow.one", metadata: { humanness: 0 } } } });
      });

      it("answers a Flow the detail does not describe as null, and a refusal as its sentence and code alone", () => {
        for (const payload of [{ flow: null }, {}, undefined, { flow: [] }, { flow: { flowId: 7, metadata: { humanness: 40 } } }]) {
          expect(project({ ok: true, payload })).toEqual({ ok: true, payload: { flow: null } });
        }
        expect(project({ ok: false, error: "Flow not found.", errorCode: "flow.not_found", payload: { flow: detail({ humanness: 40 }) } })).toEqual({ ok: false, error: "Flow not found.", errorCode: "flow.not_found" });
        expect(project({ ok: false })).toEqual({ ok: false });
      });

      it("rebuilds the answer, so a top-level field beside the payload is not handed on", () => {
        const response = { ok: true, payload: { flow: detail({ humanness: 40 }), extra: "payload-do-not-leak" }, extra: "top-do-not-leak" } as { ok: boolean; payload?: unknown };
        expect(project(response)).toEqual({ ok: true, payload: { flow: { flowId: "flow.one", metadata: { humanness: 40 } } } });
      });

      it("cuts the answer to setting the level the same way, since it is the same detail read back", () => {
        const response = { ok: true, payload: { flow: detail({ humanness: 40, llmModel: "model-do-not-leak" }) } };
        expect(projectPairedClientResponse("automation-studio", "update-flow-settings", response)).toEqual({ ok: true, payload: { flow: { flowId: "flow.one", metadata: { humanness: 40 } } } });
      });

      it("projects the endpoint however its name is spelled, as the registry matches it", () => {
        const response = { ok: true, payload: { flow: detail({ humanness: 40 }) } };
        expect(projectPairedClientResponse(" Automation-Studio ", " GET-FLOW-METADATA-DETAIL ", response)).toEqual({ ok: true, payload: { flow: { flowId: "flow.one", metadata: { humanness: 40 } } } });
        expect(narrowPairedClientRequest(" Automation-Studio ", " GET-FLOW-METADATA-DETAIL ", { projectId: "p", flowId: "f", name: "x" })).toMatchObject({ ok: false });
      });
    });

    it("leaves a cookie caller's settings change as it was: narrowing is the token's alone", () => {
      // The route narrows only a paired client's body (`handle-program-request.ts`, narrowPost); a person's goes to the handler as sent.
      expect(withProgramAuthSession("automation-studio", change({ name: "Renamed", metadata: { flowSizeSettings: {} } }), "trusted")).toEqual(change({ name: "Renamed", metadata: { flowSizeSettings: {} } }, { authSessionId: "trusted" }));
    });
  });

  it("renames or deletes a conversation by project, thread and name only", () => {
    const rename = (payload: unknown) => narrowPairedClientRequest("automation-studio", "rename-conversation", payload);
    const remove = (payload: unknown) => narrowPairedClientRequest("automation-studio", "delete-conversation", payload);
    expect(rename({ projectId: "p", conversationId: "conversation.1", title: "Loans" })).toEqual({ ok: true, payload: { projectId: "p", conversationId: "conversation.1", title: "Loans" } });
    expect(rename({ conversationId: "conversation.1", title: "Loans" })).toMatchObject({ ok: true });
    expect(remove({ projectId: "p", conversationId: "conversation.1" })).toEqual({ ok: true, payload: { projectId: "p", conversationId: "conversation.1" } });
    expect(rename({ projectId: "p", conversationId: "c", title: "x", subjectId: "s" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's change to a conversation may not carry subjectId." });
    expect(remove({ projectId: "p", conversationId: "c", title: "x" })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(remove({ projectId: "p", conversationId: "c", authSessionId: "s" })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(remove(undefined)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(isPairedClientEndpoint("automation-studio", "rename-conversation")).toBe(true);
    expect(isPairedClientEndpoint("automation-studio", "delete-conversation")).toBe(true);
  });

  it("runs only a saved Flow by id, never with inputs, an inline Flow or a side-effect authorization, and with no LLM unless it names the repair intent", () => {
    const narrow = (payload: unknown) => narrowPairedClientRequest("automation-studio", "run-runtime-session", payload);
    expect(narrow({ projectId: "p", flowId: "flow.one" })).toEqual({ ok: true, payload: { projectId: "p", flowId: "flow.one", adaptiveMode: "no_llm_intervention" } });
    expect(narrow({ projectId: "p", flowId: "flow.one", adaptiveMode: "deterministic" })).toEqual({ ok: true, payload: { projectId: "p", flowId: "flow.one", adaptiveMode: "deterministic" } });
    expect(narrow({ projectId: "p", flowId: "flow.one", adaptiveMode: "no_llm_intervention", authorizedExternalSideEffects: false })).toMatchObject({ ok: true });
    expect(narrow({ projectId: "p" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run must name a saved Flow by a string flowId." });
    expect(narrow({ projectId: "p", flowId: 7 })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(narrow(undefined)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    for (const field of ["flow", "permittedConsequences", "dryRunLlm", "useReusableContext", "inputs"]) {
      expect(narrow({ flowId: "flow.one", [field]: "secret-value" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: `A paired client's run may not carry ${field}.` });
    }
    expect(narrow({ flowId: "flow.one", authorizedExternalSideEffects: true })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run may not carry authorizedExternalSideEffects." });
    for (const adaptiveMode of ["fully_adaptive", "manual_approval", "default", "", 1]) {
      expect(narrow({ flowId: "flow.one", adaptiveMode })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run may not carry an adaptiveMode that lets it invoke an LLM." });
    }
  });

  // The extension's Automations Run (t267): a saved Flow the person runs may be
  // repaired with their own key when its page changed. That one intent, under
  // the Flow's own mode: no mode is pinned, and none may be named beside it.
  it("refuses a run naming authorizedDomainIds, whatever it names, because it widens the run beyond the bound domain", () => {
    const narrow = (payload: unknown) => narrowPairedClientRequest("automation-studio", "run-runtime-session", payload);
    for (const authorizedDomainIds of [["desktop-automation"], ["web-automation"], [], null]) {
      expect(narrow({ projectId: "p", flowId: "flow.one", authorizedDomainIds })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run may not carry authorizedDomainIds." });
    }
  });

  it("refuses a run naming whose key pays and acts, or whose preferences it reads, with or without an intent: both come from the authenticated caller alone", () => {
    const narrow = (payload: unknown) => narrowPairedClientRequest("automation-studio", "run-runtime-session", payload);
    const other = { actorUserId: "user.other", actorSessionId: "session.other", intent: "explore_and_adapt" };
    for (const intent of [{}, { runIntent: "explore_and_adapt" }]) {
      expect(narrow({ projectId: "p", flowId: "flow.one", ...intent, llmExecution: other })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run may not carry llmExecution." });
      expect(narrow({ projectId: "p", flowId: "flow.one", ...intent, personUserId: "user.other" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run may not carry personUserId." });
    }
  });

  it("lets a paired client's run carry the explore_and_adapt intent, alone, under the Flow's own mode", () => {
    const narrow = (payload: unknown) => narrowPairedClientRequest("automation-studio", "run-runtime-session", payload);
    expect(narrow({ projectId: "p", flowId: "flow.one", runIntent: "explore_and_adapt" })).toEqual({ ok: true, payload: { projectId: "p", flowId: "flow.one", runIntent: "explore_and_adapt" } });
    expect(narrow({ projectId: "p", flowId: "flow.one", runIntent: "explore_and_adapt", authorizedExternalSideEffects: false })).toMatchObject({ ok: true });
    for (const runIntent of ["diagnose_and_adapt", "diagnosis_only", "build_and_adapt", "verify_result", "", 1, null]) {
      expect(narrow({ flowId: "flow.one", runIntent })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run may carry only the explore_and_adapt intent." });
    }
    for (const adaptiveMode of ["no_llm_intervention", "deterministic", "fully_adaptive", "manual_approval"]) {
      expect(narrow({ flowId: "flow.one", runIntent: "explore_and_adapt", adaptiveMode })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's run that names an intent may not also carry adaptiveMode." });
    }
    for (const field of ["flow", "permittedConsequences", "dryRunLlm", "useReusableContext", "inputs"]) {
      expect(narrow({ flowId: "flow.one", runIntent: "explore_and_adapt", [field]: "secret-value" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: `A paired client's run may not carry ${field}.` });
    }
    expect(narrow({ flowId: "flow.one", runIntent: "explore_and_adapt", authorizedExternalSideEffects: true })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
  });

  it("never names a refused field's value", () => {
    const refused = narrowPairedClientRequest("automation-studio", "run-runtime-session", { flowId: "flow.one", runIntent: "run-intent:do-not-echo" });
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

  it("saves a part with exactly its five fields and names any other a token carries", () => {
    const narrow = (payload: unknown) => narrowPairedClientRequest("automation-studio", "save-project-part", payload);
    expect(narrow({ projectId: "p", flowId: "f", subflowId: "s", name: "N", purpose: "P" })).toEqual({ ok: true, payload: { projectId: "p", flowId: "f", subflowId: "s", name: "N", purpose: "P" } });
    expect(narrow({ projectId: "p", flowId: "f", subflowId: "s" })).toMatchObject({ ok: true });
    expect(narrow({ projectId: "p", flowId: "f", subflowId: "s", explicit: false })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's save may not carry explicit." });
    expect(narrow({ projectId: "p", flowId: "f", subflowId: "s", partId: "part.x" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: "A paired client's save may not carry partId." });
    expect(isPairedClientEndpoint("automation-studio", "list-project-parts")).toBe(true);
    expect(isPairedClientEndpoint("automation-studio", "get-project-part")).toBe(true);
  });

  it("runs a part with exactly its seven fields and names any other a token carries", () => {
    const narrow = (payload: unknown) => narrowPairedClientRequest("automation-studio", "run-project-part", payload);
    const whole = { projectId: "p", partId: "part.a", version: 2, inputs: { query: "shoes" }, permittedConsequences: ["create_new"], acknowledgedRepeat: true, newRunId: "id" };
    expect(narrow(whole)).toEqual({ ok: true, payload: whole });
    expect(narrow({ projectId: "p", partId: "part.a" })).toMatchObject({ ok: true });
    for (const field of ["caller", "permission", "flowId", "runIntent", "authorizedDomainIds"]) {
      expect(narrow({ projectId: "p", partId: "part.a", [field]: "x" })).toEqual({ ok: false, errorCode: "authorization.forbidden", error: `A paired client's part run may not carry ${field}.` });
    }
    expect(isPairedClientEndpoint("automation-studio", "run-project-part")).toBe(true);
  });

  it("passes every other endpoint's body unchanged", () => {
    const payload = { projectId: "p", flowId: "f", inputs: { a: 1 } };
    expect(narrowPairedClientRequest("automation-studio", "list-flow-runs", payload)).toEqual({ ok: true, payload });
    expect(narrowPairedClientRequest("secret-keys", "snapshot", undefined)).toEqual({ ok: true, payload: undefined });
  });

  it("keeps readiness unknown when the snapshot supplied no list", () => {
    for (const payload of [undefined, null, {}, { keys: null }, { keys: "unavailable" }]) {
      expect(projectPairedClientResponse("secret-keys", "snapshot", { ok: true, payload })).toEqual({ ok: true, payload: {} });
    }
    expect(projectPairedClientResponse("secret-keys", "snapshot", { ok: true, payload: { keys: [] } })).toEqual({ ok: true, payload: { keys: [] } });
  });

  it("hands a paired client what starts its own unlock, and nothing else new", () => {
    const projected = projectPairedClientResponse("secret-keys", "snapshot", { ok: true, payload: { unlockTicket: "paired-client:one.part", lockedClients: [], keys: [] } });
    expect(projected).toEqual({ ok: true, payload: { unlockTicket: "paired-client:one.part", keys: [] } });
  });

  it("tells a paired client whether its person's key opens for it, and never which browsers are locked", () => {
    const response = { ok: true, payload: { lockedClients: [{ holderId: "paired-client:one", label: "Chrome on Windows" }], keys: [{ id: "secret:1", name: "Mine", kind: "llm", provider: "anthropic", enabled: true, unlocked: false, lockedBecause: "signed_out" }, { id: "secret:2", kind: "llm", enabled: true }] } };
    expect(projectPairedClientResponse("secret-keys", "snapshot", response)).toEqual({ ok: true, payload: { keys: [{ kind: "llm", provider: "anthropic", enabled: true, unlocked: false, lockedBecause: "signed_out" }, { kind: "llm", provider: null, enabled: true }] } });
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
