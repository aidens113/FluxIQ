import type { Role } from "../types";

export const adminRole: Role = {
  id: "admin",
  permissions: [
    "programs.read",
    "programs.write",
    "flows.write",
    "runtime.control",
    "compute.control",
    "identity.manage",
    "data.manage"
  ]
};

export const viewerRole: Role = {
  id: "viewer",
  permissions: ["programs.read"]
};

export const defaultRoles: Role[] = [adminRole, viewerRole];
