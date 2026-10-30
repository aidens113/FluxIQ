import type { IamResource } from "../../../platform/iam/index.ts";
import type { ProgramApiResponse } from "../api.ts";
import type { ProgramIamGate, ProgramIamRequest } from "./program-iam-gate.ts";
import type { ProgramEndpointListFilter } from "./types.ts";

/** What one successful list response is filtered with. */
export type ProgramListFilterInput = {
  list: ProgramEndpointListFilter;
  /** The endpoint's action, which decides each item unless `list.itemAction` names another. */
  action: string;
  programId: string;
  /** The resource the call itself was decided on (its first). */
  listScope: IamResource;
  response: ProgramApiResponse;
};

/**
 * Keeps the items of a list response the caller may `itemAction`, through
 * `IamRequestAuthorizer.filter`: one audit row when the full-access grant
 * covers the scope and every item, otherwise one per item. The response is
 * returned untouched when nothing was dropped, so a caller who may see every
 * item gets exactly the handler's payload.
 */
export async function filterProgramList(gate: ProgramIamGate, request: ProgramIamRequest, input: ProgramListFilterInput): Promise<ProgramApiResponse> {
  const items = input.list.items(input.response.payload);
  const resources = await gate.resources(request, items.map((item) => input.list.ref(item)), input.programId);
  const pairs = items.map((item, index) => ({ item, resource: resources[index] ?? { frn: "frn:fluxiq:unknown-resource" } }));
  const kept = request.authorizer.filter(input.list.itemAction ?? input.action, pairs, (pair) => pair.resource, input.listScope);
  if (kept.length === items.length) return input.response;
  return { ...input.response, payload: input.list.replace(input.response.payload, kept.map((pair) => pair.item)) };
}
