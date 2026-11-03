import { defineConfig } from "vitest/config";

// The chat's tests build real markup on `testing/fake-dom.ts`, in Node, so no
// browser environment is configured. `fluxiq/ui` resolves through the package's
// exports to Core's built `dist`, as it does for every other client.
export default defineConfig({
  test: {
    passWithNoTests: true
  }
});
