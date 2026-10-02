import path from "node:path";

/**
 * Where every step of a run is written, or nothing.
 *
 * `FLUXIQ_LLM_STEP_LOG_DIR` must name an absolute directory. Unset, empty or
 * relative, the step log is off and every hook returns at once without
 * touching the disk: a relative path would land wherever the process happened
 * to start, which is never where a debugger looks.
 */
export function automationStudioLlmStepLogDirectory(env: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  const directory = env.FLUXIQ_LLM_STEP_LOG_DIR;
  if (!directory || !path.isAbsolute(directory)) return undefined;
  return path.normalize(directory);
}
