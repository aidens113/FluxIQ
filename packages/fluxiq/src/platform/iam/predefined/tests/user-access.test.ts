import { describe, expect, it } from "vitest";
import { compileIamPolicySet, evaluateIamRequest } from "../../evaluate/index.ts";
import { iamPrincipalFrn, iamWorkspaceFrn } from "../../frn/index.ts";
import type { IamPrincipal } from "../../types.ts";
import { IAM_USER_ACCESS } from "../index.ts";

const WS = "ws-1";
const ALICE: IamPrincipal = { type: "user", id: "alice", workspaceId: WS, frn: iamPrincipalFrn("user", WS, "alice") };
const compiled = compileIamPolicySet({ identity: [IAM_USER_ACCESS], guardrails: [], sessions: [], boundary: null }, ALICE, WS);
const decide = (action: string, frn: string, ownerId?: string) => evaluateIamRequest(compiled, ALICE, action, [{ frn, ...(ownerId === undefined ? {} : { ownerId }) }], { workspaceId: WS, origin: "panel", currentTimeMs: 0 }).decision;

describe("FluxIQUserAccess filtered workspace lists", () => {
  it("allows the filtered project list on the workspace FRN, whose items then need OwnData", () => {
    expect(decide("studio:Projects", iamWorkspaceFrn(WS))).toBe("allow");
    expect(decide("studio:Projects", "frn:fluxiq:studio:ws-1:project/p1", "alice")).toBe("allow");
    expect(decide("studio:Projects", "frn:fluxiq:studio:ws-1:project/p1", "bob")).toBe("deny");
  });

  it("grants nothing else on the workspace FRN", () => {
    expect(decide("studio:Snapshot", iamWorkspaceFrn(WS))).toBe("deny");
    expect(decide("studio:GetFlow", iamWorkspaceFrn(WS))).toBe("deny");
    expect(decide("iam:Snapshot", iamWorkspaceFrn(WS))).toBe("deny");
  });
});
