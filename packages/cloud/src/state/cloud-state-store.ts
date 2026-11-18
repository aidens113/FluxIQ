import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CloudPlan } from "../plan/index.ts";
import type { CloudState } from "./types.ts";

/** Reads, writes and removes a deployment's state file. Writes are atomic (temporary file, then rename). */
export const cloudStateStore = {
  async read(stateFile: string): Promise<CloudState | null> {
    let text: string;
    try { text = await readFile(stateFile, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    const value = JSON.parse(text) as CloudState;
    if (value.version !== 1) throw new Error(`${stateFile} was written by a newer @fluxiq/cloud (version ${String(value.version)}).`);
    return value;
  },

  async write(state: CloudState): Promise<void> {
    await mkdir(path.dirname(state.stateFile), { recursive: true });
    const temporary = `${state.stateFile}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporary, state.stateFile);
  },

  async remove(stateFile: string): Promise<void> {
    await rm(stateFile, { force: true });
  },

  /** The state of a deployment nothing has been recorded for: its paths, and empty lists. */
  empty(plan: CloudPlan): CloudState {
    return {
      version: 1, project: plan.project, profile: plan.config.profile, driver: plan.config.driver, phase: "absent",
      stateFile: plan.stateFile, bundleDir: plan.bundleDir, composeFiles: plan.composeFiles, composeEnvFile: plan.composeEnvFile,
      coreImage: plan.coreImage, publicOrigin: plan.publicOrigin, mailUi: plan.mailUi,
      generatedSecrets: [], pulledImages: [], networks: [], exportedCa: null, trustedCa: null
    };
  }
};
