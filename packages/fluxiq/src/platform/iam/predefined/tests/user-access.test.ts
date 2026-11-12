import type { FluxIQRequestOrigin } from "@fluxiq/contracts/iam";
import { describe, expect, it } from "vitest";
import { compileIamPolicySet, evaluateIamRequest } from "../../evaluate/index.ts";
import { iamPrincipalFrn, iamWorkspaceFrn } from "../../frn/index.ts";
import type { IamPrincipal } from "../../types.ts";
import { IAM_CONNECTED_SESSION, IAM_USER_ACCESS, IAM_USER_WORKSPACE_SETTING_READS } from "../index.ts";

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
  "studio:AnswerPanelAsk"
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

  it("allows none of them on another person's user FRN, on the workspace FRN or on Studio content", () => {
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

  it("reads the allowance on the workspace FRN, where it is one record for everyone, and in no other workspace or on a person's user", () => {
    expect(decide("studio:GetPanelAssistantAllowance", iamWorkspaceFrn(WS))).toBe("allow");
    expect(decide("studio:GetPanelAssistantAllowance", iamWorkspaceFrn("ws-2"))).toBe("deny");
    expect(decide("studio:GetPanelAssistantAllowance", ALICE_USER, "alice")).toBe("deny");
  });

  it("grants the workspace setting reads only from the panel, so a paired browser's credential is refused them by IAM", () => {
    for (const action of IAM_USER_WORKSPACE_SETTING_READS) {
      expect(decide(action, iamWorkspaceFrn(WS)), action).toBe("allow");
      for (const origin of ["extension-chat", "api", "schedule", "cli", "provisioning"] as const) expect(decideFrom(origin, action, iamWorkspaceFrn(WS)), `${origin} ${action}`).toBe("deny");
    }
  });

  it("withholds setting the allowance, which is one record for the whole workspace", () => {
    expect(decide("studio:SetPanelAssistantAllowance", ALICE_USER, "alice")).toBe("deny");
    expect(decide("studio:SetPanelAssistantAllowance", BOB_USER, "bob")).toBe("deny");
    expect(decide("studio:SetPanelAssistantAllowance", iamWorkspaceFrn(WS))).toBe("deny");
  });

  it("keeps a project-bound attachment to projects the person owns (OwnData)", () => {
    expect(decide("studio:GetPanelThreadAttachment", `frn:fluxiq:studio:${WS}:project/p1`, "alice")).toBe("allow");
    expect(decide("studio:GetPanelThreadAttachment", `frn:fluxiq:studio:${WS}:project/p2`, "bob")).toBe("deny");
  });
});

describe("FluxIQUserAccess and the workspace's assistant key", () => {
  // A key the workspace's owner made: `secrets:key/<id>`, owned by them.
  const OWNERS_KEY = `frn:fluxiq:secrets:${WS}:key/k1`;

  it("reads which provider and model the assistant uses, on the workspace FRN, and in no other workspace", () => {
    expect(decide("secrets:GetAssistantModel", iamWorkspaceFrn(WS))).toBe("allow");
    expect(decide("secrets:GetAssistantModel", iamWorkspaceFrn("ws-2"))).toBe("deny");
  });

  it("never changes the choice, and never reveals, lists, changes or uses another person's key directly", () => {
    expect(decide("secrets:SetAssistantModel", iamWorkspaceFrn(WS))).toBe("deny");
    for (const action of ["secrets:RevealKey", "secrets:UpdateKey", "secrets:RotateKey", "secrets:DeleteKey", "secrets:SetDefaultKey", "secrets:SetAssistantModel", "secrets:GetAssistantModel"]) {
      expect(decide(action, OWNERS_KEY, "owner"), action).toBe("deny");
    }
    // The database manager's record reads, which could read the key store's rows, are an operator program's.
    for (const action of ["ops:GetRecord", "ops:ListRecords"]) expect(decide(action, iamWorkspaceFrn(WS)), action).toBe("deny");
  });

  it("never makes a key the workspace's default, which `set-default-key` decides on the workspace FRN, while managing their own key", () => {
    expect(decide("secrets:SetDefaultKey", iamWorkspaceFrn(WS))).toBe("deny");
    const ALICES_KEY = `frn:fluxiq:secrets:${WS}:key/k2`;
    for (const action of ["secrets:RevealKey", "secrets:UpdateKey", "secrets:RotateKey", "secrets:DeleteKey"]) expect(decide(action, ALICES_KEY, "alice"), action).toBe("allow");
    expect(decide("secrets:CreateKey", iamWorkspaceFrn(WS))).toBe("allow");
  });
});

describe("FluxIQUserAccess self-only identity actions", () => {
  // The caller's own preferences and their own sign-in name in another case:
  // each endpoint declares the caller's own user and reads the person only
  // from the session, so the policy grants them there and nowhere else.
  const SELF_ONLY = ["iam:GetMyPreferences", "iam:UpdateMyPreferences", "iam:RecaseMyUsername"];
  const browser = compileIamPolicySet({ identity: [IAM_USER_ACCESS], guardrails: [], sessions: [IAM_CONNECTED_SESSION], boundary: null }, ALICE, WS);

  it("allows each on the person's own user FRN, and never on another person's or the workspace", () => {
    for (const action of SELF_ONLY) {
      expect(decide(action, ALICE_USER, "alice"), action).toBe("allow");
      expect(decide(action, BOB_USER, "bob"), action).toBe("deny");
      expect(decide(action, iamWorkspaceFrn(WS)), action).toBe("deny");
    }
    expect(decide("iam:UpdateUser", ALICE_USER, "alice")).toBe("deny");
  });

  it("refuses each, the re-case exactly as the preferences, to a paired browser's credential", () => {
    for (const action of SELF_ONLY) {
      expect(evaluateIamRequest(browser, ALICE, action, [{ frn: ALICE_USER, ownerId: "alice" }], { workspaceId: WS, origin: "extension-chat", currentTimeMs: 0 }).decision, action).toBe("deny");
    }
  });
});
