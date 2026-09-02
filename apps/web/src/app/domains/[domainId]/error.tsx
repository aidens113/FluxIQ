"use client";

import { RouteErrorSurface } from "../../RouteErrorSurface";

export default function DomainError(props: { error: Error & { digest?: string }; reset(): void }) {
  return <RouteErrorSurface {...props} title="Domain could not be loaded" description="The domain directory is temporarily unavailable. Retry or return to Programs." />;
}
