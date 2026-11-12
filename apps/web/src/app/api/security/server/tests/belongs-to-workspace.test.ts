import { describe, expect, it } from "vitest";
import { belongsToWorkspace } from "../belongs-to-workspace";
import { frnScope } from "../frn-scope";

describe("frnScope", () => {
  it("reads a workspace's FRN, the platform's own workspace FRN, a platform FRN, and refuses anything else", () => {
    expect(frnScope("frn:fluxiq:iam:ws-a:user/u1")).toEqual({ kind: "workspace", workspaceId: "ws-a", type: "user", id: "u1" });
    expect(frnScope("frn:fluxiq:studio:ws-a:project/p1/flow/f1")).toEqual({ kind: "workspace", workspaceId: "ws-a", type: "project", id: "p1/flow/f1" });
    expect(frnScope("frn:fluxiq:platform::workspace/ws-a")).toEqual({ kind: "workspace", workspaceId: "ws-a", type: "workspace", id: "ws-a" });
    expect(frnScope("frn:fluxiq:platform::account/a1")).toEqual({ kind: "platform", type: "account", id: "a1" });
    for (const value of ["", "frn:fluxiq:", "frn:fluxiq:iam:ws-a", "frn:fluxiq:iam:ws-a:user", "frn:fluxiq:iam:ws-a:user/", "frn:fluxiq::ws-a:user/u1", "frn:fluxiq:iam:ws-a:x:user/u1", "arn:aws:iam::1:user/u1"]) {
      expect([value, frnScope(value).kind]).toEqual([value, "unknown"]);
    }
  });
});

describe("belongsToWorkspace", () => {
  const record = (principal: string, resources: string[] = []) => ({ principal, resources });

  it("fails closed on another workspace or anything unreadable, whoever acted", () => {
    expect(belongsToWorkspace(record("frn:fluxiq:iam:ws-a:user/u1", ["frn:fluxiq:iam:ws-b:user/u2"]), "ws-a", "single")).toBe(false);
    expect(belongsToWorkspace(record("frn:fluxiq:iam:ws-a:user/u1", ["garbage"]), "ws-a", "single")).toBe(false);
    expect(belongsToWorkspace(record("garbage"), "ws-a", "single")).toBe(false);
    expect(belongsToWorkspace(record("frn:fluxiq:iam:ws-b:user/u2"), "ws-a", "single")).toBe(false);
    expect(belongsToWorkspace(record("in-process", ["frn:fluxiq:platform::workspace/ws-b"]), "ws-a", "single")).toBe(false);
  });

  it("takes this workspace's people's records, and the platform's when they name this workspace or there is only one", () => {
    expect(belongsToWorkspace(record("frn:fluxiq:iam:ws-a:role/r1", ["frn:fluxiq:platform::account/a1"]), "ws-a", "multi")).toBe(true);
    expect(belongsToWorkspace(record("platform-admin", ["frn:fluxiq:platform::account/a1"]), "ws-a", "multi")).toBe(false);
    expect(belongsToWorkspace(record("platform-admin", ["frn:fluxiq:platform::account/a1"]), "ws-a", "single")).toBe(true);
    expect(belongsToWorkspace(record("frn:fluxiq:iam::service-identity/web", ["frn:fluxiq:iam:ws-a:user/u1"]), "ws-a", "multi")).toBe(true);
  });
});
