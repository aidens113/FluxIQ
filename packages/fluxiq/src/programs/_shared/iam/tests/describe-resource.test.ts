import { describe, expect, it } from "vitest";
import { parseFluxIQResourceName } from "@fluxiq/contracts/iam";
import { describeProgramResource } from "../describe-resource.ts";
import { programIamIdSegment } from "../id-segment.ts";
import type { ProgramResourceRef } from "../types.ts";

const scope = { workspaceId: "ws-1", programId: "database-manager", actorUserId: "alice" };

describe("programIamIdSegment", () => {
  it("keeps a plain segment, encodes anything else, and stands a sentinel for a missing id", () => {
    expect(programIamIdSegment("project-1")).toEqual({ raw: "project-1", segment: "project-1" });
    expect(programIamIdSegment("a/b")).toEqual({ raw: "a/b", segment: "~612f62" });
    expect(programIamIdSegment("~612f62")).toEqual({ raw: "~612f62", segment: "~7e363132663632" });
    expect(programIamIdSegment("x".repeat(128)).segment).toBe("x".repeat(128));
    expect(programIamIdSegment("/".repeat(64)).segment).toMatch(/^~~[0-9a-f]{64}$/u);
    for (const missing of [undefined, null, "", 7, {}]) expect(programIamIdSegment(missing)).toEqual({ raw: null, segment: "~" });
  });
});

describe("describeProgramResource", () => {
  it("names each kind by its FRN, every one of which parses", () => {
    const frns = [
      describeProgramResource({ kind: "workspace" }, scope),
      describeProgramResource({ kind: "program" }, scope),
      describeProgramResource({ kind: "project", projectId: "p1" }, scope),
      describeProgramResource({ kind: "project-child", projectId: "p1", child: "run", childId: "r/1" }, scope),
      describeProgramResource({ kind: "schedule", scheduleId: "s1" }, scope),
      describeProgramResource({ kind: "key", keyId: "k1" }, scope),
      describeProgramResource({ kind: "client", clientId: "b1" }, scope),
      describeProgramResource({ kind: "user", userId: "bob" }, scope),
      describeProgramResource({ kind: "user", self: true }, scope)
    ].map((item) => item.frn);
    expect(frns).toEqual([
      "frn:fluxiq:platform::workspace/ws-1",
      "frn:fluxiq:ops:ws-1:program/database-manager",
      "frn:fluxiq:studio:ws-1:project/p1",
      "frn:fluxiq:studio:ws-1:project/p1/run/~722f31",
      "frn:fluxiq:studio:ws-1:schedule/s1",
      "frn:fluxiq:secrets:ws-1:key/k1",
      "frn:fluxiq:gateway:ws-1:browser/b1",
      "frn:fluxiq:iam:ws-1:user/bob",
      "frn:fluxiq:iam:ws-1:user/alice"
    ]);
    for (const frn of frns) expect(parseFluxIQResourceName(frn), frn).not.toBeNull();
  });

  it("takes a child's owner from its project, and gives no owner to a missing id", () => {
    expect(describeProgramResource({ kind: "project-child", projectId: "p1", child: "flow", childId: "f1" }, scope).owner).toEqual({ lookup: "project", id: "p1" });
    expect(describeProgramResource({ kind: "project-child", projectId: "p1", child: "flow", childId: undefined }, scope)).toEqual({ frn: "frn:fluxiq:studio:ws-1:project/p1/flow/~", owner: { userId: null } });
    expect(describeProgramResource({ kind: "project", projectId: null }, scope)).toEqual({ frn: "frn:fluxiq:studio:ws-1:project/~", owner: { userId: null } });
    expect(describeProgramResource({ kind: "user", userId: "bob" }, scope).owner).toEqual({ userId: "bob" });
  });

  it("fails closed on a ref of no known kind", () => {
    expect(parseFluxIQResourceName(describeProgramResource({ kind: "folder" } as unknown as ProgramResourceRef, scope).frn)).toBeNull();
  });
});
