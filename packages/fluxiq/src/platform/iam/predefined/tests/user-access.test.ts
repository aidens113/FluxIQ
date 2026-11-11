import type { FluxIQRequestOrigin } from "@fluxiq/contracts/iam";
import { describe, expect, it } from "vitest";
import { compileIamPolicySet, evaluateIamRequest } from "../../evaluate/index.ts";
import { iamPrincipalFrn, iamWorkspaceFrn } from "../../frn/index.ts";
import type { IamPrincipal } from "../../types.ts";
import { IAM_USER_ACCESS } from "../index.ts";

const WS = "ws-1";
const ALICE: IamPrincipal = { type: "user", id: "alice", workspaceId: WS, frn: iamPrincipalFrn("user", WS, "alice") };
const compiled = compileIamPolicySet({ identity: [IAM_USER_ACCESS], guardrails: [], sessions: [], boundary: null }, ALICE, WS);
const decideFrom = (origin: FluxIQRequestOrigin, action: string, frn: string, ownerId?: string) =>
  evaluateIamRequest(compiled, ALICE, action, [{ frn, ...(ownerId === undefined ? {} : { ownerId }) }], { workspaceId: WS, origin, currentTimeMs: 0 }).decision;
const decide = (action: string, frn: string, ownerId?: string) => decideFrom("panel", action, frn, ownerId);

// The panel assistant's endpoints, which each act on the caller's own user
// (`endpointResource.selfUser()`): the user FRN, owned by that user.
const ALICE_USER = iamPrincipalFrn("user", WS, "alice");
const BOB_USER = iamPrincipalFrn("user", WS, "bob");
const PANEL_ASSISTANT_GRANTED = [
  "studio:ListPanelThreads",
  "studio:GetPanelThread",
  "studio:GetPanelThreadAttachment",
  "studio:OpenPanelThread",
  "studio:RenamePanelThread",
  "studio:DeletePanelThread",
  "studio:SendPanelMessage",
  "studio:AnswerPanelAsk",
  "studio:GetPanelAssistantAllowance"
];

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

describe("FluxIQUserAccess panel assistant", () => {
  it("allows each of the person's own panel actions on their own user FRN, from the panel", () => {
    for (const action of PANEL_ASSISTANT_GRANTED) expect(decide(action, ALICE_USER, "alice"), action).toBe("allow");
  });

  it("allows none of them on another person's user FRN, on the workspace FRN, or on Studio content", () => {
    for (const action of PANEL_ASSISTANT_GRANTED) {
      expect(decide(action, BOB_USER, "bob"), action).toBe("deny");
      expect(decide(action, iamWorkspaceFrn(WS)), action).toBe("deny");
      expect(decide(action, `frn:fluxiq:studio:${WS}:*`), action).toBe("deny");
    }
  });

  it("allows none of them from a paired browser's chat, or any origin but the panel", () => {
    for (const origin of ["extension-chat", "api", "schedule", "cli", "provisioning"] as const) {
      for (const action of PANEL_ASSISTANT_GRANTED) expect(decideFrom(origin, action, ALICE_USER, "alice"), `${origin} ${action}`).toBe("deny");
    }
  });

  it("withholds setting the allowance, which is one record for the whole workspace", () => {
    expect(decide("studio:SetPanelAssistantAllowance", ALICE_USER, "alice")).toBe("deny");
    expect(decide("studio:SetPanelAssistantAllowance", iamWorkspaceFrn(WS))).toBe("deny");
  });

  it("keeps a project-bound attachment to projects the person owns (OwnData)", () => {
    expect(decide("studio:GetPanelThreadAttachment", `frn:fluxiq:studio:${WS}:project/p1`, "alice")).toBe("allow");
    expect(decide("studio:GetPanelThreadAttachment", `frn:fluxiq:studio:${WS}:project/p2`, "bob")).toBe("deny");
  });
});
