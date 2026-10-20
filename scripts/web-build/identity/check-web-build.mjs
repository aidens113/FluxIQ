// The last command of `web:build` (`scripts/build-cache/steps.mjs`): fails the
// step when the panel `next build` just wrote embeds Core's unstamped runtime
// identity, so the build cache never stamps such a build. Run in `apps/web`;
// an argument names another web directory.

import path from "node:path";
import { assertStampedRuntimeIdentity } from "./assert-stamped-identity.mjs";

const webDirectory = path.resolve(process.argv[2] ?? process.cwd());
try {
  const { checked } = await assertStampedRuntimeIdentity(webDirectory);
  console.log(`Runtime build identity is stamped: no placeholder in ${checked} server files.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
