// The decision audit keeps who changed what and every refused attempt, on
// every profile, and drops the allowed reads. The filter alone, the read
// actions a live-shaped registry yields, and a registry deciding through the
// filter under `local`, `self-hosted` and `service`.

import { describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiRegistrationParams } from "../../../../programs/_shared/api.ts";
import { endpointResource } from "../../../../programs/_shared/iam/index.ts";
import { IAM_ADMINISTRATOR_ACCESS, IAM_READ_ONLY_ACCESS } from "../../predefined/index.ts";
import type { IamAuditRecord, IamPolicySet } from "../../types.ts";
import { IamDecisionAuditFilter } from "../decision-filter.ts";
import { MemoryIamAuditSink } from "../memory-sink.ts";
import { iamReadActionsOf } from "../read-actions-of.ts";

function row(category: IamAuditRecord["category"], action: string): IamAuditRecord {
  return { category, time: 1, requestId: "r1", principal: "frn:fluxiq:iam:workspace-main:user/u1", action, resources: [], decision: category === "deny" ? "deny" : "allow", matched: "implicit", origin: "panel", ipPrefix: null };
}

describe("IamDecisionAuditFilter", () => {
  it("keeps every refusal and change and every allowed write, and drops only the allowed reads", () => {
    const kept = new MemoryIamAuditSink();
    const filter = new IamDecisionAuditFilter(kept, (action) => action === "studio:GetFlow");

    filter.record(row("allow", "studio:GetFlow"));
    filter.record(row("deny", "studio:GetFlow"));
    filter.record(row("allow", "studio:SaveFlow"));
    filter.record(row("deny", "studio:SaveFlow"));
    filter.record(row("iam-change", "iam:AttachUserPolicy"));

    expect(kept.records.map((record) => `${record.category} ${record.action}`)).toEqual([
      "deny studio:GetFlow",
      "allow studio:SaveFlow",
      "deny studio:SaveFlow",
      "iam-change iam:AttachUserPolicy"
    ]);
  });

  it("passes a kept record on unchanged, and keeps it when the read check throws", () => {
    const kept = new MemoryIamAuditSink();
    const record = row("allow", "studio:GetFlow");
    new IamDecisionAuditFilter(kept, () => { throw new Error("no catalog"); }).record(record);

    expect(kept.records).toEqual([record]);
    expect(kept.records[0]).toBe(record);
  });

  it("flushes the sink behind it", async () => {
    let flushed = 0;
    const filter = new IamDecisionAuditFilter({ record: () => undefined, flush: async () => void (flushed += 1) }, () => false);
    await filter.flush();
    expect(flushed).toBe(1);
  });
});

describe("iamReadActionsOf", () => {
  it("names the Read and List actions, by the catalog's own level rule", () => {
    expect(iamReadActionsOf([
      { programId: "automation-studio", endpoint: "get-flow", permission: "programs.read", classification: "read" },
      { programId: "automation-studio", endpoint: "list-flows", permission: "programs.read", classification: "read" },
      { programId: "automation-studio", endpoint: "save-flow", permission: "programs.write", classification: "authoring" },
      { programId: "identity-access", endpoint: "update-user", permission: "identity.manage", classification: "program-gated" }
    ])).toEqual(["studio:GetFlow", "studio:ListFlows"]);
  });

  it("keeps an action whose level cannot be told, and one any registration writes with", () => {
    expect(iamReadActionsOf([
      { programId: "automation-studio", endpoint: "get-odd", permission: "programs.read", classification: "unheard-of" },
      { programId: "docs", endpoint: "detail", permission: "programs.read", classification: "read" },
      { programId: "background-tasks", endpoint: "detail", permission: "programs.write", classification: "authoring" }
    ])).toEqual([]);
  });
});

const ok = () => ({ ok: true as const, payload: { done: true } });
const getFlow: ProgramApiRegistrationParams = {
  programId: "automation-studio",
  endpoint: "get-flow",
  permission: "programs.read",
  classification: "read",
  action: "studio:GetFlow",
  accessLevel: "Read",
  resource: endpointResource.workspace(),
  handler: ok
};
const saveFlow: ProgramApiRegistrationParams = { ...getFlow, endpoint: "save-flow", permission: "programs.write", classification: "authoring", action: "studio:SaveFlow", accessLevel: "Write" };
const VIEWER: ProgramApiActor = { sessionId: "s-viewer", userId: "viewer.one", roleId: "viewer", permissions: ["programs.read"] };
const WRITER: ProgramApiActor = { sessionId: "s-writer", userId: "writer.one", roleId: "operator", permissions: ["programs.read", "programs.write"] };
const NOBODY: ProgramApiActor = { sessionId: "s-nobody", userId: "nobody.one", roleId: "none", permissions: [] };

/** Under `service` the writer holds Administrator, the viewer Read Only, and nobody nothing. */
function servicePolicies(userId: string): IamPolicySet {
  const identity = userId === "writer.one" ? [IAM_ADMINISTRATOR_ACCESS] : userId === "viewer.one" ? [IAM_READ_ONLY_ACCESS] : [];
  return { identity, guardrails: [], sessions: [], boundary: null };
}

describe("a registry deciding through the filter", () => {
  for (const profile of ["local", "self-hosted", "service"] as const) {
    it(`${profile}: an allowed write and every refusal persist; an allowed read does not`, async () => {
      const kept = new MemoryIamAuditSink();
      const registry = new GlobalProgramApiRegistry({
        iam: {
          profile,
          audit: new IamDecisionAuditFilter(kept, (action) => reads.has(action)),
          ...(profile === "service" ? { source: { resolvePolicySet: async (principal) => servicePolicies(principal.id), getRole: async () => null } } : {})
        }
      });
      registry.register(getFlow);
      registry.register(saveFlow);
      const reads = new Set(iamReadActionsOf(registry.endpoints()));
      const call = (endpoint: string, who: ProgramApiActor) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: who, payload: {} });

      expect((await call("get-flow", WRITER)).ok).toBe(true);
      expect((await call("save-flow", WRITER)).ok).toBe(true);
      expect((await call("get-flow", NOBODY)).ok).toBe(false);
      expect((await call("save-flow", VIEWER)).ok).toBe(false);

      expect(kept.records.map((record) => `${record.decision} ${record.action} ${record.principal}`)).toEqual([
        "allow studio:SaveFlow frn:fluxiq:iam:workspace-main:user/writer.one",
        "deny studio:GetFlow frn:fluxiq:iam:workspace-main:user/nobody.one",
        "deny studio:SaveFlow frn:fluxiq:iam:workspace-main:user/viewer.one"
      ]);
    });
  }
});
