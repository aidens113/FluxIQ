import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    include: [
      "src/lib/login-attempts.test.ts",
      "src/lib/program-route.test.ts",
      "src/features/programs/shared-ui.test.tsx",
      "src/features/automation-studio/model/project-artifacts.test.ts"
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/login-attempts.ts", "src/lib/program-route.ts"],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage/quality",
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 }
    }
  }
});
