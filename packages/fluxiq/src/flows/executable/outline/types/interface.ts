import type { OutlinePort } from "./port.ts";

/** What the Flow needs and what it gives back. */
export type OutlineInterface = { needs: OutlinePort[]; gives: OutlinePort[] };
