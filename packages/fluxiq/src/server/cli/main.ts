#!/usr/bin/env node
// The `fluxiq` command, the package's `bin` (`fluxiq dev`).
import { runFluxIQCommand } from "./run-command.ts";

await runFluxIQCommand(process.argv.slice(2));
