import { accountRouteDepsForRequest, inviteMember, readAccountsBody, toAccountsHttp } from "../server";

/** Invites a person by email with a role; the welcome link goes to their inbox only. */
export async function POST(request: Request) {
  const deps = await accountRouteDepsForRequest();
  if ("status" in deps) return toAccountsHttp(deps);
  const read = await readAccountsBody(request);
  if (!read.ok) return toAccountsHttp(read.refusal);
  return toAccountsHttp(await inviteMember(deps, read.body));
}
