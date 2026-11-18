import { revokeConnectToken } from "../../../../features/connect/server";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  return revokeConnectToken(request);
}
