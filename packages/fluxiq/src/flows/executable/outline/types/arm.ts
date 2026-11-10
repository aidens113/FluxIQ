import type { OutlineStep } from "./step.ts";

/** One way on out of a step, in the words it is shown under, with the port it leaves by. */
export type OutlineArm = { words: string; port?: string; steps: OutlineStep[] };
