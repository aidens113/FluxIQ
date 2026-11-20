import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const src = new URL("../../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");

function sourceFiles(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => {
    if (name === "tests" || name === "keys" || name === "node_modules") return [];
    return sourceFiles(join(path, name));
  });
}

const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*$/gmu, "$1");

it("has no PIN wording in the person-facing source of the security, accounts, devices, pairing and shell pages", () => {
  const roots = ["features/security", "features/accounts", "features/settings-page/connect", "features/panel-shell", "app/GlobalClientGatewayPairing.tsx", "app/connect", "app/not-found.tsx", "app/(panel)/security"];
  const files = roots.flatMap((root) => sourceFiles(join(src, root))).filter((file) => /\.(tsx?|css)$/u.test(file));
  expect(files.length).toBeGreaterThan(20);
  const hits = files.flatMap((file) => withoutComments(readFileSync(file, "utf8")).split("\n").filter((line) => /\bPIN\b|Set a PIN|Change your PIN/u.test(line)).map((line) => `${file}: ${line.trim()}`));
  expect(hits).toEqual([]);
});
