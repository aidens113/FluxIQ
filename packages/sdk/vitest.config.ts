import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@fluxiq\/contracts\/(.+)$/u, replacement: `${root}packages/contracts/src/$1.ts` },
      { find: "@fluxiq/sdk", replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)) }
    ]
  },
  test: { passWithNoTests: true }
});
