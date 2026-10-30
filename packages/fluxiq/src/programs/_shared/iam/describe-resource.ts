import { formatFluxIQResourceName, type IamService } from "@fluxiq/contracts/iam";
import { iamProgramFrn, iamWorkspaceFrn } from "../../../platform/iam/frn/index.ts";
import { programIamIdSegment } from "./id-segment.ts";
import { programOwnedRefId } from "./owned-ref-id.ts";
import type { ProgramOwnedResourceKind, ProgramResourceRef } from "./types.ts";

/**
 * One resource ref as the registry evaluates it: its FRN and where its owner
 * comes from.
 *
 * - `owner: { lookup }`: ask the owner resolver of `kind` about the raw `id`;
 * - `owner: { userId }`: known without a lookup (a user owns its own user
 *   FRN; the workspace, a program and any resource with a missing id have
 *   none, which is `null`). `userId` is already an encoded segment.
 */
export type ProgramDescribedResource = {
  frn: string;
  owner: { lookup: ProgramOwnedResourceKind; id: string } | { userId: string | null };
};

/** Where refs are evaluated: the workspace, the registration's program, and the calling user. */
export type ProgramResourceScope = {
  workspaceId: string;
  programId: string;
  actorUserId: string;
};

const NO_OWNER = Object.freeze({ userId: null });

// The service and FRN resource type of each owned kind (plan, Resources). A
// connected client is the `gateway` service's resource type of that name in
// the frozen FRN shape.
const OWNED_SERVICE: Readonly<Record<ProgramOwnedResourceKind, IamService>> = { project: "studio", schedule: "studio", key: "secrets", client: "gateway" };
const OWNED_TYPE: Readonly<Record<ProgramOwnedResourceKind, string>> = { project: "project", schedule: "schedule", key: "key", client: "browser" };

function frn(service: IamService, workspaceId: string, resourceType: string, resourceId: string): string {
  return formatFluxIQResourceName({ service, workspaceId, resourceType, resourceId });
}

function owned(kind: ProgramOwnedResourceKind, value: unknown, scope: ProgramResourceScope): ProgramDescribedResource {
  const id = programIamIdSegment(value);
  return { frn: frn(OWNED_SERVICE[kind], scope.workspaceId, OWNED_TYPE[kind], id.segment), owner: id.raw === null ? NO_OWNER : { lookup: kind, id: id.raw } };
}

/**
 * The FRN a ref names, with every id encoded (`programIamIdSegment`), and its
 * owner's source. A child of a project is named under its project and owned by
 * the project's owner; a child or project whose id is missing has no owner. A
 * ref of no known kind (a malformed custom `of`) yields a string that is not
 * an FRN, which the evaluator denies for every principal: it fails closed.
 */
export function describeProgramResource(ref: ProgramResourceRef, scope: ProgramResourceScope): ProgramDescribedResource {
  const ownedRef = programOwnedRefId(ref);
  if (ownedRef !== null) return owned(ownedRef.kind, ownedRef.value, scope);
  switch (ref.kind) {
    case "workspace":
      return { frn: iamWorkspaceFrn(scope.workspaceId), owner: NO_OWNER };
    case "program":
      return { frn: iamProgramFrn(scope.workspaceId, scope.programId), owner: NO_OWNER };
    case "project-child": {
      const project = programIamIdSegment(ref.projectId);
      const child = programIamIdSegment(ref.childId);
      const name = frn("studio", scope.workspaceId, "project", `${project.segment}/${ref.child}/${child.segment}`);
      return { frn: name, owner: project.raw === null || child.raw === null ? NO_OWNER : { lookup: "project", id: project.raw } };
    }
    case "user": {
      const id = programIamIdSegment("self" in ref ? scope.actorUserId : ref.userId);
      return { frn: frn("iam", scope.workspaceId, "user", id.segment), owner: { userId: id.raw === null ? null : id.segment } };
    }
    default:
      return { frn: "frn:fluxiq:unknown-resource", owner: NO_OWNER };
  }
}
