import { accountRouteDepsForRequest, listMembers, toAccountsHttp } from "../server";

/** The workspace's people, their roles and invites, for an administrator. */
export async function GET() {
  const deps = await accountRouteDepsForRequest();
  if ("status" in deps) return toAccountsHttp(deps);
  return toAccountsHttp(await listMembers(deps));
}
