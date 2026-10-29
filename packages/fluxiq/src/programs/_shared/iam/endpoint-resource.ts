import type { ProgramApiRequest } from "../api.ts";
import type { ProgramEndpointResource, ProgramProjectChildKind, ProgramResourceRef } from "./types.ts";

function field(request: ProgramApiRequest, name: string): unknown {
  const payload = request.payload;
  return payload !== null && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>)[name] : undefined;
}

function fixed(types: readonly string[], ref: ProgramResourceRef): ProgramEndpointResource {
  return { types, of: () => ref };
}

/**
 * Builders for a registration's `resource`, reading the named payload fields
 * (raw: the registry encodes them and never widens on a missing one). Use the
 * one that matches what the handler actually reads: if the handler acts on
 * `payload.projectId`, the resource is `project("projectId")`.
 *
 * - `workspace()`: top-level creates and lists, actions on no specific resource;
 * - `program()`: every `ops` endpoint;
 * - `project(field)`: an action on, or a create or list inside, one project;
 * - `projectChild(child, childField, projectField)`: an action on one flow,
 *   recording, run or dataset of a project;
 * - `key(field)`, `schedule(field)`, `client(field)`: an owned resource by id
 *   (`client` is a connected client, the `gateway` FRN type `browser`);
 * - `user(field)`: an Identity Access user named by the payload;
 *   `selfUser()`: the caller's own user;
 * - `custom(types, of)`: anything else (several resources, a field that
 *   depends on another); keep `of` pure.
 */
export const endpointResource = Object.freeze({
  workspace: (): ProgramEndpointResource => fixed(["*"], { kind: "workspace" }),
  program: (): ProgramEndpointResource => fixed(["program"], { kind: "program" }),
  project: (projectField = "projectId"): ProgramEndpointResource => ({
    types: ["project"],
    of: (request) => ({ kind: "project", projectId: field(request, projectField) })
  }),
  projectChild: (child: ProgramProjectChildKind, childField: string, projectField = "projectId"): ProgramEndpointResource => ({
    types: [`project/${child}`],
    of: (request) => ({ kind: "project-child", projectId: field(request, projectField), child, childId: field(request, childField) })
  }),
  schedule: (scheduleField = "scheduleId"): ProgramEndpointResource => ({
    types: ["schedule"],
    of: (request) => ({ kind: "schedule", scheduleId: field(request, scheduleField) })
  }),
  key: (keyField = "keyId"): ProgramEndpointResource => ({
    types: ["key"],
    of: (request) => ({ kind: "key", keyId: field(request, keyField) })
  }),
  client: (clientField = "clientId"): ProgramEndpointResource => ({
    types: ["browser"],
    of: (request) => ({ kind: "client", clientId: field(request, clientField) })
  }),
  user: (userField = "userId"): ProgramEndpointResource => ({
    types: ["user"],
    of: (request) => ({ kind: "user", userId: field(request, userField) })
  }),
  selfUser: (): ProgramEndpointResource => fixed(["user"], { kind: "user", self: true }),
  custom: (types: readonly string[], of: ProgramEndpointResource["of"]): ProgramEndpointResource => ({ types, of })
});
