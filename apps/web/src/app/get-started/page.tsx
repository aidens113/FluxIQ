import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentFluxIQUser } from "../../lib/auth";
import { GetStartedClient } from "./GetStartedClient";

/**
 * First-run setup: start the runtime, pair the browser extension, add a
 * DeepSeek key. Signed-in only, like every program page. The Suspense boundary
 * is required because the live sources read the query string
 * (`useProgramApi` calls `useSearchParams`).
 */
export default async function GetStartedPage() {
  if (!await currentFluxIQUser()) redirect("/");
  return <Suspense fallback={null}><GetStartedClient /></Suspense>;
}
