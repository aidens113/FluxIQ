"use client";

import { RouteErrorSurface } from "../../RouteErrorSurface";

export default function ProgramError(props: { error: Error & { digest?: string }; reset(): void }) {
  return <RouteErrorSurface {...props} title="Program could not be loaded" description="This program encountered an unexpected route error. Retry without losing the current URL, or return to Programs." />;
}
