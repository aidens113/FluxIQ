import { appRouteIamContract } from "../../../../lib/app-route-iam";
import { withWorkspaceAccountRead } from "../../../../lib/workspaces/account-reads";
import { assembleAuditActivity, workspaceAuditSource } from "../server/audit-read";

const ROUTE = appRouteIamContract("GET", "/api/security/audit");

/** The workspace's activity, newest first, a page at a time, for its owner or an administrator. */
export async function GET(request: Request) {
  return withWorkspaceAccountRead(request, ROUTE, context => assembleAuditActivity(
    () => workspaceAuditSource(context), new URL(request.url).searchParams.get("cursor")
  ));
}
