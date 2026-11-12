import { toAccountsHttp } from "../../accounts/server";
import { auditRouteDepsForRequest, readActivity } from "../server";

/** The workspace's activity, newest first, a page at a time, for its owner or an administrator. */
export async function GET(request: Request) {
  const deps = await auditRouteDepsForRequest();
  if ("status" in deps) return toAccountsHttp(deps);
  return toAccountsHttp(await readActivity(deps, new URL(request.url).searchParams.get("cursor")));
}
