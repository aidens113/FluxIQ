import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    exclude: ["e2e/**", "**/node_modules/**", "**/dist/**"]
  }
});