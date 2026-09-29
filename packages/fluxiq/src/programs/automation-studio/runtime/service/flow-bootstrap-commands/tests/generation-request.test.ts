// Which grants a build may start under. A caller's request is held to the
// purposes argued for it; the run's own repair of a refuted answer is held to
// none, because repairing is the automation's own work and the person's
// instruction already granted it.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES } from "../../../llm/index.ts";
import { readAutomationStudioFlowBootstrapGenerationRequest } from "../generation-request.ts";

const DIGEST = "a".repeat(64);

function grant(purpose: string): Record<string, unknown> {
  return { grantId: "grant.1", actorUserId: "user.1", actorSessionId: "session.1", purpose, executionDigest: DIGEST, settingsRevision: 3 };
}

function input(mode: "create" | "extend", purpose: string): Record<string, unknown> {
  return { projectId: "project-1", flowId: "flow-1", mode, evidenceGuided: true, executionGrant: grant(purpose) };
}

function read(mode: "create" | "extend", purpose: string, runOwnedRepair?: boolean) {
  const unsafe = input(mode, purpose);
  return readAutomationStudioFlowBootstrapGenerationRequest(unsafe, unsafe.executionGrant as Record<string, unknown>, runOwnedRepair === undefined ? {} : { runOwnedRepair });
}

describe("the run's own repair", () => {
  it.each(AUTOMATION_STUDIO_RUNTIME_SESSION_GRANT_PURPOSES)("extends under a %s grant, keeping that purpose", (purpose) => {
    expect(read("extend", purpose, true)).toMatchObject({ mode: "extend", executionGrant: { purpose, executionDigest: DIGEST, settingsRevision: 3 } });
  });

  it("still refuses a value that is no purpose at all", () => {
    expect(() => read("extend", "anything_goes", true)).toThrow(/build_and_adapt/);
  });

  it("never widens a create, which is the person's own act", () => {
    expect(() => read("create", "diagnosis_only", true)).toThrow(/build_and_adapt/);
  });
});

describe("a caller's request", () => {
  it("is held to the purposes argued for it, exactly as before", () => {
    expect(read("create", "build_and_adapt")).toMatchObject({ executionGrant: { purpose: "build_and_adapt" } });
    expect(read("extend", "explore_and_adapt")).toMatchObject({ executionGrant: { purpose: "explore_and_adapt" } });
    for (const purpose of ["diagnosis_only", "diagnose_and_adapt", "verify_result"]) {
      expect(() => read("extend", purpose), purpose).toThrow(/build_and_adapt/);
    }
    expect(() => read("create", "explore_and_adapt")).toThrow(/build_and_adapt/);
  });
});
