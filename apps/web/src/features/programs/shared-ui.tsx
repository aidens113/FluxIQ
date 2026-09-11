"use client";

// Compatibility entry point. The components themselves live one per file under
// ./components; this module only re-exports them so the roughly forty existing
// `.../programs/shared-ui` importers keep resolving. Import from
// ./components (or ../programs/components) in new code.
export * from "./components";
