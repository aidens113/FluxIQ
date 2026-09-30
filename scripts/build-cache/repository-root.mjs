// This checkout's root: the directory two levels above this file. Every
// registry path is relative to it, and every API accepts an override so tests
// can point the cache at a scratch repository.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
