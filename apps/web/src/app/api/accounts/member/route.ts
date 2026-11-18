import { changeMember, readAccountsBody, toAccountsHttp, withAccountRouteDeps } from "../server";

/** One change to one person in the caller's workspace: role, turn off or on, remove, or resend or revoke their invite. */
export async function POST(request: Request) {
  return toAccountsHttp(await withAccountRouteDeps(async (deps) => {
    const read = await readAccountsBody(request);
    if (!read.ok) return read.refusal;
    return changeMember(deps, read.body);
  }));
}
