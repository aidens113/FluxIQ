import { describe, expect, it } from "vitest";
import { mayChooseWorkspaceKeys } from "../may-choose-workspace-keys";

// The roles' permissions as identity access defines them: hosted Owners and
// Administrators, and the local owner, are `admin`; every other hosted member
// and a local viewer are `viewer`.
const ADMIN = ["programs.read", "programs.write", "flows.write", "runtime.control", "compute.control", "identity.manage", "data.manage", "secrets.manage"];
const VIEWER = ["programs.read"];

describe("who may change the workspace's default key and the assistant's key", () => {
  it("is a role that manages secrets", () => {
    expect(mayChooseWorkspaceKeys(ADMIN)).toBe(true);
    expect(mayChooseWorkspaceKeys(["programs.read", "secrets.manage"])).toBe(true);
  });

  it("is never a viewer, nor a role without secrets.manage", () => {
    expect(mayChooseWorkspaceKeys(VIEWER)).toBe(false);
    expect(mayChooseWorkspaceKeys(["programs.read", "programs.write", "identity.manage"])).toBe(false);
    expect(mayChooseWorkspaceKeys([])).toBe(false);
  });
});
