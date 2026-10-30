import type { ProgramOwnedResourceKind, ProgramResourceRef } from "./types.ts";

/**
 * The owned kind a ref names and its raw id, for the kinds whose owner a
 * program records and resolves (`project`, `schedule`, `key`, `client`); null
 * for any other ref (the workspace, a program, a project's child, a user).
 */
export function programOwnedRefId(ref: ProgramResourceRef): { kind: ProgramOwnedResourceKind; value: unknown } | null {
  switch (ref.kind) {
    case "project":
      return { kind: "project", value: ref.projectId };
    case "schedule":
      return { kind: "schedule", value: ref.scheduleId };
    case "key":
      return { kind: "key", value: ref.keyId };
    case "client":
      return { kind: "client", value: ref.clientId };
    default:
      return null;
  }
}
