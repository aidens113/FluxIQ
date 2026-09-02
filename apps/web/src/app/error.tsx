"use client";

import { RouteErrorSurface } from "./RouteErrorSurface";

export default function RootError(props: { error: Error & { digest?: string }; reset(): void }) {
  return <RouteErrorSurface {...props} title="Programs could not be loaded" description="The framework directory failed to load. Retry the request or return to the Programs route." />;
}
