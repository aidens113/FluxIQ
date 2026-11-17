import { submitConnectConsent } from "../../../../features/connect/server";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  return submitConnectConsent(request);
}
