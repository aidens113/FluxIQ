import { accountRouteDepsForRequest, changeMember, readAccountsBody, toAccountsHttp } from "../server";

/** One change to one person: role, turn off or on, remove, or resend or revoke their invite. */
export async function POST(request: Request) {
  const deps = await accountRouteDepsForRequest();
  if ("status" in deps) return toAccountsHttp(deps);
  const read = await readAccountsBody(request);
  if (!read.ok) return toAccountsHttp(read.refusal);
  return toAccountsHttp(await changeMember(deps, read.body));
}
