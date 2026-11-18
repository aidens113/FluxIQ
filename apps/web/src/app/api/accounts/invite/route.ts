import { inviteMember, readAccountsBody, toAccountsHttp, withAccountRouteDeps } from "../server";

/** Invites a person by email with a role into the caller's workspace; the welcome link goes to their inbox only. */
export async function POST(request: Request) {
  return toAccountsHttp(await withAccountRouteDeps(async (deps) => {
    const read = await readAccountsBody(request);
    if (!read.ok) return read.refusal;
    return inviteMember(deps, read.body);
  }));
}
